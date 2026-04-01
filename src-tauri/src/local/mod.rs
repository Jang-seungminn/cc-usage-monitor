use chrono::{DateTime, Utc};
use glob::glob;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

// ── Raw JSONL structures ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RawUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

#[derive(Deserialize)]
struct RawMessage {
    model: Option<String>,
    usage: Option<RawUsage>,
}

#[derive(Deserialize)]
struct RawEntry {
    #[serde(rename = "type")]
    entry_type: Option<String>,
    timestamp: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    cwd: Option<String>,
    message: Option<RawMessage>,
}

// ── Public output structures ──────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct SessionSummary {
    pub session_id: String,
    pub workspace: String,
    pub first_timestamp: String,
    pub last_timestamp: String,
    pub models: Vec<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
}

#[derive(Serialize)]
pub struct DailyAggregate {
    pub date: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Serialize)]
pub struct WorkspaceUsage {
    pub workspace: String,
    pub session_count: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub first_seen: String,
    pub last_seen: String,
}

#[derive(Serialize)]
pub struct UsageReport {
    pub sessions: Vec<SessionSummary>,
    pub daily_aggregates: Vec<DailyAggregate>,
    pub workspaces: Vec<WorkspaceUsage>,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_cache_creation_tokens: u64,
    pub total_sessions: usize,
    pub models_used: Vec<String>,
}

// ── Path decoding ─────────────────────────────────────────────────────────────

/// Convert an encoded project directory name back to a human-readable workspace path.
/// Claude encodes paths by replacing `/` with `-` and stripping the leading slash.
/// e.g. `-Users-juan-Desktop-Projects-foo` → `/Users/juan/Desktop/Projects/foo`
fn decode_project_path(dir_name: &str) -> String {
    // Each directory segment is separated by `-`, with a leading `-`.
    // We convert leading `-` + dashes-between-path-parts back to `/`.
    // Strategy: replace `-` with `/` then ensure leading `/`.
    let decoded = dir_name.replace('-', "/");
    // The result starts with `/` already because the name starts with `-`.
    if decoded.starts_with('/') {
        decoded
    } else {
        format!("/{}", decoded)
    }
}

// ── Parser ────────────────────────────────────────────────────────────────────

struct SessionAccum {
    workspace: String,
    timestamps: Vec<DateTime<Utc>>,
    models: std::collections::HashSet<String>,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_creation_tokens: u64,
}

pub fn read_local_usage() -> Result<UsageReport, String> {
    let home = dirs_home();
    let claude_dir = PathBuf::from(&home).join(".claude").join("projects");

    if !claude_dir.exists() {
        return Ok(empty_report());
    }

    let pattern = format!("{}/**/*.jsonl", claude_dir.display());
    let paths: Vec<PathBuf> = glob(&pattern)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Accumulate per-session data
    let mut sessions: HashMap<String, SessionAccum> = HashMap::new();

    for path in &paths {
        // Derive workspace from the parent directory name
        let workspace = path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| decode_project_path(&n.to_string_lossy()))
            .unwrap_or_else(|| "unknown".to_string());

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue, // skip unreadable files
        };

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let entry: RawEntry = match serde_json::from_str(line) {
                Ok(e) => e,
                Err(_) => continue, // skip corrupt lines
            };

            if entry.entry_type.as_deref() != Some("assistant") {
                continue;
            }

            let msg = match &entry.message {
                Some(m) => m,
                None => continue,
            };

            let usage = match &msg.usage {
                Some(u) => u,
                None => continue,
            };

            let session_id = entry
                .session_id
                .clone()
                .unwrap_or_else(|| path.file_stem().unwrap_or_default().to_string_lossy().to_string());

            let ws = entry
                .cwd
                .clone()
                .unwrap_or_else(|| workspace.clone());

            let ts: Option<DateTime<Utc>> = entry
                .timestamp
                .as_deref()
                .and_then(|s| s.parse().ok());

            let accum = sessions.entry(session_id.clone()).or_insert_with(|| SessionAccum {
                workspace: ws.clone(),
                timestamps: Vec::new(),
                models: std::collections::HashSet::new(),
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_creation_tokens: 0,
            });

            if let Some(t) = ts {
                accum.timestamps.push(t);
            }
            if let Some(model) = &msg.model {
                accum.models.insert(model.clone());
            }
            accum.input_tokens += usage.input_tokens.unwrap_or(0);
            accum.output_tokens += usage.output_tokens.unwrap_or(0);
            accum.cache_read_tokens += usage.cache_read_input_tokens.unwrap_or(0);
            accum.cache_creation_tokens += usage.cache_creation_input_tokens.unwrap_or(0);
        }
    }

    // Build session summaries
    let mut session_list: Vec<SessionSummary> = sessions
        .into_iter()
        .map(|(session_id, acc)| {
            let (first, last) = if acc.timestamps.is_empty() {
                ("".to_string(), "".to_string())
            } else {
                let min = acc.timestamps.iter().min().unwrap();
                let max = acc.timestamps.iter().max().unwrap();
                (min.to_rfc3339(), max.to_rfc3339())
            };
            let mut models: Vec<String> = acc.models.into_iter().collect();
            models.sort();
            SessionSummary {
                session_id,
                workspace: acc.workspace,
                first_timestamp: first,
                last_timestamp: last,
                models,
                input_tokens: acc.input_tokens,
                output_tokens: acc.output_tokens,
                cache_read_tokens: acc.cache_read_tokens,
                cache_creation_tokens: acc.cache_creation_tokens,
            }
        })
        .collect();

    session_list.sort_by(|a, b| b.last_timestamp.cmp(&a.last_timestamp));

    // Build daily aggregates
    let mut daily: HashMap<String, DailyAggregate> = HashMap::new();
    for s in &session_list {
        // Use last_timestamp for daily bucketing
        if s.last_timestamp.is_empty() {
            continue;
        }
        let date = &s.last_timestamp[..10]; // YYYY-MM-DD
        let entry = daily.entry(date.to_string()).or_insert_with(|| DailyAggregate {
            date: date.to_string(),
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            total_tokens: 0,
        });
        entry.input_tokens += s.input_tokens;
        entry.output_tokens += s.output_tokens;
        entry.cache_read_tokens += s.cache_read_tokens;
        entry.cache_creation_tokens += s.cache_creation_tokens;
        entry.total_tokens += s.input_tokens + s.output_tokens;
    }
    let mut daily_list: Vec<DailyAggregate> = daily.into_values().collect();
    daily_list.sort_by(|a, b| b.date.cmp(&a.date));

    // Build workspace summaries
    let mut ws_map: HashMap<String, WorkspaceUsage> = HashMap::new();
    for s in &session_list {
        let entry = ws_map.entry(s.workspace.clone()).or_insert_with(|| WorkspaceUsage {
            workspace: s.workspace.clone(),
            session_count: 0,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            first_seen: s.first_timestamp.clone(),
            last_seen: s.last_timestamp.clone(),
        });
        entry.session_count += 1;
        entry.input_tokens += s.input_tokens;
        entry.output_tokens += s.output_tokens;
        entry.cache_read_tokens += s.cache_read_tokens;
        entry.cache_creation_tokens += s.cache_creation_tokens;
        if !s.first_timestamp.is_empty() && s.first_timestamp < entry.first_seen {
            entry.first_seen = s.first_timestamp.clone();
        }
        if !s.last_timestamp.is_empty() && s.last_timestamp > entry.last_seen {
            entry.last_seen = s.last_timestamp.clone();
        }
    }
    let mut workspace_list: Vec<WorkspaceUsage> = ws_map.into_values().collect();
    workspace_list.sort_by(|a, b| (b.input_tokens + b.output_tokens).cmp(&(a.input_tokens + a.output_tokens)));

    // Totals
    let total_input = session_list.iter().map(|s| s.input_tokens).sum();
    let total_output = session_list.iter().map(|s| s.output_tokens).sum();
    let total_cache_read = session_list.iter().map(|s| s.cache_read_tokens).sum();
    let total_cache_creation = session_list.iter().map(|s| s.cache_creation_tokens).sum();
    let total_sessions = session_list.len();

    let mut all_models: std::collections::HashSet<String> = std::collections::HashSet::new();
    for s in &session_list {
        for m in &s.models {
            all_models.insert(m.clone());
        }
    }
    let mut models_used: Vec<String> = all_models.into_iter().collect();
    models_used.sort();

    Ok(UsageReport {
        sessions: session_list,
        daily_aggregates: daily_list,
        workspaces: workspace_list,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_cache_read_tokens: total_cache_read,
        total_cache_creation_tokens: total_cache_creation,
        total_sessions,
        models_used,
    })
}

fn dirs_home() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "~".to_string())
}

fn empty_report() -> UsageReport {
    UsageReport {
        sessions: vec![],
        daily_aggregates: vec![],
        workspaces: vec![],
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_read_tokens: 0,
        total_cache_creation_tokens: 0,
        total_sessions: 0,
        models_used: vec![],
    }
}
