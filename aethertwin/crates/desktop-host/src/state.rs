pub(crate) use crate::{boundary::validate_session_id, error::HostError};
use crate::{
    boundary::{require_recovery_confirmation, validate_absolute_path, validate_create_request},
    dto::{
        CancelProjectAssetImportDto, CheckpointProjectDto, CloseProjectDto, CommitProjectDto,
        CreateProjectDto, ImportProgressDto, ImportProjectAssetDto, ImportResultDto,
        NativeImportProjectAsset, OpenProjectDto, RecoverProjectDto,
    },
    error::{NativeLogSink, SanitizedLogRecord, StderrLogSink, present},
    export_registry::ActiveProjectExportHandle,
};
use asset_io::{
    AssetIssue, AssetIssueRecord, AssetResolver, AssetSessionOwner, ImportObserver, ImportProgress,
    ImportRequest, ImportStage, VerifiedAsset, import_project_asset,
};
use project_io::{
    CheckpointResult, CommitBatch, OpenedProject, ProjectIoError, ProjectManifest, ProjectSession,
    ProjectSnapshot, SaveState, create_project, open_session, validate_commit_batch,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::{
    collections::HashMap,
    fmt,
    ops::Deref,
    sync::{
        Arc, Condvar, Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard,
        atomic::{AtomicBool, Ordering},
    },
};
use uuid::Uuid;

pub(crate) struct SessionEntry {
    cache_owner: AssetSessionOwner,
    session: Mutex<ProjectSession>,
}

impl SessionEntry {
    pub(crate) fn new(session: ProjectSession) -> Self {
        Self {
            cache_owner: AssetSessionOwner::new(),
            session: Mutex::new(session),
        }
    }

    pub(crate) fn cache_owner(&self) -> AssetSessionOwner {
        self.cache_owner
    }
}

impl Deref for SessionEntry {
    type Target = Mutex<ProjectSession>;

    fn deref(&self) -> &Self::Target {
        &self.session
    }
}

pub(crate) type SessionHandle = Arc<SessionEntry>;

struct ActiveAssetImport {
    session_id: Uuid,
    cancellation: Arc<AtomicBool>,
}

pub(crate) struct PreparedAssetImport {
    session_id: Uuid,
    operation_id: Uuid,
    role: asset_io::AssetImportRole,
    source_path: std::path::PathBuf,
    session: SessionHandle,
    cancellation: Arc<AtomicBool>,
}

impl fmt::Debug for PreparedAssetImport {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PreparedAssetImport")
            .field("session_id", &self.session_id)
            .field("operation_id", &self.operation_id)
            .finish_non_exhaustive()
    }
}

pub(crate) trait ProgressSink: Send + Sync {
    fn send(&self, progress: ImportProgressDto) -> Result<(), HostError>;
}

impl PreparedAssetImport {
    #[cfg(test)]
    pub(crate) fn session_id(&self) -> Uuid {
        self.session_id
    }

    pub(crate) fn operation_id(&self) -> Uuid {
        self.operation_id
    }

    pub(crate) fn cancellation(&self) -> Arc<AtomicBool> {
        self.cancellation.clone()
    }

    pub(crate) fn run(self, sink: &dyn ProgressSink) -> Result<ImportResultDto, HostError> {
        let session = self
            .session
            .lock()
            .map_err(|_| HostError::SessionStateUnavailable)?;
        let request = ImportRequest {
            project_root: session.project_path().to_owned(),
            source: self.source_path,
            operation_id: self.operation_id,
            role: self.role,
        };
        let observer = ForwardingImportObserver::new(self.operation_id, self.cancellation, sink);
        let result = import_project_asset(request, &observer);
        drop(session);
        match observer.take_failure()? {
            Some(error) => Err(error),
            None => result.map(ImportResultDto::from).map_err(HostError::from),
        }
    }
}

pub(crate) struct ProgressTracker {
    operation_id: Uuid,
    previous: Option<ImportProgress>,
}

impl ProgressTracker {
    pub(crate) fn new(operation_id: Uuid) -> Self {
        Self {
            operation_id,
            previous: None,
        }
    }

    pub(crate) fn accept(
        &mut self,
        progress: ImportProgress,
    ) -> Result<ImportProgressDto, HostError> {
        if progress.operation_id != self.operation_id {
            return Err(HostError::AssetProgressOperationMismatch);
        }
        if progress.completed_bytes > progress.total_bytes
            || (progress.stage == ImportStage::Complete
                && progress.completed_bytes != progress.total_bytes)
        {
            return Err(HostError::AssetProgressNotMonotonic);
        }
        if let Some(previous) = self.previous {
            if previous.total_bytes != progress.total_bytes
                || previous.completed_bytes > progress.completed_bytes
                || import_stage_index(previous.stage) > import_stage_index(progress.stage)
            {
                return Err(HostError::AssetProgressNotMonotonic);
            }
        }
        self.previous = Some(progress);
        Ok(ImportProgressDto {
            operation_id: progress.operation_id.to_string(),
            stage: progress.stage.as_str().into(),
            completed_bytes: progress.completed_bytes,
            total_bytes: progress.total_bytes,
        })
    }
}

const fn import_stage_index(stage: ImportStage) -> u8 {
    match stage {
        ImportStage::Capture => 0,
        ImportStage::Validate => 1,
        ImportStage::Hash => 2,
        ImportStage::Publish => 3,
        ImportStage::Complete => 4,
    }
}
struct ForwardingImportObserver<'a> {
    tracker: Mutex<ProgressTracker>,
    cancellation: Arc<AtomicBool>,
    sink: &'a dyn ProgressSink,
    failure: Mutex<Option<HostError>>,
}

impl<'a> ForwardingImportObserver<'a> {
    fn new(operation_id: Uuid, cancellation: Arc<AtomicBool>, sink: &'a dyn ProgressSink) -> Self {
        Self {
            tracker: Mutex::new(ProgressTracker::new(operation_id)),
            cancellation,
            sink,
            failure: Mutex::new(None),
        }
    }

    fn take_failure(&self) -> Result<Option<HostError>, HostError> {
        self.failure
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)
            .map(|mut failure| failure.take())
    }

    fn fail(&self, error: HostError) {
        self.cancellation.store(true, Ordering::Release);
        if let Ok(mut failure) = self.failure.lock() {
            if failure.is_none() {
                *failure = Some(error);
            }
        }
    }
}

impl ImportObserver for ForwardingImportObserver<'_> {
    fn progress(&self, progress: ImportProgress) {
        let converted = self
            .tracker
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)
            .and_then(|mut tracker| tracker.accept(progress))
            .and_then(|progress| self.sink.send(progress));
        if let Err(error) = converted {
            self.fail(error);
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancellation.load(Ordering::Acquire)
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenedProjectDto {
    pub session_id: String,
    pub project_path: String,
    pub manifest: ProjectManifest,
    pub snapshot: ProjectSnapshot,
    pub recovered: bool,
    #[serde(default)]
    pub asset_issues: Vec<AssetIssueDto>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetIssueDto {
    pub asset_id: Uuid,
    pub issue: String,
}

pub struct AppService {
    pub(crate) sessions: Mutex<HashMap<Uuid, SessionHandle>>,
    session_lifecycle_gate: RwLock<()>,
    asset_imports: Mutex<HashMap<Uuid, ActiveAssetImport>>,
    asset_imports_changed: Condvar,
    pub(crate) project_exports: Mutex<HashMap<Uuid, ActiveProjectExportHandle>>,
    pub(crate) project_exports_changed: Condvar,
    pub(crate) last_cancelled_exports: Mutex<HashMap<Uuid, Uuid>>,
    pub(crate) asset_resolver: AssetResolver,
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
            asset_imports: Mutex::new(HashMap::new()),
            asset_imports_changed: Condvar::new(),
            project_exports: Mutex::new(HashMap::new()),
            project_exports_changed: Condvar::new(),
            last_cancelled_exports: Mutex::new(HashMap::new()),
            asset_resolver: AssetResolver::default(),
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
    pub(crate) fn prepare_asset_import(
        &self,
        request: ImportProjectAssetDto,
    ) -> Result<PreparedAssetImport, HostError> {
        let request: NativeImportProjectAsset = request.into_native()?;
        let _operation_lease = self.session_operation_lease()?;
        let mut imports = self
            .asset_imports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)?;
        if imports.contains_key(&request.operation_id) {
            return Err(HostError::AssetImportOperationExists);
        }
        let session = self.lookup_session(request.session_id)?;
        let cancellation = Arc::new(AtomicBool::new(false));
        imports.insert(
            request.operation_id,
            ActiveAssetImport {
                session_id: request.session_id,
                cancellation: cancellation.clone(),
            },
        );
        Ok(PreparedAssetImport {
            session_id: request.session_id,
            operation_id: request.operation_id,
            role: request.role,
            source_path: request.source_path,
            session,
            cancellation,
        })
    }

    pub(crate) fn cancel_asset_import(
        &self,
        request: CancelProjectAssetImportDto,
    ) -> Result<(), HostError> {
        let (session_id, operation_id) = request.into_native()?;
        let imports = self
            .asset_imports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)?;
        let active = imports
            .get(&operation_id)
            .filter(|active| active.session_id == session_id)
            .ok_or(HostError::AssetImportOperationNotFound)?;
        active.cancellation.store(true, Ordering::Release);
        Ok(())
    }

    pub(crate) fn finish_asset_import(
        &self,
        operation_id: Uuid,
        cancellation: &Arc<AtomicBool>,
    ) -> Result<bool, HostError> {
        let mut imports = self
            .asset_imports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)?;
        let matches = imports
            .get(&operation_id)
            .is_some_and(|active| Arc::ptr_eq(&active.cancellation, cancellation));
        if matches {
            imports.remove(&operation_id);
            self.asset_imports_changed.notify_all();
        }
        Ok(matches)
    }

    #[cfg(test)]
    pub(crate) fn active_asset_import_count(&self) -> Result<usize, HostError> {
        self.asset_imports
            .lock()
            .map(|imports| imports.len())
            .map_err(|_| HostError::HostStateUnavailable)
    }

    fn wait_for_session_asset_imports(
        &self,
        session_id: Uuid,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<Uuid, ActiveAssetImport>>, HostError> {
        let mut imports = self
            .asset_imports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)?;
        while imports
            .values()
            .any(|active| active.session_id == session_id)
        {
            imports = self
                .asset_imports_changed
                .wait(imports)
                .map_err(|_| HostError::HostStateUnavailable)?;
        }
        Ok(imports)
    }

    fn wait_for_all_asset_imports(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<Uuid, ActiveAssetImport>>, HostError> {
        let mut imports = self
            .asset_imports
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)?;
        while !imports.is_empty() {
            imports = self
                .asset_imports_changed
                .wait(imports)
                .map_err(|_| HostError::HostStateUnavailable)?;
        }
        Ok(imports)
    }

    pub fn session_count(&self) -> Result<usize, crate::NativeErrorDto> {
        self.finish("session_count", self.registry_len())
    }

    pub(crate) fn resolve_asset_ids(
        &self,
        session_id: Uuid,
        asset_id: Uuid,
    ) -> Result<Arc<VerifiedAsset>, AssetIssue> {
        self.resolve_asset_ids_inner(session_id, asset_id, || {})
    }

    #[cfg(test)]
    pub(crate) fn resolve_asset_ids_with_lookup_hook<F: FnOnce()>(
        &self,
        session_id: Uuid,
        asset_id: Uuid,
        after_lookup: F,
    ) -> Result<Arc<VerifiedAsset>, AssetIssue> {
        self.resolve_asset_ids_inner(session_id, asset_id, after_lookup)
    }

    fn resolve_asset_ids_inner<F: FnOnce()>(
        &self,
        session_id: Uuid,
        asset_id: Uuid,
        after_lookup: F,
    ) -> Result<Arc<VerifiedAsset>, AssetIssue> {
        let session = self
            .lookup_session(session_id)
            .map_err(|error| match error {
                HostError::SessionNotFound => AssetIssue::NotFound,
                _ => AssetIssue::Unavailable,
            })?;
        after_lookup();
        let session_guard = session.lock().map_err(|_| AssetIssue::Unavailable)?;
        let owns_session = self
            .owns_session(session_id, &session)
            .map_err(|_| AssetIssue::Unavailable)?;
        if !owns_session {
            return Err(AssetIssue::NotFound);
        }
        self.asset_resolver.resolve_for_owner(
            session_id,
            session.cache_owner(),
            session_guard.project_path(),
            session_guard.snapshot(),
            asset_id,
        )
    }

    #[cfg(test)]
    pub(crate) fn resolve_asset(
        &self,
        session_id: &str,
        asset_id: Uuid,
    ) -> Result<Arc<VerifiedAsset>, AssetIssue> {
        let session_id = Uuid::parse_str(session_id).map_err(|_| AssetIssue::NotFound)?;
        self.resolve_asset_ids(session_id, asset_id)
    }

    pub fn asset_issues(
        &self,
        session_id: &str,
    ) -> Result<Vec<AssetIssueRecord>, crate::NativeErrorDto> {
        let result = (|| {
            let session_id = validate_session_id(session_id)?;
            let session = self.lookup_session(session_id)?;
            let session = session
                .lock()
                .map_err(|_| HostError::SessionStateUnavailable)?;
            Ok(self.asset_resolver.preflight(
                session_id,
                session.project_path(),
                session.snapshot(),
            ))
        })();
        self.finish("asset_issues", result)
    }

    #[cfg(test)]
    pub(crate) fn cached_asset_count(
        &self,
        session_id: &str,
    ) -> Result<usize, crate::NativeErrorDto> {
        let result = (|| {
            let session_id = validate_session_id(session_id)?;
            self.asset_resolver
                .cached_count(session_id)
                .map_err(|_| HostError::HostStateUnavailable)
        })();
        self.finish("cached_asset_count", result)
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
                .and_then(|session| self.track_session_with_preflight(session));
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
            self.track_session_with_preflight(session)
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
            self.track_session_with_preflight(session)
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

    fn track_session_with_preflight(
        &self,
        session: ProjectSession,
    ) -> Result<OpenedProjectDto, HostError> {
        self.asset_resolver
            .invalidate_project(session.project_path());
        let issues = self
            .asset_resolver
            .preflight(Uuid::nil(), session.project_path(), session.snapshot())
            .into_iter()
            .map(|issue| AssetIssueDto {
                asset_id: issue.asset_id,
                issue: issue.issue.code().into(),
            })
            .collect();
        let mut opened = self.track_session(session)?;
        opened.asset_issues = issues;
        Ok(opened)
    }

    pub(crate) fn finalize_closed_session(
        &self,
        session_id: Uuid,
        session: &SessionHandle,
    ) -> Result<(), HostError> {
        if self.remove_if_same(session_id, session)? {
            self.asset_resolver.invalidate_session(session_id);
        } else {
            self.asset_resolver
                .invalidate_owner(session_id, session.cache_owner());
        }
        Ok(())
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
            let snapshot = {
                let mut session = session
                    .lock()
                    .map_err(|_| HostError::SessionStateUnavailable)?;
                session.commit(batch)?;
                session.snapshot().clone()
            };
            self.asset_resolver.reconcile_session(session_id, &snapshot);
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
            let _asset_imports = self.wait_for_all_asset_imports()?;
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
                        if let Err(error) = self.finalize_closed_session(session_id, &session) {
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
            let _asset_imports = self.wait_for_session_asset_imports(session_id)?;
            let session = self.lookup_session(session_id)?;
            {
                session
                    .lock()
                    .map_err(|_| HostError::SessionStateUnavailable)?
                    .close()?;
            }
            self.finalize_closed_session(session_id, &session)?;
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
    if session.manifest().schema_version != 3 || session.snapshot().schema_version != 3 {
        return Err(HostError::IpcInvalidRequest);
    }
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
        asset_issues: Vec::new(),
    })
}

#[cfg(test)]
mod tests;
