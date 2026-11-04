import Link from "next/link";
import { StatusBanner } from "@/components/status-banner";
import { waitingDraftVersion } from "@/lib/data";

/** Shown when ChatGPT's new plan has been checked and is waiting for Vicky. Nothing changes until she approves. */
export async function DraftPlanBanner() {
  const version = await waitingDraftVersion();
  if (!version) return null;
  return (
    <StatusBanner level="info" title={`A new plan, v${version}, is waiting for you`}>
      Nothing has changed yet.{" "}
      <Link href="/plan/proposal" className="text-foreground underline">Read it and decide</Link>
    </StatusBanner>
  );
}
