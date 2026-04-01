mod local;
mod settings;
mod statusline;

use local::UsageReport;
use serde::{Deserialize, Serialize};
use settings::PlanSettings;
use statusline::RateLimitsInfo;

const KEYRING_SERVICE: &str = "cc-usage-monitor";
const KEYRING_USER: &str = "anthropic-api-key";
const KEYRING_TYPE_USER: &str = "anthropic-key-type";

#[derive(Serialize, Deserialize, Debug)]
pub struct ValidateResult {
    pub valid: bool,
    pub key_type: String, // "admin" | "personal"
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StoredCredentials {
    pub api_key: String,
    pub key_type: String,
}

fn detect_key_type(api_key: &str) -> &'static str {
    if api_key.starts_with("sk-ant-admin") {
        "admin"
    } else {
        "personal"
    }
}

#[tauri::command]
async fn validate_api_key(api_key: String) -> ValidateResult {
    let key_type = detect_key_type(&api_key).to_string();

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return ValidateResult {
                valid: false,
                key_type,
                error: Some(format!("Failed to create HTTP client: {}", e)),
            }
        }
    };

    // Validate by hitting the models endpoint — works for both key types
    let res = client
        .get("https://api.anthropic.com/v1/models")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await;

    match res {
        Ok(r) if r.status().is_success() => ValidateResult {
            valid: true,
            key_type,
            error: None,
        },
        Ok(r) if r.status() == 401 => ValidateResult {
            valid: false,
            key_type,
            error: Some("Invalid API key.".to_string()),
        },
        Ok(r) => ValidateResult {
            valid: false,
            key_type,
            error: Some(format!("Unexpected response: {}", r.status())),
        },
        Err(e) => ValidateResult {
            valid: false,
            key_type,
            error: Some(format!("Network error: {}", e)),
        },
    }
}

#[tauri::command]
fn store_credentials(api_key: String, key_type: String) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| e.to_string())?
        .set_password(&api_key)
        .map_err(|e| e.to_string())?;

    keyring::Entry::new(KEYRING_SERVICE, KEYRING_TYPE_USER)
        .map_err(|e| e.to_string())?
        .set_password(&key_type)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_stored_credentials() -> Option<StoredCredentials> {
    let api_key = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .ok()?
        .get_password()
        .ok()?;

    let key_type = keyring::Entry::new(KEYRING_SERVICE, KEYRING_TYPE_USER)
        .ok()?
        .get_password()
        .unwrap_or_else(|_| detect_key_type(&api_key).to_string());

    Some(StoredCredentials { api_key, key_type })
}

#[tauri::command]
fn clear_credentials() -> Result<(), String> {
    let _ = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map(|e| e.delete_credential());
    let _ = keyring::Entry::new(KEYRING_SERVICE, KEYRING_TYPE_USER)
        .map(|e| e.delete_credential());
    Ok(())
}

#[tauri::command]
fn get_local_usage() -> Result<UsageReport, String> {
    local::read_local_usage()
}

#[tauri::command]
fn get_plan_settings(app: tauri::AppHandle) -> Result<PlanSettings, String> {
    settings::read_settings(&app)
}

#[tauri::command]
fn get_rate_limits(path: Option<String>) -> Result<RateLimitsInfo, String> {
    statusline::read_rate_limits(path)
}

#[derive(Serialize, Debug)]
pub struct SubscriptionUsage {
    pub session_messages: u32,
    pub session_limit: u32,
    pub session_pct: f64,
    pub session_reset_at: String,
    pub weekly_messages: u32,
    pub weekly_limit: u32,
    pub weekly_pct: f64,
    pub weekly_reset_at: String,
    pub burn_rate_per_hour: f64,
    pub burn_rate_status: String,
    pub burn_rate_label: String,
}

#[tauri::command]
fn get_subscription_usage(app: tauri::AppHandle) -> Result<SubscriptionUsage, String> {
    let rate = statusline::read_rate_limits(None)?;
    let plan = settings::read_settings(&app)?;

    let session_pct = rate.five_hour_pct.unwrap_or(0.0);
    let weekly_pct = rate.seven_day_pct.unwrap_or(0.0);

    let session_limit = plan.session_limit;
    let weekly_limit = plan.weekly_limit;

    let session_messages = ((session_pct / 100.0) * session_limit as f64).round() as u32;
    let weekly_messages = ((weekly_pct / 100.0) * weekly_limit as f64).round() as u32;

    // Convert epoch seconds to ISO string
    let epoch_to_iso = |epoch: Option<i64>| -> String {
        match epoch {
            Some(ts) => {
                let dt = chrono::DateTime::from_timestamp(ts, 0)
                    .unwrap_or_else(|| chrono::Utc::now());
                dt.to_rfc3339()
            }
            None => chrono::Utc::now().to_rfc3339(),
        }
    };

    let session_reset_at = epoch_to_iso(rate.five_hour_resets_at);
    let weekly_reset_at = epoch_to_iso(rate.seven_day_resets_at);

    // Burn rate: messages per hour based on session usage and elapsed time
    let session_reset_epoch = rate.five_hour_resets_at.unwrap_or(0);
    let session_window_secs = (plan.session_reset_hours * 3600.0) as i64;
    let session_start_epoch = session_reset_epoch - session_window_secs;
    let now_epoch = chrono::Utc::now().timestamp();
    let elapsed_hours = ((now_epoch - session_start_epoch) as f64 / 3600.0).max(0.1);
    let burn_rate_per_hour = session_messages as f64 / elapsed_hours;

    let burn_rate_status = if session_pct >= 80.0 || weekly_pct >= 80.0 {
        "critical"
    } else if session_pct >= 50.0 || weekly_pct >= 50.0 {
        "warning"
    } else {
        "on_track"
    };

    let burn_rate_label = match burn_rate_status {
        "critical" => format!("사용량 주의 · {:.1} msg/hr", burn_rate_per_hour),
        "warning" => format!("보통 · {:.1} msg/hr", burn_rate_per_hour),
        _ => format!("양호 · {:.1} msg/hr", burn_rate_per_hour),
    };

    Ok(SubscriptionUsage {
        session_messages,
        session_limit,
        session_pct,
        session_reset_at,
        weekly_messages,
        weekly_limit,
        weekly_pct,
        weekly_reset_at,
        burn_rate_per_hour,
        burn_rate_status: burn_rate_status.to_string(),
        burn_rate_label,
    })
}

#[tauri::command]
fn save_plan_settings(app: tauri::AppHandle, settings: PlanSettings) -> Result<(), String> {
    settings::write_settings(&app, &settings)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            validate_api_key,
            store_credentials,
            get_stored_credentials,
            clear_credentials,
            get_local_usage,
            get_plan_settings,
            save_plan_settings,
            get_rate_limits,
            get_subscription_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
