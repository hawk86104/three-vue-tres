use thiserror::Error;

#[derive(Debug, Error)]
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
