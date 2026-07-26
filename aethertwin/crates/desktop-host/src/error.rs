use asset_io::AssetIoError;
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
    SessionRecoveryRequired,
    AssetImportOperationExists,
    AssetImportOperationNotFound,
    AssetProgressOperationMismatch,
    AssetProgressNotMonotonic,
    AssetProgressDeliveryFailed,
    ProjectCreatedSessionUnavailable {
        project_id: Uuid,
        name: String,
        profile: ProjectProfile,
        reason_code: &'static str,
    },
    ProjectIo(ProjectIoError),
    AssetIo(AssetIoError),
}

impl From<ProjectIoError> for HostError {
    fn from(source: ProjectIoError) -> Self {
        Self::ProjectIo(source)
    }
}

impl From<AssetIoError> for HostError {
    fn from(source: AssetIoError) -> Self {
        Self::AssetIo(source)
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
        HostError::SessionRecoveryRequired => safe(
            "SESSION_RECOVERY_REQUIRED",
            "项目会话清理失败，请确认恢复后重新打开项目",
            json!({ "recoveryRequired": true, "retryable": false }),
        ),
        HostError::AssetImportOperationExists => safe(
            "ASSET_IMPORT_OPERATION_EXISTS",
            "An asset import already uses this operation id",
            json!({ "retryable": false }),
        ),
        HostError::AssetImportOperationNotFound => safe(
            "ASSET_IMPORT_OPERATION_NOT_FOUND",
            "The asset import operation is not active for this session",
            json!({ "retryable": false }),
        ),
        HostError::AssetProgressOperationMismatch => safe(
            "ASSET_PROGRESS_OPERATION_MISMATCH",
            "Asset import progress belongs to another operation",
            json!({ "retryable": false }),
        ),
        HostError::AssetProgressNotMonotonic => safe(
            "ASSET_PROGRESS_NOT_MONOTONIC",
            "Asset import progress must be monotonic",
            json!({ "retryable": false }),
        ),
        HostError::AssetProgressDeliveryFailed => safe(
            "ASSET_PROGRESS_DELIVERY_FAILED",
            "Asset import progress could not be delivered",
            json!({ "retryable": true }),
        ),
        HostError::ProjectCreatedSessionUnavailable {
            project_id,
            name,
            profile,
            reason_code,
        } => {
            let message = if reason_code == "SESSION_RECOVERY_REQUIRED" {
                "项目已创建，但会话清理失败；重新打开前请确认恢复项目"
            } else {
                "项目已创建，但当前无法建立会话，请重新打开该项目"
            };
            safe(
                "PROJECT_CREATED_SESSION_UNAVAILABLE",
                message,
                json!({
                    "projectId": project_id,
                    "name": name,
                    "profile": profile,
                    "reasonCode": reason_code,
                }),
            )
        }
        HostError::AssetIo(source) => present_asset_io(source),
        HostError::ProjectIo(source) => present_project_io(source),
    }
}

pub(crate) const fn project_io_code(source: &ProjectIoError) -> &'static str {
    match source {
        ProjectIoError::InvalidProjectName => "INVALID_PROJECT_NAME",
        ProjectIoError::ProjectAlreadyExists => "PROJECT_ALREADY_EXISTS",
        ProjectIoError::ProjectNotFound => "PROJECT_NOT_FOUND",
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
        HostError::SessionRecoveryRequired => "SESSION_RECOVERY_REQUIRED",
        HostError::ProjectCreatedSessionUnavailable { .. } => "PROJECT_CREATED_SESSION_UNAVAILABLE",
        HostError::AssetImportOperationExists => "ASSET_IMPORT_OPERATION_EXISTS",
        HostError::AssetImportOperationNotFound => "ASSET_IMPORT_OPERATION_NOT_FOUND",
        HostError::AssetProgressOperationMismatch => "ASSET_PROGRESS_OPERATION_MISMATCH",
        HostError::AssetProgressNotMonotonic => "ASSET_PROGRESS_NOT_MONOTONIC",
        HostError::AssetProgressDeliveryFailed => "ASSET_PROGRESS_DELIVERY_FAILED",
        HostError::AssetIo(source) => source.code(),
        HostError::ProjectIo(source) => project_io_code(source),
    }
}

fn present_asset_io(source: AssetIoError) -> ErrorPresentation {
    let (message, retryable) = match source {
        AssetIoError::InvalidAssetImportRequest => ("The asset import request is invalid", false),
        AssetIoError::UnsupportedAssetType => ("The asset media type is not supported", false),
        AssetIoError::ExtensionSignatureMismatch => {
            ("The asset extension does not match its content", false)
        }
        AssetIoError::RoleMediaMismatch => ("The asset does not match the import role", false),
        AssetIoError::AssetTooLarge => ("The asset exceeds the safe size limit", false),
        AssetIoError::InvalidImageDimensions => {
            ("The image dimensions are outside safe limits", false)
        }
        AssetIoError::UnsafeSvg => ("The SVG contains unsafe content", false),
        AssetIoError::SourceChanged => ("The asset source changed during import", true),
        AssetIoError::SourceNotRegularFile => ("The asset source is not a regular file", false),
        AssetIoError::ImportCancelled => ("The asset import was cancelled", false),
        AssetIoError::Collision => (
            "The asset destination conflicts with existing content",
            false,
        ),
        AssetIoError::IoFailed => ("The asset import failed", true),
    };
    safe(source.code(), message, json!({ "retryable": retryable }))
}

fn present_project_io(source: ProjectIoError) -> ErrorPresentation {
    match source {
        ProjectIoError::InvalidProjectName => {
            project_io("INVALID_PROJECT_NAME", "项目名称无效", false, false)
        }
        ProjectIoError::ProjectAlreadyExists => {
            project_io("PROJECT_ALREADY_EXISTS", "同名项目已存在", false, false)
        }
        ProjectIoError::ProjectNotFound => {
            project_io("PROJECT_NOT_FOUND", "项目不存在或已移动", false, false)
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
    use asset_io::AssetIoError;
    use project_io::ProjectIoError;

    #[test]
    fn every_project_io_variant_has_a_safe_exhaustive_presentation() {
        let errors = [
            ProjectIoError::InvalidProjectName,
            ProjectIoError::ProjectAlreadyExists,
            ProjectIoError::ProjectNotFound,
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

    #[test]
    fn every_asset_io_variant_has_a_safe_exhaustive_presentation() {
        let errors = [
            AssetIoError::InvalidAssetImportRequest,
            AssetIoError::UnsupportedAssetType,
            AssetIoError::ExtensionSignatureMismatch,
            AssetIoError::RoleMediaMismatch,
            AssetIoError::AssetTooLarge,
            AssetIoError::InvalidImageDimensions,
            AssetIoError::UnsafeSvg,
            AssetIoError::SourceChanged,
            AssetIoError::SourceNotRegularFile,
            AssetIoError::ImportCancelled,
            AssetIoError::Collision,
            AssetIoError::IoFailed,
        ];
        for source in errors {
            let expected = source.code();
            let presentation = present(HostError::AssetIo(source));
            assert_eq!(presentation.code, expected);
            assert!(!presentation.message.is_empty());
            assert!(!presentation.message.contains(':'));
            assert!(!presentation.details.to_string().contains("path"));
        }
    }
}
