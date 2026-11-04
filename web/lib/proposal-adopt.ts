// Approving a draft plan. The database function does the work in one step; this wraps it with plain error words.

export type AdoptResult = { ok: true } | { ok: false; error: string };

/** Calls adopt_plan_proposal. Never returns raw database text, which could be confusing or reveal details. */
export type Rpc = (name: "adopt_plan_proposal", args: { p_id: string }) => Promise<{ error: { message: string } | null }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function adoptProposal(rpc: Rpc, id: string): Promise<AdoptResult> {
  if (!UUID.test(id)) return { ok: false, error: "That draft was not found." };
  try {
    const { error } = await rpc("adopt_plan_proposal", { p_id: id });
    if (!error) return { ok: true };
    if (/already been decided/i.test(error.message)) return { ok: false, error: "This draft was already decided. Refresh the page." };
    if (/problems that must be fixed/i.test(error.message)) return { ok: false, error: "This draft still has problems to fix, so it cannot be approved." };
    if (/not found/i.test(error.message)) return { ok: false, error: "That draft was not found." };
    return { ok: false, error: "Could not switch the plan. Nothing was changed. Try again." };
  } catch {
    return { ok: false, error: "Not saved. Check your signal and try again." };
  }
}
