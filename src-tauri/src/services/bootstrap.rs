use std::{
    env,
    fs::{self, OpenOptions},
    path::PathBuf,
    process::Command,
    thread,
    time::Duration,
};

use crate::{core::error::AppResult, services::client};

fn daemon_connectable(socket_path: &PathBuf) -> bool {
    client::get_status(socket_path).is_ok()
}

fn spawn_daemon_process(socket_path: &PathBuf, db_path: &PathBuf) -> Result<(), String> {
    let current_exe = env::current_exe().map_err(|error| error.to_string())?;
    Command::new(current_exe)
        .arg("--daemon")
        .arg("--socket")
        .arg(socket_path)
        .arg("--db")
        .arg(db_path)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn ensure_daemon_running(socket_path: &PathBuf, db_path: &PathBuf) -> Result<(), String> {
    if daemon_connectable(socket_path) {
        return Ok(());
    }

    let lock_path = socket_path.with_extension("lock");
    if let Some(parent) = lock_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let spawn_lock = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path);

    let acquired_lock = spawn_lock.is_ok();
    if acquired_lock {
        spawn_daemon_process(socket_path, db_path)?;
    }

    for _ in 0..25 {
        if daemon_connectable(socket_path) {
            if acquired_lock {
                let _ = fs::remove_file(&lock_path);
            }
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }

    if acquired_lock {
        let _ = fs::remove_file(&lock_path);
    }
    Err("daemon did not become available".to_string())
}

pub fn ensure_daemon_running_app(socket_path: &PathBuf, db_path: &PathBuf) -> AppResult<()> {
    ensure_daemon_running(socket_path, db_path)
        .map_err(crate::core::error::AppError::Message)
}
