use desktop_host::AppService;
use tauri::Manager;

fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(AppService::default())
        .invoke_handler(tauri::generate_handler![
            desktop_host::commands::create_project,
            desktop_host::commands::open_project,
            desktop_host::commands::commit_project,
            desktop_host::commands::checkpoint_project,
            desktop_host::commands::close_project,
            desktop_host::commands::recover_project
        ])
        .run(tauri::generate_context!())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("AetherTwin desktop host failed to start: {error}");
        std::process::exit(1);
    }
}
