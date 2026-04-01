export interface UsageEntry {
  apiKeyId: string;
  workspaceName: string;
  messageCount: number;
  costUsd: number;
  periodStart: string;
  periodEnd: string;
}

export interface AuthState {
  apiKey: string | null;
  keyType: "admin" | "personal" | "subscription";
}

// Local ~/.claude/ data types (mirror of Rust UsageReport structs)

export interface SessionSummary {
  session_id: string;
  workspace: string;
  first_timestamp: string;
  last_timestamp: string;
  models: string[];
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export interface DailyAggregate {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
}

export interface WorkspaceUsage {
  workspace: string;
  session_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  first_seen: string;
  last_seen: string;
}

export interface PlanSettings {
  plan_type: "pro" | "team";
  session_limit: number;
  weekly_limit: number;
  session_reset_hours: number;
  weekly_reset_day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  plan_type: "pro",
  session_limit: 45,
  weekly_limit: 225,
  session_reset_hours: 5,
  weekly_reset_day: "monday",
};

export interface UsageReport {
  sessions: SessionSummary[];
  daily_aggregates: DailyAggregate[];
  workspaces: WorkspaceUsage[];
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  total_sessions: number;
  models_used: string[];
}

// Subscription usage data returned by get_subscription_usage() Tauri IPC (SKI-13)
export interface SubscriptionUsage {
  // Current session
  session_messages: number;
  session_limit: number;
  session_pct: number;           // 0–100
  session_reset_at: string;      // ISO timestamp

  // Weekly
  weekly_messages: number;
  weekly_limit: number;
  weekly_pct: number;            // 0–100
  weekly_reset_at: string;       // ISO timestamp

  // Burn rate
  burn_rate_per_hour: number;    // messages/hr
  burn_rate_status: "on_track" | "warning" | "critical";
  burn_rate_label: string;       // e.g. "On track · 8.0 msg/hr"
}
