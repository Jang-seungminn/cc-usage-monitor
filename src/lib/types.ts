export interface UsageEntry {
  apiKeyId: string;
  workspaceName: string;
  messageCount: number;
  costUsd: number;
  periodStart: string;
  periodEnd: string;
}

export interface AuthState {
  apiKey: string;
  keyType: "admin" | "personal";
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
