// Forgetting a remembered fact. Row Level Security lets a signed in user delete only their own rows,
// so this works through the user's own client. Only deleting is allowed here: facts are added by the coach, on request.
import { isUuid } from "./chat";

export type MemoryDb = {
  from(table: "coach_memory"): {
    delete(): { eq(column: "id", value: string): PromiseLike<{ error: { message: string } | null }> };
  };
};

export async function forgetFact(db: MemoryDb, id: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(id)) return { ok: false, error: "That memory was not found." };
  const { error } = await db.from("coach_memory").delete().eq("id", id);
  return error ? { ok: false, error: "Could not forget that. Please try again." } : { ok: true };
}
