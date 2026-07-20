use crate::{dto::profile, error::HostError};
use project_io::{CreateProjectRequest, ProjectIoError};
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::CreateProjectDto;

pub(crate) fn validate_create_request(
    request: CreateProjectDto,
) -> Result<CreateProjectRequest, HostError> {
    let parent = validate_absolute_path(&request.parent)?;
    let profile = profile(&request.profile)?;
    if request.name.is_empty() || request.name.trim() != request.name || request.name.contains('\0')
    {
        return Err(HostError::IpcInvalidRequest);
    }
    Ok(CreateProjectRequest {
        parent,
        name: request.name,
        profile,
    })
}

pub(crate) fn validate_absolute_path(value: &str) -> Result<PathBuf, HostError> {
    if value.is_empty() || value.trim() != value || value.contains('\0') {
        return Err(HostError::IpcInvalidRequest);
    }
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err(HostError::IpcInvalidRequest);
    }
    Ok(path.to_owned())
}

pub(crate) fn validate_session_id(value: &str) -> Result<Uuid, HostError> {
    let parsed = Uuid::parse_str(value).map_err(|_| HostError::IpcInvalidRequest)?;
    if parsed.hyphenated().to_string() != value
        || !matches!(parsed.get_version_num(), 1..=5)
        || !matches!(parsed.get_variant(), uuid::Variant::RFC4122)
    {
        return Err(HostError::IpcInvalidRequest);
    }
    Ok(parsed)
}

pub(crate) fn require_recovery_confirmation(confirm: bool) -> Result<(), HostError> {
    if confirm {
        Ok(())
    } else {
        Err(ProjectIoError::StaleProjectLock.into())
    }
}
