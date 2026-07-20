use desktop_host::{AppService, NativeErrorDto};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

fn show_close_failure<R: tauri::Runtime>(target: &impl DialogExt<R>, error: NativeErrorDto) {
    let message = format!("{}\n\n日志参考：{}", error.message, error.log_ref);
    target
        .dialog()
        .message(message)
        .title("无法安全关闭 AetherTwin")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

fn run() -> tauri::Result<()> {
    let app = desktop_host::with_invoke_handler(
        tauri::Builder::default()
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_dialog::init())
            .manage(AppService::default())
            .on_window_event(|window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if let Err(error) = window.state::<AppService>().close_all() {
                        api.prevent_close();
                        show_close_failure(window, error);
                    }
                }
            }),
    )
    .build(tauri::generate_context!())?;
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if let Err(error) = app.state::<AppService>().close_all() {
                api.prevent_exit();
                show_close_failure(app, error);
            }
        }
    });
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("AetherTwin desktop host failed to start: {error}");
        std::process::exit(1);
    }
}
