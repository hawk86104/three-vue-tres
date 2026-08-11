use crate::{
    dto::{
        BeginProjectExportRequestDto, BeginProjectExportResultDto, FinishProjectExportRequestDto,
        ProjectExportResultDto,
    },
    error::HostError,
    export_boundary::ParsedProjectExportChunk,
    state::AppService,
};
use project_io::{ProjectExportOperation, ProjectProfile, begin_project_export};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};
use uuid::Uuid;

pub(crate) struct ActiveProjectExport {
    pub(crate) session_id: Uuid,
    pub(crate) operation: Option<ProjectExportOperation>,
}

pub(crate) type ActiveProjectExportHandle = Arc<Mutex<ActiveProjectExport>>;

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

        let handle = Arc::new(Mutex::new(ActiveProjectExport {
            session_id,
            operation: None,
        }));
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
            .map(|mut active| active.operation = Some(operation));
        if publication.is_err() {
            if !self.remove_project_export_if_same(session_id, &handle)? {
                return Err(HostError::HostStateUnavailable);
            }
            return Err(HostError::HostStateUnavailable);
        }
        Ok(response)
    }

    pub(crate) fn write_project_export_chunk(
        &self,
        request: ParsedProjectExportChunk<'_>,
    ) -> Result<(), HostError> {
        let handle = self.lookup_project_export_handle(request.session_id, request.export_id)?;
        let write_result = {
            let mut active = handle.lock().map_err(|_| HostError::HostStateUnavailable)?;
            if active.session_id != request.session_id {
                return Err(HostError::ExportSessionMismatch);
            }
            let operation = active.operation.as_mut().ok_or(HostError::ExportNotFound)?;
            if operation.export_id() != request.export_id {
                return Err(HostError::ExportNotFound);
            }
            operation.write_chunk(request.chunk_index, request.bytes)
        };
        match write_result {
            Ok(()) => Ok(()),
            Err(error) => {
                self.remove_project_export_if_same(request.session_id, &handle)?;
                Err(error.into())
            }
        }
    }

    pub(crate) fn finish_project_export(
        &self,
        request: FinishProjectExportRequestDto,
    ) -> Result<ProjectExportResultDto, HostError> {
        let (session_id, export_id) = request.into_native()?;
        let handle = self.lookup_project_export_handle(session_id, export_id)?;
        let operation = {
            let mut active = handle.lock().map_err(|_| HostError::HostStateUnavailable)?;
            if active.session_id != session_id {
                return Err(HostError::ExportSessionMismatch);
            }
            let operation = active.operation.take().ok_or(HostError::ExportNotFound)?;
            if operation.export_id() != export_id {
                active.operation = Some(operation);
                return Err(HostError::ExportNotFound);
            }
            operation
        };
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
        if self.is_cancelled_project_export(session_id, export_id)? {
            return Ok(());
        }
        let handle = self.lookup_project_export_handle(session_id, export_id)?;
        let operation = {
            let mut active = handle.lock().map_err(|_| HostError::HostStateUnavailable)?;
            if active.session_id != session_id {
                return Err(HostError::ExportSessionMismatch);
            }
            let operation = active.operation.take().ok_or(HostError::ExportNotFound)?;
            if operation.export_id() != export_id {
                active.operation = Some(operation);
                return Err(HostError::ExportNotFound);
            }
            operation
        };
        let result = operation.cancel().map_err(HostError::from);
        if !self.remove_project_export_if_same(session_id, &handle)? {
            return Err(HostError::HostStateUnavailable);
        }
        result?;
        self.last_cancelled_exports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)?
            .insert(session_id, export_id);
        Ok(())
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

    fn lock_project_exports(
        &self,
    ) -> Result<MutexGuard<'_, HashMap<Uuid, ActiveProjectExportHandle>>, HostError> {
        self.project_exports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)
    }
}

fn active_project_export_identity(
    handle: &ActiveProjectExportHandle,
) -> Result<(Uuid, Option<Uuid>), HostError> {
    let active = handle.lock().map_err(|_| HostError::HostStateUnavailable)?;
    Ok((
        active.session_id,
        active
            .operation
            .as_ref()
            .map(ProjectExportOperation::export_id),
    ))
}
