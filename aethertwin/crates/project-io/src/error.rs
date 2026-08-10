use thiserror::Error;

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ProjectIoError {
    #[error("invalid project name")]
    InvalidProjectName,
    #[error("project already exists")]
    ProjectAlreadyExists,
    #[error("project not found")]
    ProjectNotFound,
    #[error("invalid project structure")]
    InvalidProjectStructure,
    #[error("unsupported schema version")]
    UnsupportedSchemaVersion,
    #[error("manifest and database do not match")]
    ManifestDatabaseMismatch,
    #[error("database operation failed")]
    DatabaseError,
    #[error("project is locked")]
    ProjectLocked,
    #[error("stale project lock requires recovery confirmation")]
    StaleProjectLock,
    #[error("invalid project-relative resource path")]
    InvalidResourcePath,
    #[error("project recovery failed")]
    RecoveryFailed,
    #[error("filesystem operation failed")]
    FilesystemError,
    #[error("export chunk index is out of order")]
    ExportChunkOutOfOrder,
    #[error("export chunk exceeds the byte limit")]
    ExportChunkTooLarge,
    #[error("export byte count does not match the preset")]
    ExportByteCountMismatch,
    #[error("export PNG encoding failed")]
    ExportEncodeFailed,
    #[error("export PNG validation failed")]
    ExportValidationFailed,
    #[error("export publication failed")]
    ExportPublishFailed,
}

impl ProjectIoError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidProjectName => "INVALID_PROJECT_NAME",
            Self::ProjectAlreadyExists => "PROJECT_ALREADY_EXISTS",
            Self::ProjectNotFound => "PROJECT_NOT_FOUND",
            Self::InvalidProjectStructure => "INVALID_PROJECT_STRUCTURE",
            Self::UnsupportedSchemaVersion => "UNSUPPORTED_SCHEMA_VERSION",
            Self::ManifestDatabaseMismatch => "MANIFEST_DATABASE_MISMATCH",
            Self::DatabaseError => "DATABASE_ERROR",
            Self::ProjectLocked => "PROJECT_LOCKED",
            Self::StaleProjectLock => "STALE_PROJECT_LOCK",
            Self::InvalidResourcePath => "INVALID_RESOURCE_PATH",
            Self::RecoveryFailed => "RECOVERY_FAILED",
            Self::FilesystemError => "FILESYSTEM_ERROR",
            Self::ExportChunkOutOfOrder => "EXPORT_CHUNK_OUT_OF_ORDER",
            Self::ExportChunkTooLarge => "EXPORT_CHUNK_TOO_LARGE",
            Self::ExportByteCountMismatch => "EXPORT_BYTE_COUNT_MISMATCH",
            Self::ExportEncodeFailed => "EXPORT_ENCODE_FAILED",
            Self::ExportValidationFailed => "EXPORT_VALIDATION_FAILED",
            Self::ExportPublishFailed => "EXPORT_PUBLISH_FAILED",
        }
    }
}

impl From<rusqlite::Error> for ProjectIoError {
    fn from(_: rusqlite::Error) -> Self {
        Self::DatabaseError
    }
}

impl From<std::io::Error> for ProjectIoError {
    fn from(_: std::io::Error) -> Self {
        Self::FilesystemError
    }
}
