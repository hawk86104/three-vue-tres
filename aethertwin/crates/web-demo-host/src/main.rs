use std::env;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{self, Command};
use std::sync::mpsc::{self, Receiver};

use aethertwin_web_demo_host::{HostConfig, HostError, PortableHost};

fn main() {
    if env::args_os().count() != 1 {
        eprintln!("PREVIEW_SERVER_FAILED");
        process::exit(1);
    }
    let Some(app_root) = packaged_app_root() else {
        eprintln!("PREVIEW_FILES_MISSING");
        process::exit(1);
    };
    let (_shutdown_sender, shutdown_receiver) = mpsc::channel();
    if let Err(error) = run_with(app_root, open_default_browser, shutdown_receiver) {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn packaged_app_root() -> Option<PathBuf> {
    env::current_exe()
        .ok()
        .and_then(|executable| sibling_app_root(&executable))
}

fn sibling_app_root(executable: &Path) -> Option<PathBuf> {
    executable.parent().map(|directory| directory.join("app"))
}

fn run_with<F>(app_root: PathBuf, open_browser: F, shutdown: Receiver<()>) -> Result<(), HostError>
where
    F: FnOnce(&str) -> io::Result<()>,
{
    let host = PortableHost::bind(HostConfig::packaged(app_root))?;
    let url = host.url();
    println!("AetherTwin portable preview: {url}");
    if open_browser(&url).is_err() {
        eprintln!("PREVIEW_BROWSER_OPEN_FAILED");
    }
    host.serve_until(shutdown)
}

#[cfg(windows)]
fn open_default_browser(url: &str) -> io::Result<()> {
    Command::new("explorer.exe").arg(url).spawn().map(|_| ())
}

#[cfg(not(windows))]
fn open_default_browser(_url: &str) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "portable preview browser launch is Windows-only",
    ))
}

#[cfg(test)]
mod tests {
    use super::{run_with, sibling_app_root};
    use std::cell::Cell;

    use std::fs;
    use std::io;
    use std::sync::mpsc;

    use tempfile::TempDir;

    fn packaged_app() -> (TempDir, std::path::PathBuf) {
        let temp = tempfile::tempdir().expect("temporary package root");
        let app_root = temp.path().join("app");
        fs::create_dir(&app_root).expect("app directory");
        fs::write(app_root.join("index.html"), b"preview").expect("preview index");
        (temp, app_root)
    }

    #[test]
    fn executable_resolves_only_the_sibling_app_directory() {
        let executable = std::path::PathBuf::from("bundle").join("AetherTwin-Preview.exe");
        assert_eq!(
            sibling_app_root(&executable),
            Some(std::path::PathBuf::from("bundle").join("app"))
        );
    }

    #[test]
    fn browser_open_is_requested_once_after_binding() {
        let (_temp, app_root) = packaged_app();
        let calls = Cell::new(0);
        let (shutdown_tx, shutdown_rx) = mpsc::channel();
        shutdown_tx.send(()).expect("queue shutdown");

        run_with(
            app_root,
            |url| {
                assert!(url.starts_with("http://127.0.0.1:"));
                calls.set(calls.get() + 1);
                Ok(())
            },
            shutdown_rx,
        )
        .expect("host exits cleanly");

        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn browser_open_failure_is_nonfatal() {
        let (_temp, app_root) = packaged_app();
        let calls = Cell::new(0);
        let (shutdown_tx, shutdown_rx) = mpsc::channel();
        shutdown_tx.send(()).expect("queue shutdown");

        let result = run_with(
            app_root,
            |_| {
                calls.set(calls.get() + 1);
                Err(io::Error::new(io::ErrorKind::NotFound, "fixture detail"))
            },
            shutdown_rx,
        );

        assert!(result.is_ok());
        assert_eq!(calls.get(), 1);
    }
}
