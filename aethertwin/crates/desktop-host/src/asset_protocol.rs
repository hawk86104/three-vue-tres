use crate::AppService;
use asset_io::{AssetIssue, VerifiedAsset};
use std::sync::Arc;
use tauri::{
    Manager, Runtime,
    http::{self, Method, Request, Response, StatusCode, header},
};
use uuid::Uuid;

/// Tauri/Wry custom-protocol bodies are materialized in memory. Keep each GET
/// bounded; larger media must be requested as one bounded byte range at a time.
pub(crate) const MAX_PROTOCOL_RESPONSE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ResponsePlanError {
    InvalidRange,
    TooLarge,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ResponsePlan {
    pub(crate) status: StatusCode,
    pub(crate) offset: u64,
    pub(crate) length: u64,
    pub(crate) content_range: Option<String>,
    pub(crate) read_body: bool,
}

pub(crate) fn handle_asset_request(
    request: &Request<Vec<u8>>,
    resolve: &dyn Fn(Uuid, Uuid) -> Result<Arc<VerifiedAsset>, AssetIssue>,
) -> Response<Vec<u8>> {
    let (session_id, asset_id) = match parse_asset_uri(request) {
        Ok(ids) => ids,
        Err(issue) => return issue_response(StatusCode::BAD_REQUEST, issue),
    };
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return response(StatusCode::METHOD_NOT_ALLOWED)
            .header(header::ALLOW, "GET, HEAD")
            .body(Vec::new())
            .expect("static protocol response");
    }
    let asset = match resolve(session_id, asset_id) {
        Ok(asset) => asset,
        Err(issue) => return asset_issue_response(issue),
    };

    let range = match request.headers().get(header::RANGE) {
        Some(value) => match value.to_str() {
            Ok(value) => Some(value),
            Err(_) => return range_not_satisfiable(asset.len()),
        },
        None => None,
    };
    let plan = match plan_response(request.method(), range, asset.len()) {
        Ok(plan) => plan,
        Err(ResponsePlanError::InvalidRange) => return range_not_satisfiable(asset.len()),
        Err(ResponsePlanError::TooLarge) => return response_too_large(asset.len()),
    };
    let body = if plan.read_body {
        match asset.read_range(plan.offset, plan.length) {
            Ok(bytes) => bytes,
            Err(issue) => return asset_issue_response(issue),
        }
    } else {
        Vec::new()
    };
    let mut builder = response(plan.status)
        .header(header::CONTENT_TYPE, asset.media_type())
        .header("x-content-type-options", "nosniff")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, plan.length.to_string());
    if let Some(content_range) = plan.content_range {
        builder = builder.header(header::CONTENT_RANGE, content_range);
    }
    builder.body(body).expect("static protocol response")
}

fn parse_asset_uri(request: &Request<Vec<u8>>) -> Result<(Uuid, Uuid), AssetIssue> {
    let uri = request.uri();
    if uri.scheme_str() != Some("aethertwin-asset")
        || uri.authority().map(|authority| authority.as_str()) != Some("asset")
        || uri.query().is_some()
    {
        return Err(AssetIssue::NotFound);
    }
    let mut segments = uri.path().strip_prefix('/').unwrap_or_default().split('/');
    let session_id = segments.next().and_then(parse_canonical_uuid);
    let asset_id = segments.next().and_then(parse_canonical_uuid);
    if segments.next().is_some() {
        return Err(AssetIssue::NotFound);
    }
    match (session_id, asset_id) {
        (Some(session_id), Some(asset_id)) => Ok((session_id, asset_id)),
        _ => Err(AssetIssue::NotFound),
    }
}

fn parse_canonical_uuid(value: &str) -> Option<Uuid> {
    let parsed = Uuid::parse_str(value).ok()?;
    (parsed.hyphenated().to_string() == value
        && matches!(parsed.get_version_num(), 1..=5)
        && parsed.get_variant() == uuid::Variant::RFC4122)
        .then_some(parsed)
}

pub(crate) fn plan_response(
    method: &Method,
    range: Option<&str>,
    len: u64,
) -> Result<ResponsePlan, ResponsePlanError> {
    let range = range
        .map(|value| parse_range(value, len).ok_or(ResponsePlanError::InvalidRange))
        .transpose()?;
    let (status, offset, length, content_range) = match range {
        Some((start, end)) => (
            StatusCode::PARTIAL_CONTENT,
            start,
            end - start + 1,
            Some(format!("bytes {start}-{end}/{len}")),
        ),
        None => (StatusCode::OK, 0, len, None),
    };
    let read_body = method == Method::GET;
    if read_body && length > MAX_PROTOCOL_RESPONSE_BYTES {
        return Err(ResponsePlanError::TooLarge);
    }
    Ok(ResponsePlan {
        status,
        offset,
        length,
        content_range,
        read_body,
    })
}

fn parse_range(value: &str, len: u64) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes=")?;
    if spec.is_empty() || spec.contains(',') || len == 0 {
        return None;
    }
    let (start, end) = spec.split_once('-')?;
    if start.is_empty() {
        let suffix = end.parse::<u64>().ok()?;
        if suffix == 0 {
            return None;
        }
        return Some((len.saturating_sub(suffix), len - 1));
    }
    let start = start.parse::<u64>().ok()?;
    if start >= len {
        return None;
    }
    let end = if end.is_empty() {
        len - 1
    } else {
        end.parse::<u64>().ok()?.min(len - 1)
    };
    (start <= end).then_some((start, end))
}

fn response(status: StatusCode) -> http::response::Builder {
    Response::builder().status(status)
}

fn issue_response(status: StatusCode, issue: AssetIssue) -> Response<Vec<u8>> {
    response(status)
        .header("x-aethertwin-asset-issue", issue.code())
        .body(Vec::new())
        .expect("static protocol response")
}

pub(crate) fn asset_issue_response(issue: AssetIssue) -> Response<Vec<u8>> {
    let status = match issue {
        AssetIssue::NotFound | AssetIssue::Missing => StatusCode::NOT_FOUND,
        AssetIssue::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
        AssetIssue::NotRegularFile | AssetIssue::SizeMismatch | AssetIssue::DigestMismatch => {
            StatusCode::CONFLICT
        }
    };
    issue_response(status, issue)
}

pub(crate) fn response_too_large(_asset_len: u64) -> Response<Vec<u8>> {
    response(StatusCode::PAYLOAD_TOO_LARGE)
        .header("x-aethertwin-asset-issue", "ASSET_RESPONSE_TOO_LARGE")
        .header(
            "x-aethertwin-max-response-bytes",
            MAX_PROTOCOL_RESPONSE_BYTES.to_string(),
        )
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, "0")
        .body(Vec::new())
        .expect("static protocol response")
}

fn range_not_satisfiable(len: u64) -> Response<Vec<u8>> {
    response(StatusCode::RANGE_NOT_SATISFIABLE)
        .header(header::CONTENT_RANGE, format!("bytes */{len}"))
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Vec::new())
        .expect("static protocol response")
}

pub(crate) fn with_asset_protocol<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.register_uri_scheme_protocol("aethertwin-asset", |context, request| {
        let service = context.app_handle().state::<AppService>();
        handle_asset_request(&request, &|session_id, asset_id| {
            service.resolve_asset_ids(session_id, asset_id)
        })
    })
}
