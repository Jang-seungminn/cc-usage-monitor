import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useAnthropicAdmin } from "../hooks/useAnthropicAdmin";
import HorseRaceTrack from "../components/HorseRaceTrack";
import UserManagementModal from "../components/UserManagementModal";
import "../styles/AdminDashboard.css";

// ── Monthly reset countdown ───────────────────────────────────────────────────

function nextMonthlyReset(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
}

function formatMonthlyCountdown(target: Date): string {
  const diff = Math.max(0, target.getTime() - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}일 ${hours}시간 후 월간 리셋`;
  if (hours > 0) return `${hours}시간 ${mins}분 후 월간 리셋`;
  return `${mins}분 후 월간 리셋`;
}

function MonthlyCountdown() {
  const [label, setLabel] = useState(() => formatMonthlyCountdown(nextMonthlyReset()));
  useEffect(() => {
    const target = nextMonthlyReset();
    const id = setInterval(() => setLabel(formatMonthlyCountdown(target)), 60_000);
    return () => clearInterval(id);
  }, []);
  return <span className="ad-reset-countdown">⏱ {label}</span>;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { logout } = useAuth();
  const { users, loading, error, lastUpdated, refresh } = useAnthropicAdmin();
  const [showModal, setShowModal] = useState(false);

  function handleSaved() {
    refresh();
  }

  return (
    <div className="ad-root">
      {/* ── Top bar ── */}
      <header className="ad-topbar">
        <div className="ad-topbar-left">
          <span className="ad-logo">🏇</span>
          <span className="ad-appname">cc-usage-monitor</span>
          <span className="ad-badge">Admin</span>
        </div>
        <div className="ad-topbar-center">
          <MonthlyCountdown />
          {lastUpdated && (
            <span className="ad-last-updated">
              업데이트: {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
        <div className="ad-topbar-right">
          <button className="ad-btn ad-btn--ghost" onClick={refresh} title="새로고침" disabled={loading}>
            ↻
          </button>
          <button className="ad-btn ad-btn--primary" onClick={() => setShowModal(true)}>
            + 사용자 관리
          </button>
          <button className="ad-btn ad-btn--logout" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="ad-main">
        <div className="ad-section-title">
          <h2>팀 사용량 현황</h2>
          <p className="ad-section-sub">주간 사용량 기준 · 30초마다 자동 갱신</p>
        </div>

        {/* API error banner (SKI-16 not yet ready shows this) */}
        {error && (
          <div className="ad-error-card">
            <span className="ad-error-icon">⚠</span>
            <div className="ad-error-body">
              <div className="ad-error-title">사용량 데이터를 불러올 수 없습니다</div>
              <div className="ad-error-msg">{error}</div>
              {error.includes("not found") || error.includes("unknown command") ? (
                <div className="ad-error-hint">
                  Rust 백엔드(<code>get_all_users_usage</code>)가 아직 준비되지 않았습니다. SKI-16 완료 후 사용 가능합니다.
                </div>
              ) : null}
            </div>
            <button className="ad-btn ad-btn--ghost" onClick={refresh}>
              다시 시도
            </button>
          </div>
        )}

        {/* Horse race visualization */}
        <HorseRaceTrack
          users={users}
          loading={loading}
          onAddUser={() => setShowModal(true)}
        />
      </main>

      {/* ── User management modal ── */}
      {showModal && (
        <UserManagementModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
