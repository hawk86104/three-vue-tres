use crate::{
    boundary::{validate_export_id, validate_session_id},
    error::HostError,
};
use project_io::PROJECT_EXPORT_MAX_CHUNK_BYTES;
use tauri::http::HeaderMap;
use uuid::Uuid;

const SESSION_ID_HEADER: &str = "x-aether-session-id";
const EXPORT_ID_HEADER: &str = "x-aether-export-id";
const CHUNK_INDEX_HEADER: &str = "x-aether-chunk-index";

pub struct ParsedProjectExportChunk<'a> {
    pub session_id: Uuid,
    pub export_id: Uuid,
    pub chunk_index: u64,
    pub bytes: &'a [u8],
}

pub fn parse_project_export_chunk<'a>(
    request: &'a tauri::ipc::Request<'_>,
) -> Result<ParsedProjectExportChunk<'a>, HostError> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if !bytes.is_empty() => bytes.as_slice(),
        _ => return Err(HostError::InvalidIpcPayload),
    };
    if bytes.len() > PROJECT_EXPORT_MAX_CHUNK_BYTES {
        return Err(HostError::ExportChunkTooLarge);
    }

    let headers = parse_exact_aether_export_headers(request.headers())?;
    Ok(ParsedProjectExportChunk {
        session_id: validate_session_id(headers.session_id)?,
        export_id: validate_export_id(headers.export_id)?,
        chunk_index: parse_canonical_chunk_index(headers.chunk_index)?,
        bytes,
    })
}

struct ProjectExportHeaders<'a> {
    session_id: &'a str,
    export_id: &'a str,
    chunk_index: &'a str,
}

fn parse_exact_aether_export_headers(
    headers: &HeaderMap,
) -> Result<ProjectExportHeaders<'_>, HostError> {
    for name in headers.keys() {
        let name = name.as_str();
        if name.starts_with("x-aether-")
            && !matches!(
                name,
                SESSION_ID_HEADER | EXPORT_ID_HEADER | CHUNK_INDEX_HEADER
            )
        {
            return Err(HostError::InvalidIpcPayload);
        }
    }

    Ok(ProjectExportHeaders {
        session_id: exact_header_value(headers, SESSION_ID_HEADER)?,
        export_id: exact_header_value(headers, EXPORT_ID_HEADER)?,
        chunk_index: exact_header_value(headers, CHUNK_INDEX_HEADER)?,
    })
}

fn exact_header_value<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, HostError> {
    let mut values = headers.get_all(name).iter();
    let value = values.next().ok_or(HostError::InvalidIpcPayload)?;
    if values.next().is_some() {
        return Err(HostError::InvalidIpcPayload);
    }
    value.to_str().map_err(|_| HostError::InvalidIpcPayload)
}

fn parse_canonical_chunk_index(value: &str) -> Result<u64, HostError> {
    if value == "0" {
        return Ok(0);
    }
    if !value
        .as_bytes()
        .first()
        .is_some_and(|digit| matches!(*digit, b'1'..=b'9'))
        || !value.as_bytes().iter().all(u8::is_ascii_digit)
    {
        return Err(HostError::InvalidIpcPayload);
    }
    value.parse().map_err(|_| HostError::InvalidIpcPayload)
}
