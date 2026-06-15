use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn get_autostart_enabled<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart_enabled<R: Runtime>(enabled: bool, app: AppHandle<R>) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}
