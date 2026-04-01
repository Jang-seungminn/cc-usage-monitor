import { useState } from "react";
import { UserUsageResult } from "../hooks/useAnthropicAdmin";

// ── Color helpers ─────────────────────────────────────────────────────────────

function laneAccent(pct: number): string {
  if (pct >= 80) return "lane--red";
  if (pct >= 60) return "lane--yellow";
  return "lane--green";
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

// ── Single lane ───────────────────────────────────────────────────────────────

interface LaneProps {
  user: UserUsageResult;
  rank: number;
}

function Lane({ user, rank }: LaneProps) {
  const pct = Math.min(Math.max(user.weekly_pct, 0), 100);
  const accent = laneAccent(pct);
  const hasError = Boolean(user.error);

  return (
    <div className={`hr-lane ${accent} ${hasError ? "lane--error" : ""}`}>
      {/* Left label */}
      <div className="hr-lane-label">
        <span className="hr-lane-rank">#{rank}</span>
        <div className="hr-lane-info">
          <span className="hr-lane-name">{user.name}</span>
          {user.workspace_label && (
            <span className="hr-lane-ws">{user.workspace_label}</span>
          )}
        </div>
      </div>

      {/* Track */}
      <div className="hr-track">
        {/* Finish lines */}
        <div className="hr-finish-line hr-finish-line--warning" style={{ left: "80%" }} title="경고선 80%" />
        <div className="hr-finish-line hr-finish-line--max" style={{ left: "100%" }} title="완주선 100%" />

        {/* Horse */}
        {hasError ? (
          <div className="hr-horse hr-horse--error" style={{ left: "0%" }}>⚠</div>
        ) : (
          <div className="hr-horse" style={{ left: `calc(${pct}% - 1.1rem)` }}>
            🏇
          </div>
        )}

        {/* Shaded fill */}
        <div className={`hr-fill ${accent}`} style={{ width: `${pct}%` }} />
      </div>

      {/* Right pct */}
      <div className="hr-lane-pct">
        {hasError ? (
          <span className="hr-lane-err-msg" title={user.error}>ERR</span>
        ) : (
          <span>{pct.toFixed(1)}%</span>
        )}
      </div>
    </div>
  );
}

// ── Skeleton lane ─────────────────────────────────────────────────────────────

function SkeletonLane() {
  return (
    <div className="hr-lane hr-lane--skeleton">
      <div className="hr-skeleton-label" />
      <div className="hr-track">
        <div className="hr-skeleton-fill" />
      </div>
      <div className="hr-skeleton-pct" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="hr-empty">
      <div className="hr-empty-icon">🏇</div>
      <div className="hr-empty-title">추적 중인 사용자가 없습니다</div>
      <div className="hr-empty-sub">사용자를 추가하면 경마 트랙이 표시됩니다</div>
      <button className="hr-btn hr-btn--primary" onClick={onAdd}>
        + 사용자 추가
      </button>
    </div>
  );
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterTab = "all" | "workspace" | "personal";

interface FilterBarProps {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
}

function FilterBar({ active, onChange }: FilterBarProps) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "workspace", label: "워크스페이스" },
    { key: "personal", label: "개인 API" },
  ];
  return (
    <div className="hr-filter-bar">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`hr-filter-tab ${active === t.key ? "hr-filter-tab--active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Track legend ─────────────────────────────────────────────────────────────

function TrackLegend() {
  return (
    <div className="hr-legend">
      <span className="hr-legend-item hr-legend-item--green">0–59% 양호</span>
      <span className="hr-legend-item hr-legend-item--yellow">60–79% 주의</span>
      <span className="hr-legend-item hr-legend-item--red">80%+ 위험</span>
      <span className="hr-legend-item hr-legend-item--line">| 80% 경고선</span>
      <span className="hr-legend-item hr-legend-item--max">‖ 완주선</span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface HorseRaceTrackProps {
  users: UserUsageResult[];
  loading: boolean;
  onAddUser: () => void;
}

export default function HorseRaceTrack({ users, loading, onAddUser }: HorseRaceTrackProps) {
  const [filter, setFilter] = useState<FilterTab>("all");

  const filtered = users.filter((u) => {
    if (filter === "workspace") return Boolean(u.workspace_label);
    if (filter === "personal") return !u.workspace_label;
    return true;
  });

  // Sort descending by weekly_pct so leaders appear first
  const sorted = [...filtered].sort((a, b) => b.weekly_pct - a.weekly_pct);

  return (
    <div className="hr-root">
      <FilterBar active={filter} onChange={setFilter} />

      <div className="hr-track-container">
        {/* Column headers */}
        <div className="hr-col-header">
          <span className="hr-col-label">사용자</span>
          <span className="hr-col-track">주간 사용량 (0% → 100%)</span>
          <span className="hr-col-pct">%</span>
        </div>

        {loading && users.length === 0 ? (
          <>
            <SkeletonLane />
            <SkeletonLane />
            <SkeletonLane />
          </>
        ) : sorted.length === 0 ? (
          <EmptyState onAdd={onAddUser} />
        ) : (
          sorted.map((u, i) => <Lane key={u.user_id} user={u} rank={i + 1} />)
        )}
      </div>

      {sorted.length > 0 && <TrackLegend />}
    </div>
  );
}

// maskKey exported for UserManagementModal
export { maskKey };
