use project_io::{ProjectIoError, ProjectProfile};
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Debug)]
pub(crate) enum HostError {
    IpcInvalidRequest,
    SessionNotFound,
    HostStateUnavailable,
    SessionStateUnavailable,
    ProjectCreatedSessionUnavailable {
        project_id: Uuid,
        name: String,
        profile: ProjectProfile,
        reason_code: &'static str,
    },
    ProjectIo(ProjectIoError),
}

impl From<ProjectIoError> for HostError {
    fn from(source: ProjectIoError) -> Self {
        Self::ProjectIo(source)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeErrorDto {
    pub code: String,
    pub message: String,
    pub details: Value,
    pub log_ref: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizedLogRecord {
    pub log_ref: String,
    pub operation: String,
    pub code: String,
}

pub trait NativeLogSink: Send + Sync {
    fn record(&self, record: &SanitizedLogRecord);
}

#[derive(Default)]
pub(crate) struct StderrLogSink;

impl NativeLogSink for StderrLogSink {
    fn record(&self, record: &SanitizedLogRecord) {
        if let Ok(line) = serde_json::to_string(record) {
            eprintln!("{line}");
        }
    }
}

pub(crate) struct ErrorPresentation {
    pub code: &'static str,
    pub message: &'static str,
    pub details: Value,
}

pub(crate) fn present(error: HostError) -> ErrorPresentation {
    match error {
        HostError::IpcInvalidRequest => safe(
            "IPC_INVALID_REQUEST",
            "请求格式无效",
            json!({ "retryable": false }),
        ),
        HostError::SessionNotFound => safe(
            "SESSION_NOT_FOUND",
            "项目会话不存在或已关闭",
            json!({ "retryable": false }),
        ),
        HostError::HostStateUnavailable => safe(
            "HOST_STATE_UNAVAILABLE",
            "桌面服务状态暂时不可用",
            json!({ "retryable": true }),
        ),
        HostError::SessionStateUnavailable => safe(
            "SESSION_STATE_UNAVAILABLE",
            "项目会话状态暂时不可用",
            json!({ "retryable": true }),
        ),
        HostError::ProjectCreatedSessionUnavailable {
            project_id,
            name,
            profile,
            reason_code,
        } => safe(
            "PROJECT_CREATED_SESSION_UNAVAILABLE",
            "项目已创建，但当前无法建立会话，请重新打开该项目",
            json!({
                "projectId": project_id,
                "name": name,
                "profile": profile,
                "reasonCode": reason_code,
            }),
        ),
        HostError::ProjectIo(source) => present_project_io(source),
    }
}

pub(crate) const fn project_io_code(source: &ProjectIoError) -> &'static str {
    match source {
        ProjectIoError::InvalidProjectName => "INVALID_PROJECT_NAME",
        ProjectIoError::ProjectAlreadyExists => "PROJECT_ALREADY_EXISTS",
        ProjectIoError::InvalidProjectStructure => "INVALID_PROJECT_STRUCTURE",
        ProjectIoError::UnsupportedSchemaVersion => "UNSUPPORTED_SCHEMA_VERSION",
        ProjectIoError::ManifestDatabaseMismatch => "MANIFEST_DATABASE_MISMATCH",
        ProjectIoError::DatabaseError => "DATABASE_ERROR",
        ProjectIoError::ProjectLocked => "PROJECT_LOCKED",
        ProjectIoError::StaleProjectLock => "STALE_PROJECT_LOCK",
        ProjectIoError::InvalidResourcePath => "INVALID_RESOURCE_PATH",
        ProjectIoError::RecoveryFailed => "RECOVERY_FAILED",
        ProjectIoError::FilesystemError => "FILESYSTEM_ERROR",
    }
}

pub(crate) const fn host_error_code(source: &HostError) -> &'static str {
    match source {
        HostError::IpcInvalidRequest => "IPC_INVALID_REQUEST",
        HostError::SessionNotFound => "SESSION_NOT_FOUND",
        HostError::HostStateUnavailable => "HOST_STATE_UNAVAILABLE",
        HostError::SessionStateUnavailable => "SESSION_STATE_UNAVAILABLE",
        HostError::ProjectCreatedSessionUnavailable { .. } => "PROJECT_CREATED_SESSION_UNAVAILABLE",
        HostError::ProjectIo(source) => project_io_code(source),
    }
}

fn present_project_io(source: ProjectIoError) -> ErrorPresentation {
    match source {
        ProjectIoError::InvalidProjectName => {
            project_io("INVALID_PROJECT_NAME", "项目名称无效", false, false)
        }
        ProjectIoError::ProjectAlreadyExists => {
            project_io("PROJECT_ALREADY_EXISTS", "同名项目已存在", false, false)
        }
        ProjectIoError::InvalidProjectStructure => project_io(
            "INVALID_PROJECT_STRUCTURE",
            "项目结构无效或不完整",
            false,
            false,
        ),
        ProjectIoError::UnsupportedSchemaVersion => project_io(
            "UNSUPPORTED_SCHEMA_VERSION",
            "项目版本高于当前应用支持范围",
            false,
            false,
        ),
        ProjectIoError::ManifestDatabaseMismatch => project_io(
            "MANIFEST_DATABASE_MISMATCH",
            "项目清单与数据库不一致",
            false,
            false,
        ),
        ProjectIoError::DatabaseError => {
            project_io("DATABASE_ERROR", "项目数据库操作失败", true, false)
        }
        ProjectIoError::ProjectLocked => {
            project_io("PROJECT_LOCKED", "项目正在由另一个会话使用", true, false)
        }
        ProjectIoError::StaleProjectLock => {
            project_io("STALE_PROJECT_LOCK", "项目需要确认后恢复", false, true)
        }
        ProjectIoError::InvalidResourcePath => {
            project_io("INVALID_RESOURCE_PATH", "项目资源路径无效", false, false)
        }
        ProjectIoError::RecoveryFailed => {
            project_io("RECOVERY_FAILED", "项目恢复校验失败", false, false)
        }
        ProjectIoError::FilesystemError => {
            project_io("FILESYSTEM_ERROR", "项目文件操作失败", true, false)
        }
    }
}

fn project_io(
    code: &'static str,
    message: &'static str,
    retryable: bool,
    recovery_required: bool,
) -> ErrorPresentation {
    safe(
        code,
        message,
        json!({
            "recoveryRequired": recovery_required,
            "retryable": retryable,
        }),
    )
}

fn safe(code: &'static str, message: &'static str, details: Value) -> ErrorPresentation {
    ErrorPresentation {
        code,
        message,
        details,
    }
}

#[cfg(test)]
mod tests {
    use super::{HostError, present};
    use project_io::ProjectIoError;

    #[test]
    fn every_project_io_variant_has_a_safe_exhaustive_presentation() {
        let errors = [
            ProjectIoError::InvalidProjectName,
            ProjectIoError::ProjectAlreadyExists,
            ProjectIoError::InvalidProjectStructure,
            ProjectIoError::UnsupportedSchemaVersion,
            ProjectIoError::ManifestDatabaseMismatch,
            ProjectIoError::DatabaseError,
            ProjectIoError::ProjectLocked,
            ProjectIoError::StaleProjectLock,
            ProjectIoError::InvalidResourcePath,
            ProjectIoError::RecoveryFailed,
            ProjectIoError::FilesystemError,
        ];
        for source in errors {
            let expected = source.code();
            let presentation = present(HostError::ProjectIo(source));
            assert_eq!(presentation.code, expected);
            assert!(!presentation.message.is_empty());
            assert!(!presentation.message.contains(':'));
        }
    }
}
