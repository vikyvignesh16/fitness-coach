import Link from "next/link";
import { tableHref } from "@/lib/docs/tabs";
import { TABLE_AREAS, type FunctionDoc } from "@/lib/docs/tables";
import type { PipelineDoc, TableDoc, TableWriter } from "@/lib/docs/types";

const WRITER_WORDS: Record<TableWriter, string> = {
  service: "The server jobs and the coach service",
  you: "You, from the app",
  "service and you": "Both: the server jobs and you",
  "database function": "A database function. The table is locked for everything else.",
};

const chip = "bg-muted text-foreground inline-block rounded-md px-2 py-1 text-xs underline-offset-4 hover:underline";

/** The pipelines, then every table by area: what it stores, who writes it, where it is read. */
export function DataGuide({ tables, pipelines, functions }: { tables: TableDoc[]; pipelines: PipelineDoc[]; functions: FunctionDoc[] }) {
  return (
    <div className="space-y-8">
      <section aria-label="Pipelines" className="space-y-3">
        <h2 className="text-lg font-semibold">Pipelines</h2>
        <p className="text-muted-foreground text-sm">
          A pipeline is a job that moves data from one place to another. Timers are set in Railway, not in the code. Every job uses the server key, which is kept in an environment variable and never printed.
        </p>
        <ul className="grid gap-3 lg:grid-cols-2">
          {pipelines.map((p) => (
            <li key={p.id} className="bg-card space-y-2 rounded-xl border p-4 text-sm">
              <p className="font-medium">{p.name}</p>
              <p><span className="text-muted-foreground">When: </span>{p.trigger}</p>
              <p><span className="text-muted-foreground">Reads: </span>{p.reads}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Writes:</span>
                {p.writes.map((w) => <Link key={w} href={tableHref(w)} className={chip}>{w}</Link>)}
              </div>
              <p className="text-muted-foreground text-xs">Run it with <code className="break-all">{p.run}</code> from <code className="break-all">{p.file}</code></p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Tables" className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Tables</h2>
          <p className="text-muted-foreground text-sm">
            Every table has Row Level Security. That is a rule inside the database: a signed in user only sees rows where the user id is theirs. The server key skips it, so server code always names your user id when it writes.
          </p>
        </div>
        {TABLE_AREAS.map((area) => {
          const inArea = tables.filter((t) => t.area === area);
          if (inArea.length === 0) return null;
          return (
            <div key={area} className="space-y-3">
              <h3 className="font-medium">{area}</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {inArea.map((t) => (
                  <article key={t.name} id={`table-${t.name}`} className="bg-card scroll-mt-4 space-y-2 rounded-xl border p-4 text-sm">
                    <h4 className="font-mono font-medium">{t.name}</h4>
                    <p>{t.stores}</p>
                    <p><span className="text-muted-foreground">Main columns: </span>{t.columns}</p>
                    <p><span className="text-muted-foreground">Written by: </span>{WRITER_WORDS[t.writer]}. {t.writtenBy}</p>
                    <p><span className="text-muted-foreground">Used by: </span>{t.readBy}</p>
                    {t.note && <p className="text-muted-foreground">{t.note}</p>}
                    <p className="text-muted-foreground text-xs">Created in <code>{t.migration}</code></p>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section aria-label="Database functions" className="space-y-3">
        <h2 className="text-lg font-semibold">Database functions</h2>
        <ul className="grid gap-3 lg:grid-cols-2">
          {functions.map((f) => (
            <li key={f.name} className="bg-card space-y-1 rounded-xl border p-4 text-sm">
              <p className="font-mono font-medium">{f.name}</p>
              <p>{f.what}</p>
              <p className="text-muted-foreground text-xs">Created in <code>{f.migration}</code></p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
