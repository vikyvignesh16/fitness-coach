// The shapes of the documentation data. The words are written for Vicky: short sentences, jargon explained once.

export type ModuleEntry = { file: string; what: string }; // file is a path from the repo root
export type ModuleGroup = { id: string; title: string; intro: string; files: ModuleEntry[] };

export type TableWriter = "service" | "you" | "service and you" | "database function";
export type TableDoc = {
  name: string;
  area: string;
  stores: string; // plain words: what one row is
  columns: string; // the main columns, in words
  writer: TableWriter;
  writtenBy: string; // which job, screen or function puts rows in
  readBy: string; // which screens or tools read it
  migration: string; // the file in supabase/migrations
  note?: string;
};

export type PipelineDoc = {
  id: string;
  name: string;
  trigger: string;
  reads: string;
  writes: string[]; // table names
  run: string;
  file: string;
};

export type FlowStep = {
  id: string;
  title: string; // a short label that fits in a box
  plain: string; // what happens, in plain words
  tech: string[]; // the tools and services involved
  why?: string; // why this tool was chosen
  tables: string[]; // table names, each one must exist in tables.ts
  files: string[]; // paths from the repo root, each one must exist
  decision?: string; // the start of a heading in docs/decisions.md
};
export type Flow = { id: string; title: string; summary: string; steps: FlowStep[] };
