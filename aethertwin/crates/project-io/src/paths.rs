use crate::ProjectIoError;
use std::path::{Path, PathBuf};

const WINDOWS_RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

pub(crate) fn validate_project_name(value: &str) -> Result<&str, ProjectIoError> {
    if value.is_empty()
        || value.trim() != value
        || value.chars().count() > 80
        || matches!(value, "." | "..")
        || value.ends_with(['.', ' '])
        || value
            .chars()
            .any(|character| character.is_control() || "\\/:*?\"<>|".contains(character))
    {
        return Err(ProjectIoError::InvalidProjectName);
    }
    let stem = value
        .split('.')
        .next()
        .unwrap_or(value)
        .to_ascii_uppercase();
    if WINDOWS_RESERVED_NAMES.contains(&stem.as_str()) {
        return Err(ProjectIoError::InvalidProjectName);
    }
    Ok(value)
}

pub fn validate_relative_resource_path(value: &str) -> Result<(), ProjectIoError> {
    let path = Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || value.starts_with('/')
        || value.starts_with('\\')
        || value.contains('\\')
        || value.as_bytes().get(1) == Some(&b':')
        || value.split('/').any(|segment| segment == "..")
    {
        return Err(ProjectIoError::InvalidResourcePath);
    }
    Ok(())
}

pub(crate) fn canonical_parent(parent: &Path) -> Result<PathBuf, ProjectIoError> {
    let canonical = parent
        .canonicalize()
        .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    if !canonical.is_dir() {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(canonical)
}

pub(crate) fn validate_project_structure(path: &Path) -> Result<PathBuf, ProjectIoError> {
    let canonical = path
        .canonicalize()
        .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    if !canonical.is_dir() {
        return Err(ProjectIoError::InvalidProjectStructure);
    }

    for (entry, directory) in [
        ("manifest.json", false),
        ("project.db", false),
        ("assets", true),
        ("thumbnails", true),
        ("derived", true),
        ("exports", true),
    ] {
        let candidate = canonical.join(entry);
        let metadata = candidate
            .symlink_metadata()
            .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
        if metadata.file_type().is_symlink()
            || (directory && !metadata.is_dir())
            || (!directory && !metadata.is_file())
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        let resolved = candidate
            .canonicalize()
            .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
        if !resolved.starts_with(&canonical) || resolved.parent() != Some(canonical.as_path()) {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
    }
    Ok(canonical)
}

pub(crate) fn cleanup_verified_staging(parent: &Path, staging: &Path, prefix: &str) {
    let Ok(canonical_parent) = parent.canonicalize() else {
        return;
    };
    let Ok(canonical_staging) = staging.canonicalize() else {
        return;
    };
    let valid_name = canonical_staging
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with(prefix));
    if canonical_staging.parent() == Some(canonical_parent.as_path())
        && canonical_staging.starts_with(&canonical_parent)
        && valid_name
    {
        let _ = std::fs::remove_dir_all(canonical_staging);
    }
}
