mod local;
mod settings;

use local::UsageReport;
use serde::{Deserialize, Serialize};
use settings::PlanSettings;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
