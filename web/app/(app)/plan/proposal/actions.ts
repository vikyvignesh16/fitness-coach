"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adoptProposal, type AdoptResult } from "@/lib/proposal-adopt";

/** Vicky approved a draft plan. The database switches the whole plan in one step, or changes nothing. */
export async function adoptProposalAction(id: string): Promise<AdoptResult> {
  const supabase = await createClient();
  const result = await adoptProposal(async (name, args) => await supabase.rpc(name, args), String(id));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
