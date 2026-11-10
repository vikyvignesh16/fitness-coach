import type { ReactNode } from "react";

/** The key above a chart. Two or more series always get one, so colour is never the only way to tell them apart. */
export function Legend({ items }: { items: { label: string; color: string; kind: "box" | "line" | "dash" | "ring" | "band" }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          {i.kind === "box" && <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: i.color }} />}
          {i.kind === "band" && <span aria-hidden className="inline-block h-3 w-4 rounded-sm" style={{ background: i.color, opacity: 0.25 }} />}
          {i.kind === "line" && <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: i.color }} />}
          {i.kind === "dash" && <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />}
          {i.kind === "ring" && <span aria-hidden className="inline-block size-3 rounded-full border-2" style={{ borderColor: i.color }} />}
          <span>{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** The box that appears when you hover or tap a point. */
export function TipBox({ title, rows, note }: { title: string; rows: { color?: string; label: string; value: string }[]; note?: ReactNode }) {
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
          <span className="font-semibold">{r.value}</span>
          <span className="text-muted-foreground">{r.label}</span>
        </div>
      ))}
      {note && <div className="text-muted-foreground mt-1">{note}</div>}
    </div>
  );
}

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 };
export const GRID = { vertical: false, stroke: "var(--border)" } as const;
export const AXIS_LINE = { stroke: "var(--border)" };

/** The 2px gap between touching columns eats a narrow column whole, so with many columns there is no gap. */
export const gapFor = (columns: number) => (columns > 31 ? 0 : 2);
