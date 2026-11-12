// The docs data must keep up with the project. This test reads the repo and fails when a file, a table or a decision
// is missing from lib/docs, or when lib/docs points at something that is gone. It checks that things EXIST. It cannot
// check that a sentence is still true, so when a file changes its job, update its sentence by hand.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLOWS } from "../docs/flows";
import { LAST_CHECKED, MODULE_GROUPS } from "../docs/modules";
import { PIPELINES } from "../docs/pipelines";
import { FUNCTIONS, TABLE_AREAS, TABLES } from "../docs/tables";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const at = (...p: string[]) => join(ROOT, ...p);

const entries = (dir: string) => (existsSync(at(dir)) ? readdirSync(at(dir), { withFileTypes: true }) : []);
const filesIn = (dir: string, ext: RegExp) => entries(dir).filter((e) => e.isFile() && ext.test(e.name) && !e.name.endsWith(".d.ts")).map((e) => `${dir}/${e.name}`);
const dirsIn = (dir: string) => entries(dir).filter((e) => e.isDirectory() && !["__tests__", "__pycache__", "node_modules", "tests"].includes(e.name)).map((e) => `${dir}/${e.name}`);

/** What each group of the module guide has to cover, worked out from the real folders. */
const EXPECTED: Record<string, () => string[]> = {
  ingest: () => filesIn("ingest", /\.py$/).filter((f) => !f.endsWith("__init__.py")),
  coach: () => filesIn("coach", /\.py$/).filter((f) => !f.endsWith("__init__.py")),
  coach_safety: () => filesIn("coach/safety", /\.py$/).filter((f) => !f.endsWith("__init__.py")),
  web_pages: () => [
    ...dirsIn("web/app/(app)"),
    ...dirsIn("web/app").filter((d) => !d.endsWith("(app)")),
    "web/app/layout.tsx", "web/app/manifest.ts", "web/proxy.ts", "web/app/(app)/layout.tsx", "web/app/(app)/page.tsx",
  ],
  web_lib: () => [...filesIn("web/lib", /\.ts$/), ...filesIn("web/lib/supabase", /\.ts$/), ...filesIn("web/lib/docs", /\.ts$/)],
  web_components: () => [
    ...filesIn("web/components", /\.tsx?$/),
    ...["chat", "costs", "docs", "insights"].flatMap((d) => filesIn(`web/components/${d}`, /\.tsx?$/)),
    "web/components/ui",
  ],
  database: () => [...filesIn("supabase/migrations", /\.sql$/), "supabase/tests/rls_check.sql", "supabase/config.toml"],
  project: () => [
    "CLAUDE.md", "pyproject.toml", ".env.example",
    ...filesIn("docs", /\.md$/), ...filesIn("data", /\.(json|md)$/), ...dirsIn(".claude/skills"),
  ],
};

describe("the module guide covers every file", () => {
  it("has exactly the groups this test knows about", () => {
    expect(MODULE_GROUPS.map((g) => g.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });
  for (const group of MODULE_GROUPS) {
    it(`${group.id}: no file is missing and none is stale`, () => {
      const described = group.files.map((f) => f.file);
      const expected = EXPECTED[group.id]();
      expect(expected.filter((f) => !described.includes(f)), "files with no description").toEqual([]);
      expect(described.filter((f) => !existsSync(at(f))), "descriptions of files that are gone").toEqual([]);
      expect(described.filter((f) => !expected.includes(f)), "described but not expected in this group").toEqual([]);
      expect(new Set(described).size).toBe(described.length);
    });
  }
});

describe("the data guide covers every table", () => {
  const sql = filesIn("supabase/migrations", /\.sql$/).map((f) => readFileSync(at(f), "utf8")).join("\n");
  const created = [...sql.matchAll(/^\s*create table (\w+)/gim)].map((m) => m[1]);
  const dropped = [...sql.matchAll(/^\s*drop table (\w+)/gim)].map((m) => m[1]);
  const live = created.filter((t) => !dropped.includes(t));

  it("describes every table that exists now, and only those", () => {
    expect(TABLES.map((t) => t.name).sort()).toEqual([...live].sort());
  });
  it("lists each table once, in a known area, with a migration that exists and mentions it", () => {
    for (const t of TABLES) {
      expect(TABLE_AREAS, t.name).toContain(t.area);
      expect(existsSync(at("supabase/migrations", t.migration)), `${t.name}: ${t.migration}`).toBe(true);
      expect(readFileSync(at("supabase/migrations", t.migration), "utf8"), t.name).toMatch(new RegExp(`create table ${t.name}\\b`, "i"));
    }
    expect(new Set(TABLES.map((t) => t.name)).size).toBe(TABLES.length);
  });
  it("describes the database functions it names, each created in the migration it points at", () => {
    for (const f of FUNCTIONS) {
      expect(readFileSync(at("supabase/migrations", f.migration), "utf8"), f.name).toMatch(new RegExp(`create (or replace )?function ${f.name}\\b`, "i"));
    }
  });
  it("points every pipeline at a real file and real tables", () => {
    const names = TABLES.map((t) => t.name);
    for (const p of PIPELINES) {
      expect(existsSync(at(p.file)), p.id).toBe(true);
      for (const w of p.writes) expect(names, `${p.id} writes ${w}`).toContain(w);
    }
    expect(new Set(PIPELINES.map((p) => p.id)).size).toBe(PIPELINES.length);
  });
});

describe("the flowcharts", () => {
  const headings = readFileSync(at("docs/decisions.md"), "utf8").split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3));
  const names = TABLES.map((t) => t.name);

  it("has flows with unique ids and at least three steps each", () => {
    expect(new Set(FLOWS.map((f) => f.id)).size).toBe(FLOWS.length);
    for (const f of FLOWS) {
      expect(f.steps.length, f.id).toBeGreaterThanOrEqual(3);
      expect(new Set(f.steps.map((s) => s.id)).size, f.id).toBe(f.steps.length);
    }
  });
  for (const flow of FLOWS) {
    for (const step of flow.steps) {
      it(`${flow.id} / ${step.id}: tables, files and decision are real`, () => {
        for (const t of step.tables) expect(names, `table ${t}`).toContain(t);
        for (const f of step.files) expect(existsSync(at(f)), `file ${f}`).toBe(true);
        if (step.decision) expect(headings.some((h) => h.startsWith(step.decision!)), `decision "${step.decision}"`).toBe(true);
        expect(step.title.length).toBeLessThanOrEqual(28); // it has to fit in a box on a phone
      });
    }
  }
});

describe("the writing", () => {
  const strings: string[] = [
    ...MODULE_GROUPS.flatMap((g) => [g.title, g.intro, ...g.files.map((f) => f.what)]),
    ...TABLES.flatMap((t) => [t.stores, t.columns, t.writtenBy, t.readBy, t.note ?? ""]),
    ...FUNCTIONS.map((f) => f.what),
    ...PIPELINES.flatMap((p) => [p.name, p.trigger, p.reads]),
    ...FLOWS.flatMap((f) => [f.title, f.summary, ...f.steps.flatMap((s) => [s.title, s.plain, s.why ?? "", ...s.tech])]),
  ];
  it("has no dashes used as punctuation", () => {
    expect(strings.filter((s) => /[—–]| - /.test(s))).toEqual([]);
  });
  it("has no empty sentence", () => {
    expect(MODULE_GROUPS.flatMap((g) => g.files).filter((f) => f.what.trim().length < 15)).toEqual([]);
  });
  it("says when it was last checked", () => expect(LAST_CHECKED).toMatch(/^\d{1,2} \w+ \d{4}$/));
  it("never writes a key, token value or address into the docs", () => {
    expect(strings.filter((s) => /eyJ[\w-]{10,}|sk-[\w-]{10,}|https?:\/\//.test(s))).toEqual([]);
  });
});
