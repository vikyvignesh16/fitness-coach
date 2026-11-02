/** How far along something is, for example kilometres done this week out of kilometres planned. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="bg-muted h-3 w-full overflow-hidden rounded-full"
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--series-actual)" }} />
    </div>
  );
}
