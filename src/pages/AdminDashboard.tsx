import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "../hooks/useAuth";
import { useAnthropicAdmin } from "../hooks/useAnthropicAdmin";
import HorseRaceTrack from "../components/HorseRaceTrack";
import UserManagementModal from "../components/UserManagementModal";
import "../styles/AdminDashboard.css";

interface OrgMemberKey {
  key_id: string;
  key_name: string;
  partial_hint: string;
  status: string;
  workspace_id: string | null;
}

interface OrgMember {
  user_id: string;
  email: string;
  name: string;
  role: string;
  api_keys: OrgMemberKey[];
}

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
  const { auth, logout } = useAuth();
  const { users, loading, error, lastUpdated, refresh } = useAnthropicAdmin();
  const [showModal, setShowModal] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Auto-discover org members on mount
  const discoverOrg = useCallback(async () => {
    if (!auth?.apiKey) return;
    setOrgLoading(true);
    setOrgError(null);
    try {
      const members = await invoke<OrgMember[]>("get_org_members", { adminKey: auth.apiKey });
      setOrgMembers(members);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : String(err));
    } finally {
      setOrgLoading(false);
    }
  }, [auth?.apiKey]);

  useEffect(() => {
    discoverOrg();
  }, [discoverOrg]);

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

        {/* Org members auto-discovered */}
        {orgMembers.length > 0 && (
          <div className="ad-org-section">
            <h3 className="ad-org-title">조직 멤버 ({orgMembers.length}명)</h3>
            <div className="ad-org-grid">
              {orgMembers.map((m) => (
                <div key={m.user_id} className="ad-org-card">
                  <div className="ad-org-card-header">
                    <span className="ad-org-name">{m.name}</span>
                    <span className={`ad-org-role ad-org-role--${m.role}`}>{m.role}</span>
                  </div>
                  <div className="ad-org-email">{m.email}</div>
                  {m.api_keys.length > 0 ? (
                    <div className="ad-org-keys">
                      {m.api_keys.map((k) => (
                        <div key={k.key_id} className="ad-org-key">
                          <span className="ad-org-key-name">{k.key_name}</span>
                          <span className="ad-org-key-hint">{k.partial_hint}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ad-org-no-keys">API 키 없음</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {orgLoading && (
          <div className="ad-org-loading">조직 멤버 불러오는 중...</div>
        )}

        {orgError && !orgLoading && (
          <div className="ad-org-error">
            <span>⚠ 조직 정보 조회 실패: </span>
            <span>{orgError}</span>
          </div>
        )}
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
