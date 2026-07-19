use crate::{
    AppService, CreateProjectDto, NativeErrorDto, OpenProjectDto, OpenedProjectDto,
    RecoverProjectDto,
};
use project_io::{CommitBatch, ProjectManifest};

#[tauri::command]
pub fn create_project(
    state: tauri::State<'_, AppService>,
    request: CreateProjectDto,
) -> Result<OpenedProjectDto, NativeErrorDto> {
    state.create_project(request)
}

#[tauri::command]
pub fn open_project(
    state: tauri::State<'_, AppService>,
    request: OpenProjectDto,
) -> Result<OpenedProjectDto, NativeErrorDto> {
    state.open_project(request)
}

#[tauri::command]
pub fn commit_project(
    state: tauri::State<'_, AppService>,
    session_id: String,
    batch: CommitBatch,
) -> Result<(), NativeErrorDto> {
    state.commit_project(&session_id, batch)
}

#[tauri::command]
pub fn checkpoint_project(
    state: tauri::State<'_, AppService>,
    session_id: String,
) -> Result<ProjectManifest, NativeErrorDto> {
    state.checkpoint_project(&session_id)
}

#[tauri::command]
pub fn close_project(
    state: tauri::State<'_, AppService>,
    session_id: String,
) -> Result<(), NativeErrorDto> {
    state.close_project(&session_id)
}

#[tauri::command]
pub fn recover_project(
    state: tauri::State<'_, AppService>,
    request: RecoverProjectDto,
) -> Result<OpenedProjectDto, NativeErrorDto> {
    state.recover_project(request)
}
