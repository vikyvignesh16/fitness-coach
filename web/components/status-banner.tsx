import { CircleAlert, CircleCheck, Info, OctagonAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Status colours from the chart palette. Fixed, and only ever used for status.
const LEVELS: Record<"good" | "info" | "careful" | "stop", { icon: LucideIcon; word: string; color: string }> = {
  good: { icon: CircleCheck, word: "Done", color: "#0ca30c" },
  info: { icon: Info, word: "Note", color: "var(--series-planned)" },
  careful: { icon: CircleAlert, word: "Careful", color: "#fab219" },
  stop: { icon: OctagonAlert, word: "Stop", color: "#d03b3b" },
};

/** A message that needs attention. Always an icon and a word, never colour alone. */
export function StatusBanner({
  level,
  title,
  children,
}: {
  level: keyof typeof LEVELS;
  title: string;
  children?: ReactNode;
}) {
  const { icon: Icon, word, color } = LEVELS[level];
  return (
    <div role={level === "stop" ? "alert" : "status"} className="bg-card flex gap-3 rounded-lg border border-l-4 p-4" style={{ borderLeftColor: color }}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" style={{ color }} />
      <div className="space-y-1 text-sm">
        <p className="font-medium">
          <span className="sr-only">{word}: </span>
          {title}
        </p>
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
