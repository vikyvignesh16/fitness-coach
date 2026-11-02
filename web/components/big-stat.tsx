import type { ReactNode } from "react";

/** A small grey label over a big number. For the things Vicky checks at a glance. */
export function BigStat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
      <p className="text-4xl leading-tight font-bold tabular-nums">
        {value}
        {unit && <span className="text-muted-foreground ml-1 text-lg font-medium">{unit}</span>}
      </p>
      {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
    </div>
  );
}
