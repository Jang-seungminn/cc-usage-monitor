import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSubscriptionUsage } from "../hooks/useSubscriptionUsage";
import "../styles/SubscriptionDashboard.css";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAccentClass(pct: number): string {
  if (pct >= 85) return "accent--critical";
  if (pct >= 60) return "accent--warning";
  return "accent--ok";
}

function formatPct(pct: number): string {
  return Math.min(pct, 100).toFixed(1);
}

interface Countdown {
  hours: number;
  minutes: number;
  seconds: number;
  label: string;
}

function computeCountdown(resetAt: string): Countdown {
  const diff = Math.max(0, new Date(resetAt).getTime() - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    // e.g. "월요일 18:00" style
    const d = new Date(resetAt);
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    const dayName = dayNames[d.getDay()];
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return { hours, minutes, seconds, label: `${dayName}요일 ${hh}:${mm} 리셋 · ${days}일 ${remHours}시간 후` };
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return { hours, minutes, seconds, label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)} 후 리셋` };
}

// ── Countdown display — live ticking ─────────────────────────────────────────

function CountdownTicker({ resetAt, label }: { resetAt: string; label: string }) {
  const [cd, setCd] = useState(() => computeCountdown(resetAt));

  useEffect(() => {
    setCd(computeCountdown(resetAt));
    const id = setInterval(() => setCd(computeCountdown(resetAt)), 1000);
    return () => clearInterval(id);
  }, [resetAt]);

  return (
    <div className="sd-countdown">
      <span className="sd-countdown-icon">⏱</span>
      <span className="sd-countdown-text">{cd.label}</span>
      <span className="sd-countdown-sub">{label}</span>
    </div>
  );
}

// ── Metric panel ──────────────────────────────────────────────────────────────

interface MetricPanelProps {
  title: string;
  subtitle: string;
  pct: number;
  messages: number;
  limit: number;
  resetAt: string;
  resetLabel: string;
}

function MetricPanel({ title, subtitle, pct, messages, limit, resetAt, resetLabel }: MetricPanelProps) {
  const accentClass = getAccentClass(pct);
  const clampedPct = Math.min(pct, 100);

  return (
    <div className={`sd-panel ${accentClass}`}>
      <div className="sd-panel-header">
        <div>
          <div className="sd-panel-title">{title}</div>
          <div className="sd-panel-subtitle">{subtitle}</div>
        </div>
        <div className={`sd-status-dot ${accentClass}`} />
      </div>

      <div className="sd-pct-display">
        <span className="sd-pct-number">{formatPct(pct)}</span>
        <span className="sd-pct-sign">%</span>
      </div>

      <div className="sd-progress-track">
        <div
          className={`sd-progress-fill ${accentClass}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>

      <div className="sd-panel-footer">
        <span className="sd-msg-count">
          <span className="sd-msg-current">{messages}</span>
          <span className="sd-msg-sep"> / </span>
          <span className="sd-msg-limit">{limit}</span>
          <span className="sd-msg-label"> 메시지</span>
        </span>
        <CountdownTicker resetAt={resetAt} label={resetLabel} />
      </div>
    </div>
  );
}

// ── Burn rate banner ──────────────────────────────────────────────────────────

const BURN_STATUS_LABELS: Record<string, { icon: string; cls: string }> = {
  on_track: { icon: "✓", cls: "burn--ok" },
  warning:  { icon: "⚠", cls: "burn--warning" },
  critical: { icon: "↑", cls: "burn--critical" },
};

function BurnRateBanner({ label, status }: { label: string; status: string }) {
  const { icon, cls } = BURN_STATUS_LABELS[status] ?? BURN_STATUS_LABELS.on_track;
  return (
    <div className={`sd-burn ${cls}`}>
      <span className="sd-burn-icon">{icon}</span>
      <span className="sd-burn-label">{label}</span>
    </div>
  );
}

// ── Skeleton / loading state ──────────────────────────────────────────────────

function SkeletonPanel() {
  return (
    <div className="sd-panel sd-panel--skeleton">
      <div className="sd-skeleton-pct" />
      <div className="sd-skeleton-bar" />
      <div className="sd-skeleton-footer" />
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function SubscriptionDashboard() {
  const { auth, logout } = useAuth();
  const { usage, loading, error, refresh } = useSubscriptionUsage();

  const planLabel = auth?.keyType === "subscription" ? "구독형" : "Claude";

  return (
    <div className="sd-root">
      {/* ── Top bar ── */}
      <header className="sd-topbar">
        <div className="sd-topbar-left">
          <span className="sd-logo">⚡</span>
          <span className="sd-appname">cc-usage-monitor</span>
          <span className="sd-plan-badge">{planLabel}</span>
        </div>
        <div className="sd-topbar-right">
          <button className="sd-btn sd-btn--ghost" onClick={refresh} title="새로고침">
            ↻
          </button>
          <button className="sd-btn sd-btn--logout" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="sd-main">

        {/* Error: backend not ready */}
        {error && (
          <div className="sd-error-card">
            <div className="sd-error-icon">⚠</div>
            <div className="sd-error-body">
              <div className="sd-error-title">사용량 데이터를 불러올 수 없습니다</div>
              <div className="sd-error-msg">{error}</div>
              <div className="sd-error-hint">
                계산 엔진(SKI-13)이 아직 준비 중입니다. 백엔드 Engineer가 구현을 완료하면 자동으로 표시됩니다.
              </div>
            </div>
            <button className="sd-btn sd-btn--ghost" onClick={refresh}>
              다시 시도
            </button>
          </div>
        )}

        {/* Panels */}
        <div className="sd-panels">
          {loading && !usage ? (
            <>
              <SkeletonPanel />
              <SkeletonPanel />
            </>
          ) : usage ? (
            <>
              <MetricPanel
                title="현재 세션"
                subtitle="세션 사용량"
                pct={usage.session_pct}
                messages={usage.session_messages}
                limit={usage.session_limit}
                resetAt={usage.session_reset_at}
                resetLabel="세션 리셋"
              />
              <MetricPanel
                title="주간 한도"
                subtitle="이번 주 누적"
                pct={usage.weekly_pct}
                messages={usage.weekly_messages}
                limit={usage.weekly_limit}
                resetAt={usage.weekly_reset_at}
                resetLabel="주간 리셋"
              />
            </>
          ) : null}
        </div>

        {/* Burn rate */}
        {usage && (
          <BurnRateBanner
            label={usage.burn_rate_label}
            status={usage.burn_rate_status}
          />
        )}

        {/* Loading skeleton burn rate */}
        {loading && !usage && (
          <div className="sd-skeleton-burn" />
        )}
      </main>
    </div>
  );
}
