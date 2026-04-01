use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TrackedUser {
    pub id: String,
    pub name: String,
    pub api_key: String,
    pub workspace_label: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct UserUsageResult {
    pub user_id: String,
    pub name: String,
    pub workspace_label: Option<String>,
    pub weekly_pct: Option<f64>,
    pub session_pct: Option<f64>,
    pub error: Option<String>,
}

// Reuse the same OAuth usage response shape from lib.rs
#[derive(Deserialize, Debug)]
struct UsageEntry {
    utilization: Option<f64>,
}

#[derive(Deserialize, Debug)]
struct UsageResponse {
    five_hour: Option<UsageEntry>,
    seven_day: Option<UsageEntry>,
}

fn tracked_users_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(dir.join("tracked_users.json"))
}

pub fn read_tracked_users(app: &AppHandle) -> Result<Vec<TrackedUser>, String> {
    let path = tracked_users_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read tracked_users.json: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse tracked_users.json: {}", e))
}

fn write_tracked_users(app: &AppHandle, users: &[TrackedUser]) -> Result<(), String> {
    let path = tracked_users_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    let data = serde_json::to_string_pretty(users)
        .map_err(|e| format!("Failed to serialize tracked users: {}", e))?;
    std::fs::write(&path, data)
        .map_err(|e| format!("Failed to write tracked_users.json: {}", e))
}

pub fn add_user(
    app: &AppHandle,
    name: String,
    api_key: String,
    workspace_label: Option<String>,
) -> Result<TrackedUser, String> {
    let mut users = read_tracked_users(app)?;
    let user = TrackedUser {
        id: uuid_v4(),
        name,
        api_key,
        workspace_label,
    };
    users.push(user.clone());
    write_tracked_users(app, &users)?;
    Ok(user)
}

pub fn remove_user(app: &AppHandle, id: String) -> Result<(), String> {
    let mut users = read_tracked_users(app)?;
    let before = users.len();
    users.retain(|u| u.id != id);
    if users.len() == before {
        return Err(format!("User '{}' not found", id));
    }
    write_tracked_users(app, &users)
}

pub fn update_user(
    app: &AppHandle,
    id: String,
    name: Option<String>,
    workspace_label: Option<String>,
) -> Result<TrackedUser, String> {
    let mut users = read_tracked_users(app)?;
    let user = users
        .iter_mut()
        .find(|u| u.id == id)
        .ok_or_else(|| format!("User '{}' not found", id))?;
    if let Some(n) = name {
        user.name = n;
    }
    if workspace_label.is_some() {
        user.workspace_label = workspace_label;
    }
    let updated = user.clone();
    write_tracked_users(app, &users)?;
    Ok(updated)
}

/// Fetch usage for a single user. Tries the OAuth usage endpoint with the
/// stored key as a Bearer token. Falls back to x-api-key header if the
/// key looks like an Anthropic API key (sk-ant-*).
async fn fetch_one(client: reqwest::Client, user: TrackedUser) -> UserUsageResult {
    let base = UserUsageResult {
        user_id: user.id.clone(),
        name: user.name.clone(),
        workspace_label: user.workspace_label.clone(),
        weekly_pct: None,
        session_pct: None,
        error: None,
    };

    // Primary: try OAuth endpoint with Bearer token
    let result = try_fetch_oauth(&client, &user.api_key).await;
    match result {
        Ok((session, weekly)) => UserUsageResult {
            session_pct: Some(session),
            weekly_pct: Some(weekly),
            ..base
        },
        Err(oauth_err) => {
            // Fallback: if it looks like an API key, try x-api-key header
            if user.api_key.starts_with("sk-ant-") {
                match try_fetch_apikey(&client, &user.api_key).await {
                    Ok((session, weekly)) => UserUsageResult {
                        session_pct: Some(session),
                        weekly_pct: Some(weekly),
                        ..base
                    },
                    Err(api_err) => UserUsageResult {
                        error: Some(format!("oauth: {}; api-key: {}", oauth_err, api_err)),
                        ..base
                    },
                }
            } else {
                UserUsageResult {
                    error: Some(oauth_err),
                    ..base
                }
            }
        }
    }
}

async fn try_fetch_oauth(
    client: &reqwest::Client,
    token: &str,
) -> Result<(f64, f64), String> {
    let resp = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let usage: UsageResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let session = usage.five_hour.as_ref().and_then(|e| e.utilization).unwrap_or(0.0);
    let weekly = usage.seven_day.as_ref().and_then(|e| e.utilization).unwrap_or(0.0);
    Ok((session, weekly))
}

async fn try_fetch_apikey(
    client: &reqwest::Client,
    api_key: &str,
) -> Result<(f64, f64), String> {
    let resp = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let usage: UsageResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let session = usage.five_hour.as_ref().and_then(|e| e.utilization).unwrap_or(0.0);
    let weekly = usage.seven_day.as_ref().and_then(|e| e.utilization).unwrap_or(0.0);
    Ok((session, weekly))
}

pub async fn fetch_all_usage(users: Vec<TrackedUser>) -> Vec<UserUsageResult> {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return users
                .into_iter()
                .map(|u| UserUsageResult {
                    user_id: u.id,
                    name: u.name,
                    workspace_label: u.workspace_label,
                    weekly_pct: None,
                    session_pct: None,
                    error: Some(format!("HTTP client error: {}", e)),
                })
                .collect()
        }
    };

    // Spawn a task per user for parallel execution, preserving order
    let handles: Vec<_> = users
        .into_iter()
        .map(|user| {
            let c = client.clone();
            tokio::spawn(async move { fetch_one(c, user).await })
        })
        .collect();

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(r) => results.push(r),
            Err(e) => results.push(UserUsageResult {
                user_id: String::new(),
                name: String::new(),
                workspace_label: None,
                weekly_pct: None,
                session_pct: None,
                error: Some(format!("Task panicked: {}", e)),
            }),
        }
    }
    results
}

/// Simple UUID v4 generator without extra crates.
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    // Use address of a local var for extra entropy (pointer value varies per call)
    let ptr_entropy = {
        let x: u8 = 0;
        &x as *const u8 as u64
    };
    let a = nanos ^ ptr_entropy;
    let b = a.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (a >> 32) as u32,
        (a >> 16) as u16,
        a as u16 & 0x0fff,
        ((b >> 48) as u16 & 0x3fff) | 0x8000,
        b & 0x0000_ffff_ffff_ffff,
    )
}
