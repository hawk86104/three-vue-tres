use thiserror::Error;

#[derive(Debug, Error)]
pub enum MediaExportError {
    #[error("PNG dimensions must be non-zero and fit the RGBA byte limit")]
    InvalidDimensions,
    #[error("PNG raw byte accounting overflowed")]
    RawByteCountOverflow,
    #[error("PNG input contains a non-opaque alpha byte")]
    NonOpaqueAlpha,
    #[error("PNG input exceeds the declared dimensions")]
    RawByteOverrun,
    #[error("PNG input is shorter than the declared dimensions")]
    RawByteUnderrun,
    #[error("PNG encoding failed")]
    EncodeFailed,
    #[error("PNG validation failed")]
    ValidationFailed,
}
