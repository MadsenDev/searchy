use std::{path::Path, process::Command};

use crate::core::error::{AppError, AppResult};

pub fn open_path(path: &str) -> AppResult<()> {
    run_xdg_open(Path::new(path))
}

pub fn reveal_path(path: &str) -> AppResult<()> {
    let target = Path::new(path);
    let parent = if target.is_dir() {
        target
    } else {
        target.parent().unwrap_or(target)
    };
    run_xdg_open(parent)
}

fn run_xdg_open(path: &Path) -> AppResult<()> {
    let status = Command::new("xdg-open").arg(path).status()?;
    if !status.success() {
        return Err(AppError::Message(format!(
            "xdg-open failed for {}",
            path.display()
        )));
    }
    Ok(())
}
