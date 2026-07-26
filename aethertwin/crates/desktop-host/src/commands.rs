use crate::{
    AppService, CancelProjectAssetImportDto, CheckpointProjectDto, CloseProjectDto,
    CommitProjectDto, CreateProjectDto, ImportProgressDto, ImportProjectAssetDto, ImportResultDto,
    NativeErrorDto, OpenProjectDto, OpenedProjectDto, RecoverProjectDto, state::ProgressSink,
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
    on_progress: Option<tauri::ipc::JavaScriptChannelId>,
) -> Result<ImportResultDto, NativeErrorDto> {
    let request: ImportProjectAssetDto = state.decode_payload(IMPORT_PROJECT_ASSET, payload)?;
    let on_progress = on_progress.ok_or_else(|| {
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
