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
