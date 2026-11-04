import { describe, expect, it, vi } from "vitest";
import { adoptProposal } from "../proposal-adopt";

const ID = "3f2c1b0a-9d8e-4f7a-8b6c-5d4e3f2a1b0c";

describe("adoptProposal", () => {
  it("calls the database function with the draft id", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    expect(await adoptProposal(rpc, ID)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("adopt_plan_proposal", { p_id: ID });
  });

  it("never calls the database for something that is not an id", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    expect((await adoptProposal(rpc, "x'; drop table plan_versions;--")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("explains a draft that was already decided", async () => {
    const rpc = async () => ({ error: { message: "That draft has already been decided (adopted)." } });
    expect(await adoptProposal(rpc, ID)).toEqual({ ok: false, error: "This draft was already decided. Refresh the page." });
  });

  it("does not show raw database text for an unknown failure", async () => {
    const rpc = async () => ({ error: { message: 'duplicate key value violates "plan_versions_user_id_version_key"' } });
    const out = await adoptProposal(rpc, ID);
    expect(out).toEqual({ ok: false, error: "Could not switch the plan. Nothing was changed. Try again." });
  });

  it("copes with a dropped connection", async () => {
    const rpc = async () => { throw new Error("network"); };
    expect(await adoptProposal(rpc, ID)).toEqual({ ok: false, error: "Not saved. Check your signal and try again." });
  });
});
