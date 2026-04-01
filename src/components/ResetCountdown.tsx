import { useState, useEffect } from "react";

function getNextMonthlyReset(): Date {
  const now = new Date();
  // First day of next month at 00:00:00 UTC
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function formatDuration(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  return { days, hours, minutes, seconds };
}

export default function ResetCountdown() {
  const [remaining, setRemaining] = useState(() =>
    getNextMonthlyReset().getTime() - Date.now()
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(getNextMonthlyReset().getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const { days, hours, minutes, seconds } = formatDuration(remaining);

  return (
    <div className="reset-countdown">
      <span className="reset-countdown-label">Monthly reset in</span>
      <div className="reset-countdown-timer">
        <span className="reset-unit">
          <span className="reset-num">{String(days).padStart(2, "0")}</span>
          <span className="reset-unit-label">d</span>
        </span>
        <span className="reset-sep">:</span>
        <span className="reset-unit">
          <span className="reset-num">{String(hours).padStart(2, "0")}</span>
          <span className="reset-unit-label">h</span>
        </span>
        <span className="reset-sep">:</span>
        <span className="reset-unit">
          <span className="reset-num">{String(minutes).padStart(2, "0")}</span>
          <span className="reset-unit-label">m</span>
        </span>
        <span className="reset-sep">:</span>
        <span className="reset-unit">
          <span className="reset-num">{String(seconds).padStart(2, "0")}</span>
          <span className="reset-unit-label">s</span>
        </span>
      </div>
    </div>
  );
}
