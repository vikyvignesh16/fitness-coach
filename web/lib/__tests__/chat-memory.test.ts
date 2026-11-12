import { describe, expect, it, vi } from "vitest";
import { forgetFact, type MemoryDb } from "../chat-memory";

const ID = "7f3a1b2c-1111-4222-8333-444455556666";

function db(error: { message: string } | null = null) {
  const eq = vi.fn(async () => ({ error }));
  const del = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: del }));
  return { db: { from } as unknown as MemoryDb, from, del, eq };
}

describe("forgetFact", () => {
  it("deletes one row by id from coach_memory", async () => {
    const { db: d, from, eq } = db();
    expect(await forgetFact(d, ID)).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("coach_memory");
    expect(eq).toHaveBeenCalledWith("id", ID);
  });
  it.each([undefined, null, "", "abc", 5, `${ID}' or '1'='1`, [ID]])("refuses %j without touching the database", async (id) => {
    const { db: d, from } = db();
    expect(await forgetFact(d, id)).toEqual({ ok: false, error: "That memory was not found." });
    expect(from).not.toHaveBeenCalled();
  });
  it("hides the database message when it fails", async () => {
    const result = await forgetFact(db({ message: "permission denied for table coach_memory" }).db, ID);
    expect(result).toEqual({ ok: false, error: "Could not forget that. Please try again." });
  });
});
