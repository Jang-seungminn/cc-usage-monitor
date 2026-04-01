import { useState, useMemo } from "react";
import type { SessionSummary, DailyAggregate } from "../lib/types";

type Range = "5h" | "24h" | "7d";

interface DataPoint {
  label: string;
  primary: number;   // blue: input+output tokens
  secondary: number; // orange: cache tokens
}

// Cardinal spline — smooth cubic bezier through points
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`;
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cp1x = x0 + (x1 - x0) / 3;
    const cp2x = x1 - (x1 - x0) / 3;
    d += ` C ${cp1x},${y0} ${cp2x},${y1} ${x1},${y1}`;
  }
  return d;
}

function computeData(
  sessions: SessionSummary[],
  daily: DailyAggregate[],
  range: Range
): DataPoint[] {
  if (range === "7d") {
    const days = [...daily].slice(0, 7).reverse();
    return days.map((d) => ({
      label: d.date.slice(5).replace("-", "/"),
      primary: d.input_tokens + d.output_tokens,
      secondary: d.cache_read_tokens + d.cache_creation_tokens,
    }));
  }

  const now = Date.now();
  const rangeMs = range === "24h" ? 24 * 3_600_000 : 5 * 3_600_000;
  const bucketMs = range === "24h" ? 3_600_000 : 30 * 60_000;
  const numBuckets = range === "24h" ? 24 : 10;

  const buckets: { primary: number; secondary: number }[] = Array.from(
    { length: numBuckets },
    () => ({ primary: 0, secondary: 0 })
  );

  for (const s of sessions) {
    const ts = new Date(s.last_timestamp).getTime();
    const age = now - ts;
    if (age < 0 || age > rangeMs) continue;
    const bi = Math.min(Math.floor((rangeMs - age) / bucketMs), numBuckets - 1);
    buckets[bi].primary += s.input_tokens + s.output_tokens;
    buckets[bi].secondary += s.cache_read_tokens + s.cache_creation_tokens;
  }

  return buckets.map((b, i) => {
    const minsAgo = (numBuckets - 1 - i) * (bucketMs / 60_000);
    const label =
      minsAgo === 0
        ? "지금"
        : minsAgo < 60
        ? `-${minsAgo}m`
        : `-${minsAgo / 60}h`;
    return { label, ...b };
  });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

interface Props {
  sessions: SessionSummary[];
  dailyAggregates: DailyAggregate[];
}

const W = 580;
const H = 130;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 14;
const PAD_B = 6;
const IW = W - PAD_L - PAD_R;
const IH = H - PAD_T - PAD_B;

export default function UsageChart({ sessions, dailyAggregates }: Props) {
  const [range, setRange] = useState<Range>("24h");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const data = useMemo(
    () => computeData(sessions, dailyAggregates, range),
    [sessions, dailyAggregates, range]
  );

  const maxVal = Math.max(...data.flatMap((d) => [d.primary, d.secondary]), 1);

  const toX = (i: number) =>
    data.length <= 1 ? W / 2 : PAD_L + (i / (data.length - 1)) * IW;
  const toY = (v: number) => PAD_T + IH - (v / maxVal) * IH;

  const primaryPts = data.map((d, i): [number, number] => [toX(i), toY(d.primary)]);
  const secondaryPts = data.map((d, i): [number, number] => [toX(i), toY(d.secondary)]);

  const primaryPath = smoothPath(primaryPts);
  const secondaryPath = smoothPath(secondaryPts);

  const bottomY = PAD_T + IH;
  const primaryArea =
    data.length > 1
      ? `${primaryPath} L ${toX(data.length - 1)},${bottomY} L ${PAD_L},${bottomY} Z`
      : "";
  const secondaryArea =
    data.length > 1
      ? `${secondaryPath} L ${toX(data.length - 1)},${bottomY} L ${PAD_L},${bottomY} Z`
      : "";

  const isEmpty = data.every((d) => d.primary === 0 && d.secondary === 0);

  // Show every Nth label to avoid crowding
  const step = Math.max(1, Math.ceil(data.length / 6));

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="uc-root">
      <div className="uc-header">
        <span className="uc-title">사용량 추이</span>
        <div className="uc-filters">
          {(["5h", "24h", "7d"] as Range[]).map((r) => (
            <button
              key={r}
              className={`uc-filter-btn${range === r ? " uc-filter-btn--active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="uc-chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          className="uc-svg"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="uc-grad-primary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="uc-grad-secondary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Subtle horizontal grid */}
          {[0.25, 0.5, 0.75, 1.0].map((f) => (
            <line
              key={f}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={PAD_T + IH * (1 - f)}
              y2={PAD_T + IH * (1 - f)}
              stroke="#141418"
              strokeWidth="1"
            />
          ))}

          {/* Area fills */}
          {!isEmpty && data.length > 1 && (
            <>
              <path d={secondaryArea} fill="url(#uc-grad-secondary)" />
              <path d={primaryArea} fill="url(#uc-grad-primary)" />
            </>
          )}

          {/* Lines */}
          {!isEmpty && data.length > 1 && (
            <>
              <path
                d={secondaryPath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
              />
              <path
                d={primaryPath}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Hover vertical rule */}
          {hoverIdx !== null && (
            <line
              x1={toX(hoverIdx)}
              x2={toX(hoverIdx)}
              y1={PAD_T}
              y2={bottomY}
              stroke="#2a2a32"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {/* Hit areas + dots */}
          {data.map((d, i) => {
            const x = toX(i);
            const py = toY(d.primary);
            const sy = toY(d.secondary);
            const isHovered = hoverIdx === i;
            return (
              <g key={i}>
                {/* invisible hit area */}
                <rect
                  x={x - (IW / data.length) / 2}
                  y={PAD_T}
                  width={IW / data.length}
                  height={IH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                />
                {/* secondary dot */}
                {!isEmpty && d.secondary > 0 && (
                  <circle
                    cx={x}
                    cy={sy}
                    r={isHovered ? 3.5 : 2}
                    fill="#f59e0b"
                    opacity={isHovered ? 1 : 0.5}
                  />
                )}
                {/* primary dot */}
                {!isEmpty && (
                  <circle
                    cx={x}
                    cy={py}
                    r={isHovered ? 4 : 2.5}
                    fill="#6366f1"
                    opacity={isHovered ? 1 : 0.7}
                  />
                )}
              </g>
            );
          })}

          {/* Empty state */}
          {isEmpty && (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#2a2a32"
              fontSize="11"
              fontFamily="DM Mono, monospace"
            >
              이 기간에 사용 데이터가 없습니다
            </text>
          )}
        </svg>

        {/* Hover tooltip */}
        {hovered && hoverIdx !== null && (
          <div
            className="uc-tooltip"
            style={{
              left: `${((hoverIdx / (data.length - 1)) * 100).toFixed(1)}%`,
            }}
          >
            <span className="uc-tooltip-label">{hovered.label}</span>
            <span className="uc-tooltip-row uc-tooltip-row--primary">
              {fmtTokens(hovered.primary)}
            </span>
            {hovered.secondary > 0 && (
              <span className="uc-tooltip-row uc-tooltip-row--secondary">
                캐시 {fmtTokens(hovered.secondary)}
              </span>
            )}
          </div>
        )}

        {/* X-axis labels */}
        <div className="uc-x-labels">
          {data.map((d, i) =>
            i % step === 0 || i === data.length - 1 ? (
              <span
                key={i}
                className="uc-x-label"
                style={{
                  left: `${data.length <= 1 ? 50 : (i / (data.length - 1)) * 100}%`,
                }}
              >
                {d.label}
              </span>
            ) : null
          )}
        </div>
      </div>

      <div className="uc-legend">
        <span className="uc-legend-dot uc-legend-dot--primary" />
        <span className="uc-legend-label">입력+출력 토큰</span>
        <span className="uc-legend-dot uc-legend-dot--secondary" />
        <span className="uc-legend-label">캐시 토큰</span>
      </div>
    </div>
  );
}
