import { useMemo } from "react";
import type { SessionSummary } from "../lib/types";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// Interpolate from near-black → indigo based on intensity [0, 1]
function cellColor(intensity: number): string {
  if (intensity === 0) return "#0f0f13";
  // #0f0f13 → #6366f1 (indigo), with a midpoint at #2d2b72
  const r = Math.round(15 + intensity * (99 - 15));
  const g = Math.round(15 + intensity * (102 - 15));
  const b = Math.round(19 + intensity * (241 - 19));
  return `rgb(${r},${g},${b})`;
}

interface Props {
  sessions: SessionSummary[];
}

export default function ActivityHeatmap({ sessions }: Props) {
  // grid[dayOfWeek 0=Sun][hour 0-23] = total tokens
  const grid = useMemo<number[][]>(() => {
    const g: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const s of sessions) {
      try {
        const d = new Date(s.last_timestamp);
        const dow = d.getDay();
        const hour = d.getHours();
        g[dow][hour] += s.input_tokens + s.output_tokens;
      } catch {
        // skip malformed timestamps
      }
    }
    return g;
  }, [sessions]);

  const maxVal = Math.max(...grid.flatMap((row) => row), 1);
  const totalTokens = grid.flatMap((r) => r).reduce((a, b) => a + b, 0);

  // Find peak hour and day
  let peakDow = 0, peakHour = 0, peakVal = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (grid[d][h] > peakVal) {
        peakVal = grid[d][h];
        peakDow = d;
        peakHour = h;
      }
    }
  }

  const isEmpty = totalTokens === 0;

  return (
    <div className="ah-root">
      <div className="ah-header">
        <span className="ah-title">활동 히트맵</span>
        {!isEmpty && peakVal > 0 && (
          <span className="ah-peak">
            피크: {DAY_LABELS[peakDow]}요일 {peakHour}시
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="ah-empty">사용 데이터가 없습니다</div>
      ) : (
        <>
          <div className="ah-grid-wrap">
            {/* Day labels column */}
            <div className="ah-day-col">
              {DAY_LABELS.map((d) => (
                <span key={d} className="ah-day-label">{d}</span>
              ))}
              {/* Spacer for hour row */}
              <span className="ah-day-label ah-day-label--spacer" />
            </div>

            {/* Main grid + hour labels */}
            <div className="ah-grid-col">
              {grid.map((hours, dow) => (
                <div key={dow} className="ah-row">
                  {hours.map((v, hour) => {
                    const intensity = Math.pow(v / maxVal, 0.55); // gamma for better spread
                    return (
                      <div
                        key={hour}
                        className="ah-cell"
                        style={{ background: cellColor(intensity) }}
                        title={
                          v > 0
                            ? `${DAY_LABELS[dow]}요일 ${hour}시: ${fmtTokens(v)} 토큰`
                            : `${DAY_LABELS[dow]}요일 ${hour}시: 없음`
                        }
                      />
                    );
                  })}
                </div>
              ))}

              {/* Hour labels row — aligns with grid columns */}
              <div className="ah-row ah-hour-row">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="ah-hour-cell">
                    {h % 6 === 0 ? h : ""}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="ah-legend">
            <span className="ah-legend-label">적음</span>
            <div className="ah-legend-scale">
              {[0, 0.15, 0.35, 0.55, 0.75, 1].map((f, i) => (
                <div
                  key={i}
                  className="ah-legend-cell"
                  style={{ background: cellColor(f) }}
                />
              ))}
            </div>
            <span className="ah-legend-label">많음</span>
          </div>
        </>
      )}
    </div>
  );
}
