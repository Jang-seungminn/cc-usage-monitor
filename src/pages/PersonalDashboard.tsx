import { useAuth } from "../hooks/useAuth";
import { useLocalUsage } from "../hooks/useLocalUsage";
import { tokensToUsd } from "../lib/pricing";
import UsageBar from "../components/UsageBar";
import CostCard from "../components/CostCard";
import ResetCountdown from "../components/ResetCountdown";
import UsageChart from "../components/UsageChart";
import ActivityHeatmap from "../components/ActivityHeatmap";
import "../styles/PersonalDashboard.css";

const WORKSPACE_COLORS = [
  "#6366f1",
  "#38bda4",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
];

// Claude context window limits by model family
const CONTEXT_WINDOW: Record<string, number> = {
  "opus": 200_000,
  "sonnet": 200_000,
  "haiku": 200_000,
};

function getContextLimit(model: string): number {
  for (const [family, limit] of Object.entries(CONTEXT_WINDOW)) {
    if (model.includes(family)) return limit;
  }
  return 200_000;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function shortDay(isoDate: string): string {
  try {
    const d = new Date(isoDate + "T00:00:00Z");
    return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "UTC" });
  } catch {
    return isoDate.slice(5);
  }
}

function estimateTotalCost(sessions: { models: string[]; input_tokens: number; output_tokens: number }[]): number {
  return sessions.reduce((sum, s) => {
    const model = s.models[0] ?? "claude-sonnet-4";
    return sum + tokensToUsd(model, s.input_tokens, s.output_tokens);
  }, 0);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

const TYPE_LABELS: Record<string, string> = {
  admin: "Admin",
  personal: "API",
  subscription: "구독형",
};

export default function PersonalDashboard() {
  const { auth, logout } = useAuth();
  const { report, loading, error, refresh } = useLocalUsage();

  const isSubscription = auth?.keyType === "subscription";
  const totalCost = report ? estimateTotalCost(report.sessions) : 0;
  const totalTokens = report
    ? report.total_input_tokens + report.total_output_tokens
    : 0;

  const last14Days = (report?.daily_aggregates ?? []).slice(0, 14).reverse();
  const maxDayTokens = Math.max(...last14Days.map((d) => d.total_tokens), 1);

  const topWorkspaces = (report?.workspaces ?? []).slice(0, 8);
  const maxWsTokens = Math.max(
    ...topWorkspaces.map((w) => w.input_tokens + w.output_tokens),
    1
  );

  const recentSessions = (report?.sessions ?? []).slice(0, 10);

  return (
    <div className="pd-root">
      <header className="pd-topbar">
        <div className="pd-topbar-left">
          <span className="pd-logo-icon">⚡</span>
          <span className="pd-topbar-title">cc-usage-monitor</span>
        </div>
        <div className="pd-topbar-right">
          {auth && (
            <span className={`pd-badge pd-badge--${auth.keyType}`}>
              {TYPE_LABELS[auth.keyType] ?? auth.keyType}
            </span>
          )}
          <button className="pd-refresh-btn" onClick={refresh} title="새로고침">
            ↻ 새로고침
          </button>
          <button className="pd-logout-btn" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      <main className="pd-content">
        {loading && !report && (
          <div className="pd-loading">
            <span className="login-spinner" />
            로컬 사용 데이터를 읽는 중…
          </div>
        )}

        {error && (
          <div className="pd-error">
            로컬 사용 데이터 읽기 실패: {error}
          </div>
        )}

        {report && (
          <>
            {/* Overview cards */}
            <section>
              <div className="pd-section-header">
                <span className="pd-section-title">개요</span>
              </div>
              <div className="pd-cards">
                <CostCard
                  icon="💬"
                  label="세션"
                  value={String(report.total_sessions)}
                  sub="총 기록된 세션"
                  accent="#6366f1"
                />
                <CostCard
                  icon="🔢"
                  label="총 토큰"
                  value={fmtTokens(totalTokens)}
                  sub={`${fmtTokens(report.total_input_tokens)} 입력 · ${fmtTokens(report.total_output_tokens)} 출력`}
                  accent="#38bda4"
                />
                {isSubscription ? (
                  <CostCard
                    icon="📊"
                    label="캐시 토큰"
                    value={fmtTokens(report.total_cache_read_tokens)}
                    sub={`생성 ${fmtTokens(report.total_cache_creation_tokens)}`}
                    accent="#f59e0b"
                  />
                ) : (
                  <CostCard
                    icon="💰"
                    label="예상 비용"
                    value={fmtCost(totalCost)}
                    sub="토큰 가격 기준"
                    accent="#f59e0b"
                  />
                )}
                <CostCard
                  icon="🤖"
                  label="사용 모델"
                  value={String(report.models_used.length)}
                  sub={report.models_used.slice(0, 2).map(m => m.replace("claude-", "").replace(/-\d{8}$/, "")).join(", ") || "—"}
                  accent="#8b5cf6"
                />
              </div>
            </section>

            {/* Subscription: session context window usage */}
            {isSubscription && recentSessions.length > 0 && (
              <section className="pd-context-section">
                <div className="pd-section-header">
                  <span className="pd-section-title">세션별 컨텍스트 윈도우 사용량</span>
                </div>
                <div className="pd-context-list">
                  {recentSessions.map((s) => {
                    const totalSessionTokens = s.input_tokens + s.output_tokens + s.cache_read_tokens + s.cache_creation_tokens;
                    const model = s.models[0] ?? "claude-sonnet-4";
                    const limit = getContextLimit(model);
                    const pct = Math.min((totalSessionTokens / limit) * 100, 100);
                    const shortModel = model.replace("claude-", "").replace(/-\d{8}$/, "");
                    const wsName = s.workspace.split("/").slice(-1)[0] || s.workspace;

                    return (
                      <div className="pd-context-row" key={s.session_id}>
                        <div className="pd-context-info">
                          <span className="pd-context-ws">{wsName}</span>
                          <span className="pd-context-meta">
                            {shortModel} · {timeAgo(s.last_timestamp)}
                          </span>
                        </div>
                        <div className="pd-context-bar-wrap">
                          <div className="pd-context-bar-bg">
                            <div
                              className={`pd-context-bar-fill${pct > 80 ? " pd-context-bar-fill--warn" : ""}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="pd-context-pct">
                            {fmtTokens(totalSessionTokens)} / {fmtTokens(limit)} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* API mode: monthly reset countdown */}
            {!isSubscription && <ResetCountdown />}

            {/* Daily token chart */}
            {last14Days.length > 0 && (
              <section className="pd-chart-section">
                <div className="pd-section-header">
                  <span className="pd-section-title">일별 토큰 사용량 (최근 14일)</span>
                </div>
                <div className="pd-chart-bars">
                  {last14Days.map((d) => {
                    const heightPct = (d.total_tokens / maxDayTokens) * 100;
                    return (
                      <div className="pd-chart-col" key={d.date}>
                        <div
                          className="pd-chart-bar"
                          style={{ height: `${heightPct}%` }}
                          title={`${d.date}: ${fmtTokens(d.total_tokens)} 토큰`}
                        />
                        <span className="pd-chart-day">{shortDay(d.date)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Usage time series chart */}
            <section className="pd-chart-section">
              <UsageChart
                sessions={report.sessions}
                dailyAggregates={report.daily_aggregates}
              />
            </section>

            {/* Activity heatmap */}
            <section className="pd-chart-section">
              <ActivityHeatmap sessions={report.sessions} />
            </section>

            {/* Workspaces */}
            {topWorkspaces.length > 0 && (
              <section className="pd-workspaces-section">
                <div className="pd-section-header">
                  <span className="pd-section-title">워크스페이스</span>
                  <span className="pd-section-title">{topWorkspaces.length}개 활성</span>
                </div>
                {topWorkspaces.map((ws, i) => {
                  const tokens = ws.input_tokens + ws.output_tokens;
                  const label = ws.workspace.split("/").slice(-2).join("/");
                  const valueLabel = isSubscription
                    ? `${fmtTokens(tokens)} 토큰 · ${ws.session_count}세션`
                    : `${fmtTokens(tokens)} · ${fmtCost(estimateTotalCost(report.sessions.filter((s) => s.workspace === ws.workspace)))}`;
                  return (
                    <UsageBar
                      key={ws.workspace}
                      label={label}
                      value={tokens}
                      max={maxWsTokens}
                      valueLabel={valueLabel}
                      color={WORKSPACE_COLORS[i % WORKSPACE_COLORS.length]}
                    />
                  );
                })}
              </section>
            )}

            {/* Recent sessions (API mode only — subscription shows context window view above) */}
            {!isSubscription && recentSessions.length > 0 && (
              <section className="pd-sessions-section">
                <div className="pd-section-header">
                  <span className="pd-section-title">최근 세션</span>
                </div>
                <div className="pd-sessions-list">
                  {recentSessions.map((s) => {
                    const tokens = s.input_tokens + s.output_tokens;
                    const model = s.models[0] ?? "unknown";
                    const shortModel = model.replace("claude-", "").replace(/-\d{8}$/, "");
                    return (
                      <div className="pd-session-row" key={s.session_id}>
                        <div className="pd-session-left">
                          <span className="pd-session-workspace">
                            {s.workspace.split("/").slice(-1)[0] || s.workspace}
                          </span>
                          <span className="pd-session-time">
                            {fmtDate(s.last_timestamp)}
                          </span>
                        </div>
                        <div className="pd-session-right">
                          <span className="pd-session-tokens">
                            {fmtTokens(tokens)} 토큰
                          </span>
                          <span className="pd-session-model">{shortModel}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {report.total_sessions === 0 && (
              <div className="pd-empty">
                ~/.claude/projects/ 에서 사용 데이터를 찾을 수 없습니다
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
