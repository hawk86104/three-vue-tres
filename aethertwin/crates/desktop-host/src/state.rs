use project_io::{
    CommitBatch, CreateProjectRequest, ProjectIoError, ProjectManifest, ProjectProfile,
    ProjectSession, ProjectSnapshot, SaveState, create_project, open_session,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateProjectDto {
    pub parent: String,
    pub name: String,
    pub profile: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenProjectDto {
    pub path: String,
    pub recover_stale_lock: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoverProjectDto {
    pub path: String,
    pub confirm: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedProjectDto {
    pub session_id: String,
    pub project_path: String,
    pub manifest: ProjectManifest,
    pub snapshot: ProjectSnapshot,
    pub recovered: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeErrorDto {
    pub code: String,
    pub message: String,
    pub details: Value,
    pub log_ref: String,
}

impl NativeErrorDto {
    fn request(code: &str, message: &str, field: &str) -> Self {
        Self::new(code, message, json!({ "field": field }))
    }

    fn session_not_found() -> Self {
        Self::new(
            "SESSION_NOT_FOUND",
            "项目会话不存在或已关闭",
            json!({ "retryable": false }),
        )
    }

    fn state_unavailable() -> Self {
        Self::new(
            "HOST_STATE_UNAVAILABLE",
            "桌面服务状态暂时不可用",
            json!({ "retryable": true }),
        )
    }

    fn new(code: &str, message: &str, details: Value) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details,
            log_ref: format!("native-{}", Uuid::new_v4()),
        }
    }
}

impl From<ProjectIoError> for NativeErrorDto {
    fn from(source: ProjectIoError) -> Self {
        let code = source.code();
        let message = match code {
            "INVALID_PROJECT_NAME" => "项目名称无效",
            "PROJECT_ALREADY_EXISTS" => "同名项目已存在",
            "INVALID_PROJECT_STRUCTURE" => "项目结构无效或不完整",
            "UNSUPPORTED_SCHEMA_VERSION" => "项目版本高于当前应用支持范围",
            "MANIFEST_DATABASE_MISMATCH" => "项目清单与数据库不一致",
            "DATABASE_ERROR" => "项目数据库操作失败",
            "PROJECT_LOCKED" => "项目正在由另一个会话使用",
            "STALE_PROJECT_LOCK" => "项目需要确认后恢复",
            "INVALID_RESOURCE_PATH" => "项目资源路径无效",
            "RECOVERY_FAILED" => "项目恢复校验失败",
            "FILESYSTEM_ERROR" => "项目文件操作失败",
            _ => "桌面服务发生未知错误",
        };
        let details = json!({
            "recoveryRequired": code == "STALE_PROJECT_LOCK",
            "retryable": matches!(
                code,
                "DATABASE_ERROR" | "FILESYSTEM_ERROR" | "PROJECT_LOCKED"
            )
        });
        Self::new(code, message, details)
    }
}

#[derive(Default)]
pub struct AppService {
    sessions: Mutex<HashMap<Uuid, ProjectSession>>,
}

impl AppService {
    pub fn session_count(&self) -> Result<usize, NativeErrorDto> {
        Ok(self.lock_sessions()?.len())
    }

    pub fn create_project(
        &self,
        request: CreateProjectDto,
    ) -> Result<OpenedProjectDto, NativeErrorDto> {
        let request = validate_create_request(request)?;
        let mut sessions = self.lock_sessions()?;
        let created = create_project(request).map_err(NativeErrorDto::from)?;
        let session = open_session(&created.project_path, false).map_err(NativeErrorDto::from)?;
        track_session(&mut sessions, session)
    }

    pub fn open_project(
        &self,
        request: OpenProjectDto,
    ) -> Result<OpenedProjectDto, NativeErrorDto> {
        let path = validate_absolute_path(&request.path)?;
        let mut sessions = self.lock_sessions()?;
        let session =
            open_session(&path, request.recover_stale_lock).map_err(NativeErrorDto::from)?;
        track_session(&mut sessions, session)
    }

    pub fn recover_project(
        &self,
        request: RecoverProjectDto,
    ) -> Result<OpenedProjectDto, NativeErrorDto> {
        let path = validate_absolute_path(&request.path)?;
        if !request.confirm {
            return Err(ProjectIoError::StaleProjectLock.into());
        }
        let mut sessions = self.lock_sessions()?;
        let session = open_session(&path, true).map_err(NativeErrorDto::from)?;
        track_session(&mut sessions, session)
    }

    pub fn commit_project(
        &self,
        session_id: &str,
        batch: CommitBatch,
    ) -> Result<(), NativeErrorDto> {
        let session_id = validate_session_id(session_id)?;
        let mut sessions = self.lock_sessions()?;
        sessions
            .get_mut(&session_id)
            .ok_or_else(NativeErrorDto::session_not_found)?
            .commit(batch)
            .map_err(NativeErrorDto::from)
    }

    pub fn checkpoint_project(&self, session_id: &str) -> Result<ProjectManifest, NativeErrorDto> {
        let session_id = validate_session_id(session_id)?;
        let mut sessions = self.lock_sessions()?;
        sessions
            .get_mut(&session_id)
            .ok_or_else(NativeErrorDto::session_not_found)?
            .checkpoint()
            .map_err(NativeErrorDto::from)
    }

    pub fn close_project(&self, session_id: &str) -> Result<(), NativeErrorDto> {
        let session_id = validate_session_id(session_id)?;
        let mut sessions = self.lock_sessions()?;
        sessions
            .get_mut(&session_id)
            .ok_or_else(NativeErrorDto::session_not_found)?
            .close()
            .map_err(NativeErrorDto::from)?;
        sessions.remove(&session_id);
        Ok(())
    }

    fn lock_sessions(
        &self,
    ) -> Result<MutexGuard<'_, HashMap<Uuid, ProjectSession>>, NativeErrorDto> {
        self.sessions
            .lock()
            .map_err(|_| NativeErrorDto::state_unavailable())
    }
}

fn validate_create_request(
    request: CreateProjectDto,
) -> Result<CreateProjectRequest, NativeErrorDto> {
    let parent = validate_absolute_path(&request.parent)?;
    let profile = match request.profile.as_str() {
        "showroom" => ProjectProfile::Showroom,
        "market" => ProjectProfile::Market,
        _ => {
            return Err(NativeErrorDto::request(
                "INVALID_PROJECT_PROFILE",
                "项目类型无效",
                "profile",
            ));
        }
    };
    if request.name.is_empty() || request.name.contains('\0') {
        return Err(ProjectIoError::InvalidProjectName.into());
    }
    Ok(CreateProjectRequest {
        parent,
        name: request.name,
        profile,
    })
}

fn validate_absolute_path(value: &str) -> Result<PathBuf, NativeErrorDto> {
    if value.is_empty() || value.trim() != value || value.contains('\0') {
        return Err(invalid_path());
    }
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err(invalid_path());
    }
    Ok(path.to_owned())
}

fn invalid_path() -> NativeErrorDto {
    NativeErrorDto::request("INVALID_PROJECT_PATH", "项目路径无效", "path")
}

fn validate_session_id(value: &str) -> Result<Uuid, NativeErrorDto> {
    let parsed = Uuid::parse_str(value).map_err(|_| {
        NativeErrorDto::request("INVALID_SESSION_ID", "项目会话标识无效", "sessionId")
    })?;
    if parsed.hyphenated().to_string() != value {
        return Err(NativeErrorDto::request(
            "INVALID_SESSION_ID",
            "项目会话标识无效",
            "sessionId",
        ));
    }
    Ok(parsed)
}

fn track_session(
    sessions: &mut HashMap<Uuid, ProjectSession>,
    mut session: ProjectSession,
) -> Result<OpenedProjectDto, NativeErrorDto> {
    let Some(project_path) = session.project_path().to_str().map(str::to_owned) else {
        let _ = session.close();
        return Err(invalid_path());
    };
    let session_id = loop {
        let candidate = Uuid::new_v4();
        if !sessions.contains_key(&candidate) {
            break candidate;
        }
    };
    let opened = OpenedProjectDto {
        session_id: session_id.to_string(),
        project_path,
        manifest: session.manifest().clone(),
        snapshot: session.snapshot().clone(),
        recovered: session.save_state() == SaveState::Recovered,
    };
    sessions.insert(session_id, session);
    Ok(opened)
}

#[cfg(test)]
mod tests {
    use super::AppService;
    use std::panic::{AssertUnwindSafe, catch_unwind};

    #[test]
    fn poisoned_session_registry_returns_a_safe_error_instead_of_panicking() {
        let service = AppService::default();
        let _ = catch_unwind(AssertUnwindSafe(|| {
            let _guard = service.sessions.lock().unwrap();
            panic!("poison session registry");
        }));

        let error = service.session_count().unwrap_err();
        assert_eq!(error.code, "HOST_STATE_UNAVAILABLE");
    }
}
