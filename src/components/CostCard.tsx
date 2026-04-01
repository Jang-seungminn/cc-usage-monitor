interface CostCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: string;
  accent?: string;
}

export default function CostCard({
  label,
  value,
  sub,
  icon,
  accent = "#6366f1",
}: CostCardProps) {
  return (
    <div className="cost-card" style={{ "--card-accent": accent } as React.CSSProperties}>
      {icon && <span className="cost-card-icon">{icon}</span>}
      <div className="cost-card-body">
        <span className="cost-card-label">{label}</span>
        <span className="cost-card-value">{value}</span>
        {sub && <span className="cost-card-sub">{sub}</span>}
      </div>
    </div>
  );
}
