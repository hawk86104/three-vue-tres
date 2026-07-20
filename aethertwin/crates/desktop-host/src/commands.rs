use crate::{
    AppService, CheckpointProjectDto, CloseProjectDto, CommitProjectDto, CreateProjectDto,
    NativeErrorDto, OpenProjectDto, OpenedProjectDto, RecoverProjectDto,
};
use project_io::ProjectManifest;
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
) -> Result<ProjectManifest, NativeErrorDto> {
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
