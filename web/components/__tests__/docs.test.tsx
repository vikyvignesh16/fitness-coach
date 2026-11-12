// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataGuide } from "@/components/docs/data-guide";
import { FlowViewer } from "@/components/docs/flow-viewer";
import { ModulesGuide } from "@/components/docs/modules-guide";
import { FLOWS } from "@/lib/docs/flows";
import { MODULE_GROUPS } from "@/lib/docs/modules";
import { PIPELINES } from "@/lib/docs/pipelines";
import { DOC_TABS, parseDocsTab, tableHref } from "@/lib/docs/tabs";
import { FUNCTIONS, TABLES } from "@/lib/docs/tables";
import type { Flow } from "@/lib/docs/types";

const step = (id: string, title: string, over: Partial<Flow["steps"][number]> = {}) =>
  ({ id, title, plain: `${title} happens here.`, tech: [], tables: [], files: [], ...over });
const FIXTURE: Flow[] = [
  { id: "one", title: "First flow", summary: "The first summary.", steps: [
    step("a", "Alpha", { tech: ["Tool A"], tables: ["runs"], files: ["ingest/coros_runs.py"], why: "Because A.", decision: "2026-11-02 Something" }),
    step("b", "Bravo"), step("c", "Charlie")] },
  { id: "two", title: "Second flow", summary: "The second summary.", steps: [step("x", "Xray"), step("y", "Yankee"), step("z", "Zulu")] },
];

describe("the flowchart", () => {
  it("opens on the first step of the first flow, showing its details", () => {
    render(<FlowViewer flows={FIXTURE} />);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Alpha happens here.")).toBeInTheDocument();
    expect(screen.getByText("Tool A")).toBeInTheDocument();
    expect(screen.getByText("Because A.")).toBeInTheDocument();
    expect(screen.getByText("ingest/coros_runs.py")).toBeInTheDocument();
    expect(screen.getByText(/Decision log: 2026-11-02 Something/)).toBeInTheDocument();
    expect(screen.queryByText("Bravo happens here.")).not.toBeInTheDocument();
  });
  it("links each table to its card on the Data tab", () => {
    render(<FlowViewer flows={FIXTURE} />);
    expect(screen.getByRole("link", { name: "runs" })).toHaveAttribute("href", tableHref("runs"));
  });
  it("moves with Next and Back, and stops at both ends", async () => {
    const user = userEvent.setup();
    render(<FlowViewer flows={FIXTURE} />);
    const next = screen.getByRole("button", { name: "Next" });
    const back = screen.getByRole("button", { name: "Back" });
    expect(back).toBeDisabled();
    await user.click(next);
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Bravo happens here.")).toBeInTheDocument();
    expect(screen.queryByText("Alpha happens here.")).not.toBeInTheDocument();
    await user.click(next);
    expect(next).toBeDisabled();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    await user.click(back);
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });
  it("opens a step when you tap its box, and marks it as the current step", async () => {
    const user = userEvent.setup();
    render(<FlowViewer flows={FIXTURE} />);
    await user.click(screen.getByRole("button", { name: /Charlie/ }));
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Charlie/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Alpha/ })).not.toHaveAttribute("aria-current");
  });
  it("starts the new flow at step 1 when you switch flows", async () => {
    const user = userEvent.setup();
    render(<FlowViewer flows={FIXTURE} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Second flow" }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("The second summary.")).toBeInTheDocument();
    expect(screen.getByText("Xray happens here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second flow" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "First flow" })).toHaveAttribute("aria-pressed", "false");
  });
  it("walks every real flow from the first step to the last", async () => {
    const user = userEvent.setup();
    render(<FlowViewer flows={FLOWS} />);
    for (const flow of FLOWS) {
      await user.click(screen.getByRole("button", { name: flow.title }));
      const list = screen.getByRole("list", { name: flow.title });
      expect(within(list).getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"))).toHaveLength(flow.steps.length);
      for (let i = 1; i < flow.steps.length; i++) await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByText(`Step ${flow.steps.length} of ${flow.steps.length}`)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    }
  });
});

describe("the files guide", () => {
  it("lists every group, collapsed, with its count", () => {
    render(<ModulesGuide groups={MODULE_GROUPS} />);
    expect(document.querySelectorAll("details")).toHaveLength(MODULE_GROUPS.length);
    expect(document.querySelectorAll("details[open]")).toHaveLength(0);
    for (const g of MODULE_GROUPS) {
      const summary = screen.getByText(g.title, { exact: false }).closest("summary")!;
      expect(summary.textContent).toContain(`(${g.files.length})`);
    }
  });
  it("finds a file by a word in its name or its sentence, and opens the groups that match", async () => {
    const user = userEvent.setup();
    render(<ModulesGuide groups={MODULE_GROUPS} />);
    await user.type(screen.getByRole("searchbox"), "watch_sync");
    expect(screen.getByText("ingest/watch_sync.py")).toBeInTheDocument();
    expect(screen.queryByText("ingest/coros_runs.py")).not.toBeInTheDocument();
    expect(document.querySelectorAll("details[open]").length).toBeGreaterThan(0);
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "SPENDING CAP");
    expect(screen.getByText("coach/guard.py")).toBeInTheDocument(); // not case sensitive
  });
  it("matches whatever the capital letters in the file text", async () => {
    const user = userEvent.setup();
    render(<ModulesGuide groups={MODULE_GROUPS} />);
    await user.type(screen.getByRole("searchbox"), "paris"); // the text says "Paris"
    expect(screen.getByText("ingest/home_zone.py")).toBeInTheDocument();
  });
  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<ModulesGuide groups={MODULE_GROUPS} />);
    await user.type(screen.getByRole("searchbox"), "zzzzqqq");
    expect(screen.getByText(/Nothing matches that/)).toBeInTheDocument();
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });
});

describe("the data guide", () => {
  it("has a card for every table, each with the anchor the flowcharts link to", () => {
    render(<DataGuide tables={TABLES} pipelines={PIPELINES} functions={FUNCTIONS} />);
    for (const t of TABLES) {
      const card = document.getElementById(`table-${t.name}`);
      expect(card, t.name).not.toBeNull();
      expect(within(card!).getByText(t.stores)).toBeInTheDocument();
      expect(within(card!).getByText(t.migration)).toBeInTheDocument();
    }
  });
  it("says in words who writes each table", () => {
    render(<DataGuide tables={TABLES} pipelines={PIPELINES} functions={FUNCTIONS} />);
    const tokens = document.getElementById("table-coros_tokens")!;
    expect(tokens.textContent).toMatch(/Written by: The server jobs and the coach service/);
    expect(tokens.textContent).toMatch(/No screen and no tool can read it/);
  });
  it("lists every pipeline with a link from each table it writes", () => {
    render(<DataGuide tables={TABLES} pipelines={PIPELINES} functions={FUNCTIONS} />);
    const section = within(screen.getByRole("region", { name: "Pipelines" }));
    for (const p of PIPELINES) expect(section.getByText(p.name)).toBeInTheDocument();
    expect(section.getAllByRole("link", { name: "runs" })[0]).toHaveAttribute("href", tableHref("runs"));
  });
  it("lists the database functions", () => {
    render(<DataGuide tables={TABLES} pipelines={PIPELINES} functions={FUNCTIONS} />);
    for (const f of FUNCTIONS) expect(screen.getByText(f.name)).toBeInTheDocument();
  });
});

describe("the tab in the address", () => {
  it("points a table link at the exact card id the data guide draws", () => {
    expect(tableHref("runs")).toBe("/docs?tab=data#table-runs");
    render(<DataGuide tables={TABLES} pipelines={PIPELINES} functions={FUNCTIONS} />);
    expect(document.getElementById(tableHref("runs").split("#")[1])).not.toBeNull();
  });
  it("accepts the three parts and falls back to the flowcharts", () => {
    expect(DOC_TABS.map((t) => t.value)).toEqual(["flow", "modules", "data"]);
    expect(parseDocsTab("modules")).toBe("modules");
    expect(parseDocsTab(["data", "flow"])).toBe("data");
    for (const bad of [undefined, "", "Data", "tables", ["nope"]]) expect(parseDocsTab(bad as string)).toBe("flow");
  });
});
