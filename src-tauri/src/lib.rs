mod local;
mod settings;
mod statusline;
mod tracked_users;

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

    // Admin keys use a separate Admin API — /v1/models returns 401 for them.
    // Accept admin keys by prefix; actual validation happens when fetching data.
    if key_type == "admin" {
        return ValidateResult {
            valid: true,
            key_type,
            error: None,
        };
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return ValidateResult {
                valid: false,
                key_type,
                error: Some(format!("HTTP 클라이언트 오류: {}", e)),
            }
        }
    };

    // Personal keys: validate via /v1/models
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
            error: Some("유효하지 않은 API 키입니다.".to_string()),
        },
        Ok(r) => {
            let status = r.status().as_u16();
            let body = r.text().await.unwrap_or_default();
            ValidateResult {
                valid: false,
                key_type,
                error: Some(format!("응답 오류 ({}): {}", status, &body[..body.len().min(200)])),
            }
        },
        Err(e) => ValidateResult {
            valid: false,
            key_type,
            error: Some(format!("네트워크 오류: {}", e)),
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

// --- OAuth Usage API (real-time data from Anthropic) ---

#[derive(Deserialize, Debug)]
struct OAuthUsageEntry {
    utilization: Option<f64>,
    resets_at: Option<String>,
}

#[derive(Deserialize, Debug)]
struct OAuthExtraUsage {
    is_enabled: Option<bool>,
    monthly_limit: Option<f64>,
    used_credits: Option<f64>,
    utilization: Option<f64>,
}

#[derive(Deserialize, Debug)]
struct OAuthUsageResponse {
    five_hour: Option<OAuthUsageEntry>,
    seven_day: Option<OAuthUsageEntry>,
    seven_day_sonnet: Option<OAuthUsageEntry>,
    extra_usage: Option<OAuthExtraUsage>,
}

#[derive(Serialize, Debug)]
pub struct SubscriptionUsage {
    pub session_pct: f64,
    pub session_reset_at: String,
    pub weekly_pct: f64,
    pub weekly_reset_at: String,
    pub weekly_sonnet_pct: Option<f64>,
    pub weekly_sonnet_reset_at: Option<String>,
    pub extra_usage_enabled: bool,
    pub extra_usage_pct: Option<f64>,
    pub extra_usage_used: Option<f64>,
    pub extra_usage_limit: Option<f64>,
    pub burn_rate_status: String,
    pub burn_rate_label: String,
}

fn get_oauth_token() -> Result<String, String> {
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", "Claude Code-credentials", "-w"])
        .output()
        .map_err(|e| format!("Failed to run security command: {}", e))?;

    if !output.status.success() {
        return Err("Could not read OAuth token from Keychain".to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse keychain data: {}", e))?;

    parsed["claudeAiOauth"]["accessToken"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "OAuth token not found in keychain data".to_string())
}

#[tauri::command]
async fn get_subscription_usage() -> Result<SubscriptionUsage, String> {
    let token = get_oauth_token()?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("API returned status: {}", resp.status()));
    }

    let usage: OAuthUsageResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let session_pct = usage.five_hour.as_ref().and_then(|e| e.utilization).unwrap_or(0.0);
    let session_reset_at = usage.five_hour.as_ref().and_then(|e| e.resets_at.clone()).unwrap_or_default();
    let weekly_pct = usage.seven_day.as_ref().and_then(|e| e.utilization).unwrap_or(0.0);
    let weekly_reset_at = usage.seven_day.as_ref().and_then(|e| e.resets_at.clone()).unwrap_or_default();
    let weekly_sonnet_pct = usage.seven_day_sonnet.as_ref().and_then(|e| e.utilization);
    let weekly_sonnet_reset_at = usage.seven_day_sonnet.as_ref().and_then(|e| e.resets_at.clone());

    let extra = &usage.extra_usage;
    let extra_usage_enabled = extra.as_ref().and_then(|e| e.is_enabled).unwrap_or(false);
    let extra_usage_pct = extra.as_ref().and_then(|e| e.utilization);
    let extra_usage_used = extra.as_ref().and_then(|e| e.used_credits);
    let extra_usage_limit = extra.as_ref().and_then(|e| e.monthly_limit);

    let burn_rate_status = if session_pct >= 80.0 || weekly_pct >= 80.0 {
        "critical"
    } else if session_pct >= 50.0 || weekly_pct >= 50.0 {
        "warning"
    } else {
        "on_track"
    };

    let burn_rate_label = match burn_rate_status {
        "critical" => format!("사용량 주의 · 세션 {:.0}%", session_pct),
        "warning" => format!("보통 · 세션 {:.0}%", session_pct),
        _ => format!("양호 · 세션 {:.0}%", session_pct),
    };

    Ok(SubscriptionUsage {
        session_pct,
        session_reset_at,
        weekly_pct,
        weekly_reset_at,
        weekly_sonnet_pct,
        weekly_sonnet_reset_at,
        extra_usage_enabled,
        extra_usage_pct,
        extra_usage_used,
        extra_usage_limit,
        burn_rate_status: burn_rate_status.to_string(),
        burn_rate_label,
    })
}

#[tauri::command]
fn save_plan_settings(app: tauri::AppHandle, settings: PlanSettings) -> Result<(), String> {
    settings::write_settings(&app, &settings)
}

// --- Multi-user store ---

#[tauri::command]
fn get_tracked_users(app: tauri::AppHandle) -> Result<Vec<tracked_users::TrackedUser>, String> {
    tracked_users::read_tracked_users(&app)
}

#[tauri::command]
fn add_tracked_user(
    app: tauri::AppHandle,
    name: String,
    api_key: String,
    workspace_label: Option<String>,
) -> Result<tracked_users::TrackedUser, String> {
    tracked_users::add_user(&app, name, api_key, workspace_label)
}

#[tauri::command]
fn remove_tracked_user(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tracked_users::remove_user(&app, id)
}

#[tauri::command]
fn update_tracked_user(
    app: tauri::AppHandle,
    id: String,
    name: Option<String>,
    workspace_label: Option<String>,
) -> Result<tracked_users::TrackedUser, String> {
    tracked_users::update_user(&app, id, name, workspace_label)
}

#[tauri::command]
async fn get_all_users_usage(
    app: tauri::AppHandle,
) -> Result<Vec<tracked_users::UserUsageResult>, String> {
    let users = tracked_users::read_tracked_users(&app)?;
    Ok(tracked_users::fetch_all_usage(users).await)
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
            get_tracked_users,
            add_tracked_user,
            remove_tracked_user,
            update_tracked_user,
            get_all_users_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
