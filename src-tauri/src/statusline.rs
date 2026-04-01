use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

// ── Raw JSON structures ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RawRateLimit {
    used_percentage: Option<f64>,
    resets_at: Option<i64>,
}

#[derive(Deserialize)]
struct RawRateLimits {
    five_hour: Option<RawRateLimit>,
    seven_day: Option<RawRateLimit>,
}

#[derive(Deserialize)]
struct RawContextWindow {
    context_window_size: Option<u64>,
    used_percentage: Option<f64>,
}

#[derive(Deserialize)]
struct RawModel {
    id: Option<String>,
}

#[derive(Deserialize)]
struct RawInner {
    model: Option<RawModel>,
    context_window: Option<RawContextWindow>,
    rate_limits: Option<RawRateLimits>,
}

#[derive(Deserialize)]
struct RawStatuslineState {
    #[serde(rename = "capturedAt")]
    captured_at: Option<String>,
    raw: Option<RawInner>,
}

// ── Public output structure ───────────────────────────────────────────────────

#[derive(Serialize, Debug)]
pub struct RateLimitsInfo {
    pub five_hour_pct: Option<f64>,
    pub five_hour_resets_at: Option<i64>,
    pub seven_day_pct: Option<f64>,
    pub seven_day_resets_at: Option<i64>,
    pub context_window_size: Option<u64>,
    pub current_usage_pct: Option<f64>,
    pub model: Option<String>,
    pub last_updated: Option<String>,
    /// Age of the file in seconds; None if file not found or time unavailable.
    pub file_age_secs: Option<u64>,
    pub stale: bool,
}

// ── Reader ────────────────────────────────────────────────────────────────────

const DEFAULT_PATH: &str = ".claude/cc-usage-monitor/statusline-state.json";
/// Consider data stale if older than 5 minutes.
const STALE_SECS: u64 = 300;

pub fn read_rate_limits(custom_path: Option<String>) -> Result<RateLimitsInfo, String> {
    let path = resolve_path(custom_path);

    let metadata = fs::metadata(&path).ok();
    let file_age_secs = metadata.as_ref().and_then(|m| {
        let modified = m.modified().ok()?;
        let now = SystemTime::now();
        now.duration_since(modified).ok().map(|d| d.as_secs())
    });

    let stale = match file_age_secs {
        Some(age) => age > STALE_SECS,
        None => true, // file missing → treat as stale
    };

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read statusline state file at {}: {}", path.display(), e))?;

    let state: RawStatuslineState = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse statusline state JSON: {}", e))?;

    let raw = state.raw.as_ref();

    let rate_limits = raw.and_then(|r| r.rate_limits.as_ref());
    let context_window = raw.and_then(|r| r.context_window.as_ref());
    let model = raw
        .and_then(|r| r.model.as_ref())
        .and_then(|m| m.id.clone());

    Ok(RateLimitsInfo {
        five_hour_pct: rate_limits
            .and_then(|rl| rl.five_hour.as_ref())
            .and_then(|r| r.used_percentage),
        five_hour_resets_at: rate_limits
            .and_then(|rl| rl.five_hour.as_ref())
            .and_then(|r| r.resets_at),
        seven_day_pct: rate_limits
            .and_then(|rl| rl.seven_day.as_ref())
            .and_then(|r| r.used_percentage),
        seven_day_resets_at: rate_limits
            .and_then(|rl| rl.seven_day.as_ref())
            .and_then(|r| r.resets_at),
        context_window_size: context_window.and_then(|cw| cw.context_window_size),
        current_usage_pct: context_window.and_then(|cw| cw.used_percentage),
        model,
        last_updated: state.captured_at,
        file_age_secs,
        stale,
    })
}

fn resolve_path(custom: Option<String>) -> PathBuf {
    if let Some(p) = custom {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "~".to_string());
    PathBuf::from(home).join(DEFAULT_PATH)
}
