import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: string }) {
  return (
    <div className="space-y-3 py-10 text-center">
      <Icon aria-hidden className="text-muted-foreground mx-auto size-10" />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mx-auto max-w-xs text-sm">{children}</p>
    </div>
  );
}
