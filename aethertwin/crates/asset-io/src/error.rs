use std::fmt;

#[derive(Clone, Copy, Eq, PartialEq)]
pub enum AssetIoError {
    InvalidAssetImportRequest,
    UnsupportedAssetType,
    ExtensionSignatureMismatch,
    RoleMediaMismatch,
    AssetTooLarge,
    InvalidImageDimensions,
    UnsafeSvg,
    SourceChanged,
    SourceNotRegularFile,
    ImportCancelled,
    Collision,
    IoFailed,
}

impl AssetIoError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidAssetImportRequest => "INVALID_ASSET_IMPORT_REQUEST",
            Self::UnsupportedAssetType => "UNSUPPORTED_ASSET_TYPE",
            Self::ExtensionSignatureMismatch => "ASSET_EXTENSION_SIGNATURE_MISMATCH",
            Self::RoleMediaMismatch => "ASSET_ROLE_MEDIA_MISMATCH",
            Self::AssetTooLarge => "ASSET_TOO_LARGE",
            Self::InvalidImageDimensions => "INVALID_ASSET_IMAGE_DIMENSIONS",
            Self::UnsafeSvg => "UNSAFE_SVG",
            Self::SourceChanged => "ASSET_SOURCE_CHANGED",
            Self::SourceNotRegularFile => "ASSET_SOURCE_NOT_REGULAR_FILE",
            Self::ImportCancelled => "ASSET_IMPORT_CANCELLED",
            Self::Collision => "ASSET_COLLISION",
            Self::IoFailed => "ASSET_IO_FAILED",
        }
    }

    const fn message(&self) -> &'static str {
        match self {
            Self::InvalidAssetImportRequest => "The asset import request is invalid.",
            Self::UnsupportedAssetType => "The asset media type is not supported.",
            Self::ExtensionSignatureMismatch => {
                "The file extension does not match its media signature."
            }
            Self::RoleMediaMismatch => "The import role does not accept this media type.",
            Self::AssetTooLarge => "The asset exceeds the safe media size limit.",
            Self::InvalidImageDimensions => "The image dimensions are outside the safe limits.",
            Self::UnsafeSvg => "The SVG contains unsupported or unsafe content.",
            Self::SourceChanged => "The asset source changed during import.",
            Self::SourceNotRegularFile => "The asset source is not a regular file.",
            Self::ImportCancelled => "The asset import was cancelled.",
            Self::Collision => {
                "The content-addressed asset destination conflicts with existing content."
            }
            Self::IoFailed => "Asset import I/O failed.",
        }
    }
}

impl fmt::Debug for AssetIoError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AssetIoError")
            .field("code", &self.code())
            .field("message", &self.message())
            .finish()
    }
}

impl fmt::Display for AssetIoError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message())
    }
}

impl std::error::Error for AssetIoError {}

impl From<std::io::Error> for AssetIoError {
    fn from(_: std::io::Error) -> Self {
        Self::IoFailed
    }
}
