pub(crate) use crate::{boundary::validate_session_id, error::HostError};
use crate::{
    boundary::{require_recovery_confirmation, validate_absolute_path, validate_create_request},
    dto::{
        CheckpointProjectDto, CloseProjectDto, CommitProjectDto, CreateProjectDto, OpenProjectDto,
        RecoverProjectDto,
    },
    error::{NativeLogSink, SanitizedLogRecord, StderrLogSink, present},
};
use project_io::{
    CheckpointResult, CommitBatch, OpenedProject, ProjectManifest, ProjectSession, ProjectSnapshot,
    ProjectIoError, SaveState, create_project, open_session, validate_commit_batch,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard,
        atomic::{AtomicBool, Ordering},
    },
};
use uuid::Uuid;

pub(crate) type SessionHandle = Arc<Mutex<ProjectSession>>;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedProjectDto {
    pub session_id: String,
    pub project_path: String,
    pub manifest: ProjectManifest,
    pub snapshot: ProjectSnapshot,
    pub recovered: bool,
}

pub struct AppService {
    pub(crate) sessions: Mutex<HashMap<Uuid, SessionHandle>>,
    session_lifecycle_gate: RwLock<()>,
    session_shutdown_complete: AtomicBool,
    log_sink: Arc<dyn NativeLogSink>,
}

impl Default for AppService {
    fn default() -> Self {
        Self::with_log_sink(Arc::new(StderrLogSink))
    }
}

impl AppService {
    pub fn with_log_sink(log_sink: Arc<dyn NativeLogSink>) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            session_lifecycle_gate: RwLock::new(()),
            session_shutdown_complete: AtomicBool::new(false),
            log_sink,
        }
    }

    pub(crate) fn session_operation_lease(&self) -> Result<RwLockReadGuard<'_, ()>, HostError> {
        let lease = self
            .session_lifecycle_gate
            .read()
            .map_err(|_| HostError::HostStateUnavailable)?;
        if self.session_shutdown_complete.load(Ordering::Acquire) {
            return Err(HostError::HostStateUnavailable);
        }
        Ok(lease)
    }

    fn session_shutdown_lease(&self) -> Result<RwLockWriteGuard<'_, ()>, HostError> {
        self.session_lifecycle_gate
            .write()
            .map_err(|_| HostError::HostStateUnavailable)
    }

    pub(crate) fn decode_payload<T: DeserializeOwned>(
        &self,
        operation: &'static str,
        payload: Option<Value>,
    ) -> Result<T, crate::NativeErrorDto> {
        let result = payload
            .ok_or(HostError::IpcInvalidRequest)
            .and_then(|value| {
                serde_json::from_value(value).map_err(|_| HostError::IpcInvalidRequest)
            });
        self.finish(operation, result)
    }

    pub(crate) fn render_error(
        &self,
        operation: &'static str,
        error: HostError,
    ) -> crate::NativeErrorDto {
        let presentation = present(error);
        let log_ref = format!("native-{}", Uuid::new_v4());
        self.log_sink.record(&SanitizedLogRecord {
            log_ref: log_ref.clone(),
            operation: operation.into(),
            code: presentation.code.into(),
        });
        crate::NativeErrorDto {
            code: presentation.code.into(),
            message: presentation.message.into(),
            details: presentation.details,
            log_ref,
        }
    }

    pub fn session_count(&self) -> Result<usize, crate::NativeErrorDto> {
        self.finish("session_count", self.registry_len())
    }

    pub fn create_project(
        &self,
        request: CreateProjectDto,
    ) -> Result<OpenedProjectDto, crate::NativeErrorDto> {
        self.create_project_for("create_project", request)
    }

    pub(crate) fn create_project_for(
        &self,
        operation: &'static str,
        request: CreateProjectDto,
    ) -> Result<OpenedProjectDto, crate::NativeErrorDto> {
        let result = (|| {
            let _operation_lease = self.session_operation_lease()?;
            let request = validate_create_request(request)?;
            let created = create_project(request)?;
            let publication = open_session(&created.project_path, false)
                .map_err(HostError::from)
                .and_then(|session| self.track_session(session));
            finalize_created_publication(&created, publication)
        })();
        self.finish(operation, result)
    }

    pub fn open_project(
        &self,
        request: OpenProjectDto,
    ) -> Result<OpenedProjectDto, crate::NativeErrorDto> {
        self.open_project_for("open_project", request)
    }

    pub(crate) fn open_project_for(
        &self,
        operation: &'static str,
        request: OpenProjectDto,
    ) -> Result<OpenedProjectDto, crate::NativeErrorDto> {
        let result = (|| {
            let _operation_lease = self.session_operation_lease()?;
            let path = validate_absolute_path(&request.path)?;
            let session = open_session(&path, request.recover_stale_lock)?;
            self.track_session(session)
        })();
        self.finish(operation, result)
    }

    pub fn recover_project(
        &self,
        request: RecoverProjectDto,
    ) -> Result<OpenedProjectDto, crate::NativeErrorDto> {
        self.recover_project_for("recover_project", request)
    }

    pub(crate) fn recover_project_for(
        &self,
        operation: &'static str,
        request: RecoverProjectDto,
    ) -> Result<OpenedProjectDto, crate::NativeErrorDto> {
        let result = (|| {
            let _operation_lease = self.session_operation_lease()?;
            let path = validate_absolute_path(&request.path)?;
            require_recovery_confirmation(request.confirm)?;
            let session = open_session(&path, true)?;
            self.track_session(session)
        })();
        self.finish(operation, result)
    }

    pub fn commit_project(
        &self,
        session_id: &str,
        batch: CommitBatch,
    ) -> Result<(), crate::NativeErrorDto> {
        self.commit_project_for("commit_project", session_id, batch)
    }

    pub(crate) fn commit_request(
        &self,
        operation: &'static str,
        request: CommitProjectDto,
    ) -> Result<(), crate::NativeErrorDto> {
        match request.into_native() {
            Ok((session_id, batch)) => self.commit_project_for(operation, &session_id, batch),
            Err(error) => Err(self.render_error(operation, error)),
        }
    }

    fn commit_project_for(
        &self,
        operation: &'static str,
        session_id: &str,
        batch: CommitBatch,
    ) -> Result<(), crate::NativeErrorDto> {
        let result = (|| {
            let session_id = validate_session_id(session_id)?;
            validate_commit_batch(&batch).map_err(|_| HostError::IpcInvalidRequest)?;
            let session = self.lookup_session(session_id)?;
            session
                .lock()
                .map_err(|_| HostError::SessionStateUnavailable)?
                .commit(batch)?;
            Ok(())
        })();
        self.finish(operation, result)
    }

    pub fn checkpoint_project(
        &self,
        session_id: &str,
    ) -> Result<CheckpointResult, crate::NativeErrorDto> {
        let snapshot = match (|| {
            let session = self.lookup_session(validate_session_id(session_id)?)?;
            let snapshot = session
                .lock()
                .map_err(|_| HostError::SessionStateUnavailable)?
                .snapshot()
                .clone();
            Ok::<_, HostError>(snapshot)
        })() {
            Ok(snapshot) => snapshot,
            Err(error) => return Err(self.render_error("checkpoint_project", error)),
        };
        self.checkpoint_project_for("checkpoint_project", session_id, snapshot)
    }

    pub(crate) fn checkpoint_request(
        &self,
        operation: &'static str,
        request: CheckpointProjectDto,
    ) -> Result<CheckpointResult, crate::NativeErrorDto> {
        match request.into_native() {
            Ok((session_id, snapshot)) => {
                self.checkpoint_project_for(operation, &session_id, snapshot)
            }
            Err(error) => Err(self.render_error(operation, error)),
        }
    }

    fn checkpoint_project_for(
        &self,
        operation: &'static str,
        session_id: &str,
        snapshot: ProjectSnapshot,
    ) -> Result<CheckpointResult, crate::NativeErrorDto> {
        let result = (|| {
            let session = self.lookup_session(validate_session_id(session_id)?)?;
            let checkpoint = session
                .lock()
                .map_err(|_| HostError::SessionStateUnavailable)?
                .checkpoint(snapshot)
                .map_err(|error| match error {
                    ProjectIoError::RecoveryFailed => HostError::SessionRecoveryRequired,
                    other => HostError::from(other),
                })?;
            Ok(checkpoint)
        })();
        self.finish(operation, result)
    }

    pub fn close_project(&self, session_id: &str) -> Result<(), crate::NativeErrorDto> {
        self.close_project_for("close_project", session_id)
    }

    pub fn close_all(&self) -> Result<(), crate::NativeErrorDto> {
        let result = (|| {
            let _shutdown_lease = self.session_shutdown_lease()?;
            if self.session_shutdown_complete.load(Ordering::Acquire) {
                return if self.registry_len()? == 0 {
                    Ok(())
                } else {
                    Err(HostError::HostStateUnavailable)
                };
            }
            let sessions = self.registry_snapshot()?;
            let mut first_failure = None;
            for (session_id, session) in sessions {
                let close_result = session
                    .lock()
                    .map_err(|_| HostError::SessionStateUnavailable)
                    .and_then(|mut session| session.close().map_err(HostError::from));
                match close_result {
                    Ok(()) => {
                        if let Err(error) = self.remove_if_same(session_id, &session) {
                            first_failure.get_or_insert(error);
                        }
                    }
                    Err(error) => {
                        first_failure.get_or_insert(error);
                    }
                }
            }
            match first_failure {
                Some(error) => Err(error),
                None if self.registry_len()? == 0 => {
                    self.session_shutdown_complete
                        .store(true, Ordering::Release);
                    Ok(())
                }
                None => Err(HostError::HostStateUnavailable),
            }
        })();
        self.finish("close_all", result)
    }

    pub(crate) fn close_request(
        &self,
        operation: &'static str,
        request: CloseProjectDto,
    ) -> Result<(), crate::NativeErrorDto> {
        self.close_project_for(operation, &request.into_session_id())
    }

    fn close_project_for(
        &self,
        operation: &'static str,
        session_id: &str,
    ) -> Result<(), crate::NativeErrorDto> {
        let result = (|| {
            let session_id = validate_session_id(session_id)?;
            let session = self.lookup_session(session_id)?;
            {
                session
                    .lock()
                    .map_err(|_| HostError::SessionStateUnavailable)?
                    .close()?;
            }
            self.remove_if_same(session_id, &session)?;
            Ok(())
        })();
        self.finish(operation, result)
    }

    fn finish<T>(
        &self,
        operation: &'static str,
        result: Result<T, HostError>,
    ) -> Result<T, crate::NativeErrorDto> {
        result.map_err(|error| self.render_error(operation, error))
    }
}

#[cfg(test)]
pub(crate) fn finalize_created_session(
    created: &OpenedProject,
    open_result: Result<ProjectSession, project_io::ProjectIoError>,
) -> Result<ProjectSession, HostError> {
    finalize_created_publication(created, open_result.map_err(HostError::from))
}

fn finalize_created_publication<T>(
    created: &OpenedProject,
    result: Result<T, HostError>,
) -> Result<T, HostError> {
    result.map_err(|source| HostError::ProjectCreatedSessionUnavailable {
        project_id: created.manifest.project_id,
        name: created.manifest.name.clone(),
        profile: created.manifest.profile,
        reason_code: crate::error::host_error_code(&source),
    })
}

pub(crate) fn opened_project_dto(
    session_id: Uuid,
    session: &ProjectSession,
) -> Result<OpenedProjectDto, HostError> {
    let project_path = session
        .project_path()
        .to_str()
        .ok_or(HostError::IpcInvalidRequest)?
        .to_owned();
    Ok(OpenedProjectDto {
        session_id: session_id.to_string(),
        project_path,
        manifest: session.manifest().clone(),
        snapshot: session.snapshot().clone(),
        recovered: session.save_state() == SaveState::Recovered,
    })
}

#[cfg(test)]
mod tests;
