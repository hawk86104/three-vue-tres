use crate::{
    AppService, BeginProjectExportRequestDto, BeginProjectExportResultDto,
    CancelProjectAssetImportDto, CheckpointProjectDto, CloseProjectDto, CommitProjectDto,
    CreateProjectDto, ExportResultActionRequestDto, FinishProjectExportRequestDto,
    ImportProgressDto, ImportProjectAssetDto, ImportResultDto, NativeErrorDto, OpenProjectDto,
    OpenedProjectDto, ProjectExportResultDto, RecoverProjectDto, parse_project_export_chunk,
    state::ProgressSink,
};
use project_io::CheckpointResult;
use serde_json::Value;

const CREATE_PROJECT: &str = "create_project";
const OPEN_PROJECT: &str = "open_project";
const COMMIT_PROJECT: &str = "commit_project";
const CHECKPOINT_PROJECT: &str = "checkpoint_project";
const CLOSE_PROJECT: &str = "close_project";
const RECOVER_PROJECT: &str = "recover_project";

#[tauri::command]
pub fn create_project(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<OpenedProjectDto, NativeErrorDto> {
    let request: CreateProjectDto = state.decode_payload(CREATE_PROJECT, payload)?;
    state.create_project_for(CREATE_PROJECT, request)
}

#[tauri::command]
pub fn open_project(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<OpenedProjectDto, NativeErrorDto> {
    let request: OpenProjectDto = state.decode_payload(OPEN_PROJECT, payload)?;
    state.open_project_for(OPEN_PROJECT, request)
}

#[tauri::command]
pub fn commit_project(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<(), NativeErrorDto> {
    let request: CommitProjectDto = state.decode_payload(COMMIT_PROJECT, payload)?;
    state.commit_request(COMMIT_PROJECT, request)
}

#[tauri::command]
pub fn checkpoint_project(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<CheckpointResult, NativeErrorDto> {
    let request: CheckpointProjectDto = state.decode_payload(CHECKPOINT_PROJECT, payload)?;
    state.checkpoint_request(CHECKPOINT_PROJECT, request)
}

#[tauri::command]
pub fn close_project(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<(), NativeErrorDto> {
    let request: CloseProjectDto = state.decode_payload(CLOSE_PROJECT, payload)?;
    state.close_request(CLOSE_PROJECT, request)
}

#[tauri::command]
pub fn recover_project(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<OpenedProjectDto, NativeErrorDto> {
    let request: RecoverProjectDto = state.decode_payload(RECOVER_PROJECT, payload)?;
    state.recover_project_for(RECOVER_PROJECT, request)
}

const IMPORT_PROJECT_ASSET: &str = "import_project_asset";
const CANCEL_PROJECT_ASSET_IMPORT: &str = "cancel_project_asset_import";

struct ChannelProgressSink(tauri::ipc::Channel<ImportProgressDto>);

impl ProgressSink for ChannelProgressSink {
    fn send(&self, progress: ImportProgressDto) -> Result<(), crate::error::HostError> {
        self.0
            .send(progress)
            .map_err(|_| crate::error::HostError::AssetProgressDeliveryFailed)
    }
}

#[tauri::command]
pub async fn import_project_asset(
    state: tauri::State<'_, AppService>,
    webview: tauri::Webview<impl tauri::Runtime>,
    payload: Option<Value>,
    on_progress: Option<Value>,
) -> Result<ImportResultDto, NativeErrorDto> {
    let request: ImportProjectAssetDto = state.decode_payload(IMPORT_PROJECT_ASSET, payload)?;
    let on_progress = on_progress
        .as_ref()
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<tauri::ipc::JavaScriptChannelId>().ok())
        .ok_or_else(|| {
            state.render_error(
                IMPORT_PROJECT_ASSET,
                crate::error::HostError::IpcInvalidRequest,
            )
        })?;
    let on_progress: tauri::ipc::Channel<ImportProgressDto> = on_progress.channel_on(webview);
    let prepared = state
        .prepare_asset_import(request)
        .map_err(|error| state.render_error(IMPORT_PROJECT_ASSET, error))?;
    let operation_id = prepared.operation_id();
    let cancellation = prepared.cancellation();
    let sink = ChannelProgressSink(on_progress);
    let result = tauri::async_runtime::spawn_blocking(move || prepared.run(&sink)).await;
    let removed = state
        .finish_asset_import(operation_id, &cancellation)
        .map_err(|error| state.render_error(IMPORT_PROJECT_ASSET, error))?;
    if !removed {
        return Err(state.render_error(
            IMPORT_PROJECT_ASSET,
            crate::error::HostError::HostStateUnavailable,
        ));
    }
    match result {
        Ok(result) => result.map_err(|error| state.render_error(IMPORT_PROJECT_ASSET, error)),
        Err(_) => Err(state.render_error(
            IMPORT_PROJECT_ASSET,
            crate::error::HostError::HostStateUnavailable,
        )),
    }
}

#[tauri::command]
pub fn cancel_project_asset_import(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<(), NativeErrorDto> {
    let request: CancelProjectAssetImportDto =
        state.decode_payload(CANCEL_PROJECT_ASSET_IMPORT, payload)?;
    state
        .cancel_asset_import(request)
        .map_err(|error| state.render_error(CANCEL_PROJECT_ASSET_IMPORT, error))
}

const BEGIN_PROJECT_EXPORT: &str = "begin_project_export";
const WRITE_PROJECT_EXPORT_CHUNK: &str = "write_project_export_chunk";
const FINISH_PROJECT_EXPORT: &str = "finish_project_export";
const CANCEL_PROJECT_EXPORT: &str = "cancel_project_export";
const OPEN_PROJECT_EXPORT_RESULT: &str = "open_project_export_result";
const REVEAL_PROJECT_EXPORT_RESULT: &str = "reveal_project_export_result";

#[tauri::command]
pub fn begin_project_export(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<BeginProjectExportResultDto, NativeErrorDto> {
    let request: BeginProjectExportRequestDto =
        state.decode_payload(BEGIN_PROJECT_EXPORT, payload)?;
    state
        .begin_project_export(request)
        .map_err(|error| state.render_error(BEGIN_PROJECT_EXPORT, error))
}

#[tauri::command]
pub fn write_project_export_chunk(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, AppService>,
) -> Result<(), NativeErrorDto> {
    let request = parse_project_export_chunk(&request)
        .map_err(|error| state.render_error(WRITE_PROJECT_EXPORT_CHUNK, error))?;
    state
        .write_project_export_chunk(request)
        .map_err(|error| state.render_error(WRITE_PROJECT_EXPORT_CHUNK, error))
}

#[tauri::command]
pub fn finish_project_export(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<ProjectExportResultDto, NativeErrorDto> {
    let request: FinishProjectExportRequestDto =
        state.decode_payload(FINISH_PROJECT_EXPORT, payload)?;
    state
        .finish_project_export(request)
        .map_err(|error| state.render_error(FINISH_PROJECT_EXPORT, error))
}

#[tauri::command]
pub fn cancel_project_export(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<(), NativeErrorDto> {
    let request: FinishProjectExportRequestDto =
        state.decode_payload(CANCEL_PROJECT_EXPORT, payload)?;
    state
        .cancel_project_export(request)
        .map_err(|error| state.render_error(CANCEL_PROJECT_EXPORT, error))
}

#[tauri::command]
pub fn open_project_export_result(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<(), NativeErrorDto> {
    let request: ExportResultActionRequestDto =
        state.decode_payload(OPEN_PROJECT_EXPORT_RESULT, payload)?;
    state
        .export_result_action(request, false)
        .map_err(|error| state.render_error(OPEN_PROJECT_EXPORT_RESULT, error))
}

#[tauri::command]
pub fn reveal_project_export_result(
    state: tauri::State<'_, AppService>,
    payload: Option<Value>,
) -> Result<(), NativeErrorDto> {
    let request: ExportResultActionRequestDto =
        state.decode_payload(REVEAL_PROJECT_EXPORT_RESULT, payload)?;
    state
        .export_result_action(request, true)
        .map_err(|error| state.render_error(REVEAL_PROJECT_EXPORT_RESULT, error))
}
