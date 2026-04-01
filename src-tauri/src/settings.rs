use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlanSettings {
    pub plan_type: String,       // "pro" | "team"
    pub session_limit: u32,      // message count per session
    pub weekly_limit: u32,       // message count per week
    pub session_reset_hours: f32, // hours between session resets (default 5)
    pub weekly_reset_day: String, // day of week for weekly reset (default "monday")
}

impl Default for PlanSettings {
    fn default() -> Self {
        PlanSettings {
            plan_type: "pro".to_string(),
            session_limit: 45,
            weekly_limit: 225,
            session_reset_hours: 5.0,
            weekly_reset_day: "monday".to_string(),
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(data_dir.join("plan_settings.json"))
}

pub fn read_settings(app: &tauri::AppHandle) -> Result<PlanSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(PlanSettings::default());
    }
    let contents = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

pub fn write_settings(app: &tauri::AppHandle, settings: &PlanSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let contents = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, contents).map_err(|e| e.to_string())
}
