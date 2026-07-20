use desktop_host::AppService;
use tauri::Manager;

fn run() -> tauri::Result<()> {
    desktop_host::with_invoke_handler(
        tauri::Builder::default()
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_dialog::init())
            .manage(AppService::default()),
    )
    .run(tauri::generate_context!())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("AetherTwin desktop host failed to start: {error}");
        std::process::exit(1);
    }
}
