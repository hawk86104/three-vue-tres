use crate::{
    dto::{
        BeginProjectExportRequestDto, BeginProjectExportResultDto, FinishProjectExportRequestDto,
        ProjectExportResultDto,
    },
    error::HostError,
    export_boundary::ParsedProjectExportChunk,
    state::AppService,
};
use project_io::{ProjectExportOperation, ProjectIoError, ProjectProfile, begin_project_export};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};
use uuid::Uuid;

pub(crate) struct ActiveProjectExport {
    pub(crate) session_id: Uuid,
    pub(crate) operation: Option<ProjectExportOperation>,
    export_id: Option<Uuid>,
    state: ExportOperationState,
}

pub(crate) type ActiveProjectExportHandle = Arc<Mutex<ActiveProjectExport>>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ExportOperationState {
    Starting,
    Active,
    FinishClaimed,
    CancelClaimed,
    Cancelled,
    Failed,
}

#[derive(Clone, Copy)]
enum ExportTerminalAction {
    Finish,
    Cancel,
}

enum ExportChunkTransition {
    Written,
    Terminal(ProjectIoError),
}

enum ExportCancelTransition {
    AlreadyCancelled,
    Owned(Result<(), ProjectIoError>),
}

impl ActiveProjectExport {
    fn starting(session_id: Uuid) -> Self {
        Self {
            session_id,
            operation: None,
            export_id: None,
            state: ExportOperationState::Starting,
        }
    }

    fn publish_operation(&mut self, operation: ProjectExportOperation) -> Result<(), HostError> {
        if self.state != ExportOperationState::Starting
            || self.operation.is_some()
            || self.export_id.is_some()
        {
            return Err(HostError::HostStateUnavailable);
        }
        self.export_id = Some(operation.export_id());
        self.operation = Some(operation);
        self.state = ExportOperationState::Active;
        Ok(())
    }

    fn identity(&self) -> (Uuid, Option<Uuid>) {
        (self.session_id, self.export_id)
    }

    fn write_chunk(
        &mut self,
        session_id: Uuid,
        export_id: Uuid,
        chunk_index: u64,
        bytes: &[u8],
    ) -> Result<ExportChunkTransition, HostError> {
        if self.session_id != session_id {
            return Err(HostError::ExportSessionMismatch);
        }
        if self.export_id != Some(export_id) || self.state != ExportOperationState::Active {
            return Err(HostError::ExportNotFound);
        }
        let result = self
            .operation
            .as_mut()
            .ok_or(HostError::HostStateUnavailable)?
            .write_chunk(chunk_index, bytes);
        match result {
            Ok(()) => Ok(ExportChunkTransition::Written),
            Err(error) => {
                self.state = ExportOperationState::Failed;
                drop(self.operation.take());
                Ok(ExportChunkTransition::Terminal(error))
            }
        }
    }

    fn take_operation_for_terminal(
        &mut self,
        action: ExportTerminalAction,
    ) -> Result<ProjectExportOperation, HostError> {
        if self.state != ExportOperationState::Active {
            return Err(HostError::ExportNotFound);
        }
        let operation = self
            .operation
            .take()
            .ok_or(HostError::HostStateUnavailable)?;
        self.state = match action {
            ExportTerminalAction::Finish => ExportOperationState::FinishClaimed,
            ExportTerminalAction::Cancel => ExportOperationState::CancelClaimed,
        };
        Ok(operation)
    }

    fn cancel_for_request(
        &mut self,
        session_id: Uuid,
        export_id: Uuid,
    ) -> Result<ExportCancelTransition, HostError> {
        if self.session_id != session_id {
            return Err(HostError::ExportSessionMismatch);
        }
        if self.export_id != Some(export_id) {
            return Err(HostError::ExportNotFound);
        }
        if self.state == ExportOperationState::Cancelled {
            return Ok(ExportCancelTransition::AlreadyCancelled);
        }
        let operation = self.take_operation_for_terminal(ExportTerminalAction::Cancel)?;
        let result = operation.cancel();
        self.state = if result.is_ok() {
            ExportOperationState::Cancelled
        } else {
            ExportOperationState::Failed
        };
        Ok(ExportCancelTransition::Owned(result))
    }

    fn cancel_for_close(&mut self, session_id: Uuid) -> Result<(), HostError> {
        if self.session_id != session_id {
            return Err(HostError::HostStateUnavailable);
        }
        let operation = self
            .take_operation_for_terminal(ExportTerminalAction::Cancel)
            .map_err(|_| HostError::HostStateUnavailable)?;
        let result = operation.cancel();
        self.state = if result.is_ok() {
            ExportOperationState::Cancelled
        } else {
            ExportOperationState::Failed
        };
        result.map_err(HostError::from)
    }
}

impl AppService {
    pub(crate) fn begin_project_export(
        &self,
        request: BeginProjectExportRequestDto,
    ) -> Result<BeginProjectExportResultDto, HostError> {
        let (session_id, project_id, snapshot_sequence, active_floor_id, preset) =
            request.into_native()?;
        let _operation_lease = self.session_operation_lease()?;
        let session = self.lookup_session(session_id)?;
        let session_guard = session
            .lock()
            .map_err(|_| HostError::SessionStateUnavailable)?;
        if !self.owns_session(session_id, &session)? {
            return Err(HostError::SessionNotFound);
        }
        let snapshot = session_guard.snapshot();
        if session_guard.manifest().profile != ProjectProfile::Showroom
            || session_guard.manifest().project_id != project_id
            || snapshot.project.profile != ProjectProfile::Showroom
            || snapshot.project.id != project_id
            || snapshot.sequence != snapshot_sequence
            || !snapshot
                .project
                .floors
                .iter()
                .any(|floor| floor.id == active_floor_id)
        {
            return Err(HostError::IpcInvalidRequest);
        }

        let handle = Arc::new(Mutex::new(ActiveProjectExport::starting(session_id)));
        {
            let mut exports = self.lock_project_exports()?;
            if exports.contains_key(&session_id) {
                return Err(HostError::ExportAlreadyActive);
            }
            exports.insert(session_id, handle.clone());
        }

        let operation = match begin_project_export(
            session_guard.project_path(),
            snapshot,
            active_floor_id,
            preset,
        ) {
            Ok(operation) => operation,
            Err(error) => {
                if !self.remove_project_export_if_same(session_id, &handle)? {
                    return Err(HostError::HostStateUnavailable);
                }
                return Err(error.into());
            }
        };
        let response = BeginProjectExportResultDto::from(&operation);
        let publication = handle
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)
            .and_then(|mut active| active.publish_operation(operation));
        if let Err(error) = publication {
            if !self.remove_project_export_if_same(session_id, &handle)? {
                return Err(HostError::HostStateUnavailable);
            }
            return Err(error);
        }
        Ok(response)
    }

    pub(crate) fn write_project_export_chunk(
        &self,
        request: ParsedProjectExportChunk<'_>,
    ) -> Result<(), HostError> {
        let _operation_lease = self.session_operation_lease()?;
        let handle = self.lookup_project_export_handle(request.session_id, request.export_id)?;
        let transition = {
            let mut active = handle.lock().map_err(|_| HostError::HostStateUnavailable)?;
            active.write_chunk(
                request.session_id,
                request.export_id,
                request.chunk_index,
                request.bytes,
            )?
        };
        match transition {
            ExportChunkTransition::Written => Ok(()),
            ExportChunkTransition::Terminal(error) => {
                if !self.remove_project_export_if_same(request.session_id, &handle)? {
                    return Err(HostError::HostStateUnavailable);
                }
                Err(error.into())
            }
        }
    }

    pub(crate) fn finish_project_export(
        &self,
        request: FinishProjectExportRequestDto,
    ) -> Result<ProjectExportResultDto, HostError> {
        let (session_id, export_id) = request.into_native()?;
        let _operation_lease = self.session_operation_lease()?;
        let handle = self.lookup_project_export_handle(session_id, export_id)?;
        let operation = take_operation_for_terminal(&handle, ExportTerminalAction::Finish)?;
        let result = operation.finish().map_err(HostError::from);
        if !self.remove_project_export_if_same(session_id, &handle)? {
            return Err(HostError::HostStateUnavailable);
        }
        result.map(ProjectExportResultDto::from)
    }

    pub(crate) fn cancel_project_export(
        &self,
        request: FinishProjectExportRequestDto,
    ) -> Result<(), HostError> {
        let (session_id, export_id) = request.into_native()?;
        let _operation_lease = self.session_operation_lease()?;
        if self.is_cancelled_project_export(session_id, export_id)? {
            return Ok(());
        }
        let handle = self.lookup_project_export_handle(session_id, export_id)?;
        let transition = cancel_project_export_handle(&handle, session_id, export_id)?;
        let ExportCancelTransition::Owned(result) = transition else {
            return Ok(());
        };
        let result = result.map_err(HostError::from);
        let marker_result = if result.is_ok() {
            self.last_cancelled_exports
                .lock()
                .map_err(|_| HostError::HostStateUnavailable)
                .map(|mut cancelled| {
                    cancelled.insert(session_id, export_id);
                })
        } else {
            Ok(())
        };
        if !self.remove_project_export_if_same(session_id, &handle)? {
            return Err(HostError::HostStateUnavailable);
        }
        result?;
        marker_result
    }

    pub(crate) fn cancel_and_wait_for_session_project_export(
        &self,
        session_id: Uuid,
    ) -> Result<(), HostError> {
        let handle = self.lock_project_exports()?.get(&session_id).cloned();
        let Some(handle) = handle else {
            return Ok(());
        };
        let result = {
            let mut active = handle.lock().map_err(|_| HostError::HostStateUnavailable)?;
            active.cancel_for_close(session_id)
        };
        if !self.remove_project_export_if_same(session_id, &handle)? {
            return Err(HostError::HostStateUnavailable);
        }
        self.wait_for_session_project_export_removal(session_id)?;
        result
    }

    pub(crate) fn cancel_and_wait_for_all_project_exports(&self) -> Result<(), HostError> {
        let session_ids = self
            .lock_project_exports()?
            .keys()
            .copied()
            .collect::<Vec<_>>();
        let mut first_failure = None;
        for session_id in session_ids {
            if let Err(error) = self.cancel_and_wait_for_session_project_export(session_id) {
                first_failure.get_or_insert(error);
            }
        }
        match first_failure {
            Some(error) => Err(error),
            None => self.wait_for_all_project_export_removal(),
        }
    }

    pub(crate) fn clear_last_cancelled_export(&self, session_id: Uuid) -> Result<(), HostError> {
        self.last_cancelled_exports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)?
            .remove(&session_id);
        Ok(())
    }

    fn is_cancelled_project_export(
        &self,
        session_id: Uuid,
        export_id: Uuid,
    ) -> Result<bool, HostError> {
        let cancelled = self
            .last_cancelled_exports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)?;
        if cancelled.get(&session_id) == Some(&export_id) {
            return Ok(true);
        }
        if cancelled
            .iter()
            .any(|(owner, candidate)| *owner != session_id && *candidate == export_id)
        {
            return Err(HostError::ExportSessionMismatch);
        }
        Ok(false)
    }

    fn lookup_project_export_handle(
        &self,
        session_id: Uuid,
        export_id: Uuid,
    ) -> Result<ActiveProjectExportHandle, HostError> {
        let (requested, handles) = {
            let exports = self.lock_project_exports()?;
            (
                exports.get(&session_id).cloned(),
                exports.values().cloned().collect::<Vec<_>>(),
            )
        };

        if let Some(handle) = requested.as_ref() {
            let (owner, active_export_id) = active_project_export_identity(handle)?;
            if owner != session_id {
                return Err(HostError::HostStateUnavailable);
            }
            if active_export_id == Some(export_id) {
                return Ok(handle.clone());
            }
        }
        for handle in handles {
            if requested
                .as_ref()
                .is_some_and(|requested| Arc::ptr_eq(requested, &handle))
            {
                continue;
            }
            let (owner, active_export_id) = active_project_export_identity(&handle)?;
            if active_export_id == Some(export_id) {
                return if owner == session_id {
                    Err(HostError::HostStateUnavailable)
                } else {
                    Err(HostError::ExportSessionMismatch)
                };
            }
        }
        Err(HostError::ExportNotFound)
    }

    fn remove_project_export_if_same(
        &self,
        session_id: Uuid,
        expected: &ActiveProjectExportHandle,
    ) -> Result<bool, HostError> {
        let mut exports = self.lock_project_exports()?;
        let matches = exports
            .get(&session_id)
            .is_some_and(|actual| Arc::ptr_eq(actual, expected));
        if matches {
            exports.remove(&session_id);
            self.project_exports_changed.notify_all();
        }
        Ok(matches)
    }

    fn wait_for_session_project_export_removal(&self, session_id: Uuid) -> Result<(), HostError> {
        let mut exports = self.lock_project_exports()?;
        while exports.contains_key(&session_id) {
            exports = self
                .project_exports_changed
                .wait(exports)
                .map_err(|_| HostError::HostStateUnavailable)?;
        }
        Ok(())
    }

    fn wait_for_all_project_export_removal(&self) -> Result<(), HostError> {
        let mut exports = self.lock_project_exports()?;
        while !exports.is_empty() {
            exports = self
                .project_exports_changed
                .wait(exports)
                .map_err(|_| HostError::HostStateUnavailable)?;
        }
        Ok(())
    }

    fn lock_project_exports(
        &self,
    ) -> Result<MutexGuard<'_, HashMap<Uuid, ActiveProjectExportHandle>>, HostError> {
        self.project_exports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)
    }
}

fn take_operation_for_terminal(
    handle: &ActiveProjectExportHandle,
    action: ExportTerminalAction,
) -> Result<ProjectExportOperation, HostError> {
    handle
        .lock()
        .map_err(|_| HostError::HostStateUnavailable)?
        .take_operation_for_terminal(action)
}

fn cancel_project_export_handle(
    handle: &ActiveProjectExportHandle,
    session_id: Uuid,
    export_id: Uuid,
) -> Result<ExportCancelTransition, HostError> {
    handle
        .lock()
        .map_err(|_| HostError::HostStateUnavailable)?
        .cancel_for_request(session_id, export_id)
}

fn active_project_export_identity(
    handle: &ActiveProjectExportHandle,
) -> Result<(Uuid, Option<Uuid>), HostError> {
    Ok(handle
        .lock()
        .map_err(|_| HostError::HostStateUnavailable)?
        .identity())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export_boundary::ParsedProjectExportChunk;
    use project_io::{CreateProjectRequest, ProjectExportPreset, ProjectIoError, create_project};
    use std::fs;

    #[test]
    fn failed_chunk_terminalizes_a_cloned_handle_before_registry_removal() {
        let root = tempfile::tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Terminal Handle".into(),
            profile: ProjectProfile::Showroom,
        })
        .unwrap();
        let operation = begin_project_export(
            &opened.project_path,
            &opened.snapshot,
            opened.snapshot.project.floors[0].id,
            ProjectExportPreset::FullHd,
        )
        .unwrap();
        let export_id = operation.export_id();
        let session_id = Uuid::new_v4();
        let mut active = ActiveProjectExport::starting(session_id);
        active.publish_operation(operation).unwrap();
        let handle = Arc::new(Mutex::new(active));
        let service = AppService::default();
        service
            .project_exports
            .lock()
            .unwrap()
            .insert(session_id, handle.clone());

        let error = service
            .write_project_export_chunk(ParsedProjectExportChunk {
                session_id,
                export_id,
                chunk_index: 1,
                bytes: &[1, 2, 3, 0xff],
            })
            .unwrap_err();

        assert!(matches!(
            error,
            HostError::ProjectIo(ProjectIoError::ExportChunkOutOfOrder)
        ));
        assert!(
            handle.lock().unwrap().operation.is_none(),
            "the per-operation lock must publish terminal failure before registry removal"
        );
        assert!(matches!(
            take_operation_for_terminal(&handle, ExportTerminalAction::Finish),
            Err(HostError::ExportNotFound)
        ));
        assert!(matches!(
            cancel_project_export_handle(&handle, session_id, export_id),
            Err(HostError::ExportNotFound)
        ));
    }

    #[test]
    fn cancelled_handle_returns_explicit_idempotent_transition_before_external_marker() {
        let root = tempfile::tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Idempotent Handle".into(),
            profile: ProjectProfile::Showroom,
        })
        .unwrap();
        let operation = begin_project_export(
            &opened.project_path,
            &opened.snapshot,
            opened.snapshot.project.floors[0].id,
            ProjectExportPreset::FullHd,
        )
        .unwrap();
        let export_id = operation.export_id();
        let session_id = Uuid::new_v4();
        let mut active = ActiveProjectExport::starting(session_id);
        active.publish_operation(operation).unwrap();
        let handle = Arc::new(Mutex::new(active));

        let first = cancel_project_export_handle(&handle, session_id, export_id).unwrap();

        assert!(matches!(first, ExportCancelTransition::Owned(Ok(()))));
        {
            let active = handle.lock().unwrap();
            assert_eq!(active.state, ExportOperationState::Cancelled);
            assert!(active.operation.is_none());
        }
        let exports = opened.project_path.join("exports");
        let entries_before_second = fs::read_dir(&exports)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();

        let second = cancel_project_export_handle(&handle, session_id, export_id).unwrap();

        assert!(matches!(second, ExportCancelTransition::AlreadyCancelled));
        let active = handle.lock().unwrap();
        assert_eq!(active.state, ExportOperationState::Cancelled);
        assert!(active.operation.is_none());
        let entries_after_second = fs::read_dir(exports)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();
        assert_eq!(entries_after_second, entries_before_second);
    }
}
