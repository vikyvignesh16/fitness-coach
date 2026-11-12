import Link from "next/link";
import { DataGuide } from "@/components/docs/data-guide";
import { FlowViewer } from "@/components/docs/flow-viewer";
import { ModulesGuide } from "@/components/docs/modules-guide";
import { FLOWS } from "@/lib/docs/flows";
import { LAST_CHECKED, MODULE_GROUPS } from "@/lib/docs/modules";
import { PIPELINES } from "@/lib/docs/pipelines";
import { DOC_TABS, parseDocsTab } from "@/lib/docs/tabs";
import { FUNCTIONS, TABLES } from "@/lib/docs/tables";

const segment = (active: boolean) =>
  `flex min-h-11 items-center justify-center rounded-md px-3 text-sm ${active ? "bg-background font-medium" : "text-muted-foreground"}`;

export default async function DocsPage(props: PageProps<"/docs">) {
  const tab = parseDocsTab((await props.searchParams).tab);
  const about = DOC_TABS.find((t) => t.value === tab)!.about;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">How the project works</h1>
        <p className="text-muted-foreground text-sm">{about} Last checked {LAST_CHECKED}.</p>
      </div>

      <nav aria-label="Parts of the documentation" className="bg-muted grid max-w-md grid-cols-3 gap-1 rounded-lg p-1">
        {DOC_TABS.map((t) => (
          <Link key={t.value} href={`/docs?tab=${t.value}`} aria-current={tab === t.value ? "true" : undefined} className={segment(tab === t.value)}>{t.label}</Link>
        ))}
      </nav>

      {tab === "flow" && <FlowViewer flows={FLOWS} />}
      {tab === "modules" && <ModulesGuide groups={MODULE_GROUPS} />}
      {tab === "data" && <DataGuide tables={TABLES} pipelines={PIPELINES} functions={FUNCTIONS} />}
    </>
  );
}
