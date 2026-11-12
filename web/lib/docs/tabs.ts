// The three parts of the Docs page. The chosen one lives in the address (?tab=), like the ranges on Insights.
export type DocsTab = "flow" | "modules" | "data";
export const DOC_TABS: { value: DocsTab; label: string; about: string }[] = [
  { value: "flow", label: "Flowcharts", about: "Step by step, how the project works." },
  { value: "modules", label: "Files", about: "What every file does, in plain words." },
  { value: "data", label: "Data", about: "What each table stores, who writes it and where it is used." },
];

export function parseDocsTab(value: string | string[] | undefined): DocsTab {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "modules" || v === "data" ? v : "flow";
}

/** The address of one table's card on the Data tab. */
export const tableHref = (name: string) => `/docs?tab=data#table-${name}`;
