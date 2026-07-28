use crate::AppService;
use asset_io::{AssetIssue, VerifiedAsset};
use std::sync::Arc;
use tauri::{
    Manager, Runtime,
    http::{self, Method, Request, Response, StatusCode, header},
};
use uuid::Uuid;

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
        Err(issue) => {
            let status = match issue {
                AssetIssue::NotFound | AssetIssue::Missing => StatusCode::NOT_FOUND,
                AssetIssue::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
                AssetIssue::NotRegularFile
                | AssetIssue::SizeMismatch
                | AssetIssue::DigestMismatch => StatusCode::CONFLICT,
            };
            return issue_response(status, issue);
        }
    };

    let range = match request.headers().get(header::RANGE) {
        Some(value) => match value
            .to_str()
            .ok()
            .and_then(|value| parse_range(value, asset.len()))
        {
            Some(range) => Some(range),
            None => return range_not_satisfiable(asset.len()),
        },
        None => None,
    };
    let (status, offset, length, content_range) = match range {
        Some((start, end)) => (
            StatusCode::PARTIAL_CONTENT,
            start,
            end - start + 1,
            Some(format!("bytes {start}-{end}/{}", asset.len())),
        ),
        None => (StatusCode::OK, 0, asset.len(), None),
    };
    let body = if request.method() == Method::HEAD {
        Vec::new()
    } else {
        match asset.read_range(offset, length) {
            Ok(bytes) => bytes,
            Err(issue) => return issue_response(StatusCode::SERVICE_UNAVAILABLE, issue),
        }
    };
    let mut builder = response(status)
        .header(header::CONTENT_TYPE, asset.media_type())
        .header("x-content-type-options", "nosniff")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, length.to_string());
    if let Some(content_range) = content_range {
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
    let session_id = segments
        .next()
        .and_then(|value| Uuid::parse_str(value).ok());
    let asset_id = segments
        .next()
        .and_then(|value| Uuid::parse_str(value).ok());
    if segments.next().is_some() {
        return Err(AssetIssue::NotFound);
    }
    match (session_id, asset_id) {
        (Some(session_id), Some(asset_id)) => Ok((session_id, asset_id)),
        _ => Err(AssetIssue::NotFound),
    }
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
