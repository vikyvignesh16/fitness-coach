"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { tableHref } from "@/lib/docs/tabs";
import type { Flow, FlowStep } from "@/lib/docs/types";

const chip = "bg-muted text-muted-foreground inline-block rounded-md px-2 py-1 text-xs";

/** A hand drawn arrow between two steps. Decoration only, so screen readers skip it. */
function Arrow() {
  return (
    <svg aria-hidden width="16" height="28" viewBox="0 0 16 28" className="text-muted-foreground mx-auto block">
      <line x1="8" y1="0" x2="8" y2="22" stroke="currentColor" strokeWidth="2" />
      <path d="M3 18 L8 25 L13 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Detail({ step }: { step: FlowStep }) {
  return (
    <div className="space-y-3 border-t px-4 py-3 text-sm">
      <p>{step.plain}</p>
      {step.why && <p><span className="font-medium">Why this choice. </span>{step.why}</p>}
      {step.tech.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Tech</p>
          <ul className="flex flex-wrap gap-2">{step.tech.map((t) => <li key={t} className={chip}>{t}</li>)}</ul>
        </div>
      )}
      {step.tables.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Database tables used here</p>
          <ul className="flex flex-wrap gap-2">
            {step.tables.map((t) => (
              <li key={t}><Link href={tableHref(t)} className={`${chip} text-foreground underline-offset-4 hover:underline`}>{t}</Link></li>
            ))}
          </ul>
        </div>
      )}
      {step.files.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Files</p>
          <ul className="space-y-1">{step.files.map((f) => <li key={f}><code className="text-xs break-all">{f}</code></li>)}</ul>
        </div>
      )}
      {step.decision && <p className="text-muted-foreground text-xs">Decision log: {step.decision}</p>}
    </div>
  );
}

/**
 * A flowchart you can step through. Pick a flow, then tap a box or use Back and Next. The chosen step opens in place,
 * so on a phone there is nothing to scroll to. Every box is a real button, so it also works from the keyboard.
 */
export function FlowViewer({ flows }: { flows: Flow[] }) {
  const [flowId, setFlowId] = useState(flows[0].id);
  const [index, setIndex] = useState(0);
  const refs = useRef<Record<string, HTMLLIElement | null>>({});
  const moved = useRef(false);

  const flow = flows.find((f) => f.id === flowId) ?? flows[0];
  const last = flow.steps.length - 1;
  const current = Math.min(index, last);

  useEffect(() => {
    if (!moved.current) return; // do not scroll when the page first opens
    refs.current[flow.steps[current].id]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [flow, current]);

  const choose = (id: string) => { moved.current = false; setFlowId(id); setIndex(0); };
  const go = (to: number) => { moved.current = true; setIndex(Math.max(0, Math.min(last, to))); };

  return (
    <section aria-label="Flowcharts" className="space-y-4">
      <nav aria-label="Choose a flowchart" className="flex flex-wrap gap-2">
        {flows.map((f) => (
          <button key={f.id} type="button" aria-pressed={f.id === flow.id} onClick={() => choose(f.id)}
            className={`min-h-11 rounded-lg border px-3 text-sm ${f.id === flow.id ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            {f.title}
          </button>
        ))}
      </nav>

      <p className="text-muted-foreground text-sm">{flow.summary}</p>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => go(current - 1)} disabled={current === 0} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-40">Back</button>
        <p aria-live="polite" className="text-sm tabular-nums">Step {current + 1} of {flow.steps.length}</p>
        <button type="button" onClick={() => go(current + 1)} disabled={current === last} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-40">Next</button>
      </div>

      <ol className="max-w-2xl" aria-label={flow.title}>
        {flow.steps.map((s, i) => {
          const open = i === current;
          return (
            <li key={s.id} ref={(el) => { refs.current[s.id] = el; }}>
              <div className={`bg-card overflow-hidden rounded-xl border ${open ? "border-foreground/60" : ""}`}>
                <button type="button" aria-expanded={open} aria-current={open ? "step" : undefined} onClick={() => go(i)}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left">
                  <span aria-hidden className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums ${open ? "bg-foreground text-background" : ""}`}>{i + 1}</span>
                  <span className="font-medium">{s.title}</span>
                </button>
                {open && <Detail step={s} />}
              </div>
              {i < last && <Arrow />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
