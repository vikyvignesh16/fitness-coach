"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { ModuleGroup } from "@/lib/docs/types";

/** Every file in the project with one plain sentence. Type in the box to find a file or a word. */
export function ModulesGuide({ groups }: { groups: ModuleGroup[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({ ...g, files: q ? g.files.filter((f) => `${f.file} ${f.what}`.toLowerCase().includes(q)) : g.files }))
    .filter((g) => g.files.length > 0);

  return (
    <section aria-label="Files" className="space-y-4">
      <label className="block max-w-md space-y-1">
        <span className="text-muted-foreground block text-xs">Find a file or a word</span>
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="for example sleep, watch, cap" />
      </label>
      {shown.length === 0 && <p className="text-muted-foreground text-sm">Nothing matches that. Try a shorter word.</p>}
      {shown.map((g) => (
        <details key={g.id} open={q !== ""} className="bg-card rounded-xl border">
          <summary className="min-h-12 cursor-pointer px-4 py-3 font-medium">
            {g.title} <span className="text-muted-foreground text-xs font-normal">({g.files.length})</span>
          </summary>
          <div className="space-y-3 border-t px-4 py-3">
            <p className="text-muted-foreground text-sm">{g.intro}</p>
            <ul className="space-y-3">
              {g.files.map((f) => (
                <li key={f.file} className="text-sm">
                  <code className="text-xs font-medium break-all">{f.file}</code>
                  <p className="text-muted-foreground">{f.what}</p>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ))}
    </section>
  );
}
