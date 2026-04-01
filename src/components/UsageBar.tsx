interface UsageBarProps {
  label: string;
  value: number;
  max: number;
  /** Formatted value string shown on the right (e.g. "1.2M tokens") */
  valueLabel?: string;
  color?: string;
}

export default function UsageBar({
  label,
  value,
  max,
  valueLabel,
  color = "#6366f1",
}: UsageBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="usage-bar-row">
      <div className="usage-bar-header">
        <span className="usage-bar-label">{label}</span>
        {valueLabel && <span className="usage-bar-value">{valueLabel}</span>}
      </div>
      <div className="usage-bar-track">
        <div
          className="usage-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
