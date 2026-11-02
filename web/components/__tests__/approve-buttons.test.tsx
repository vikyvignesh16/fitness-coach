// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApproveButton } from "../approve-buttons";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/approve/actions", () => ({ approveRunsAction: vi.fn() }));

describe("ApproveButton", () => {
  it("does nothing until it is pressed", () => {
    const approve = vi.fn(async () => []);
    render(<ApproveButton dates={["2026-11-04"]} label="Approve and send to watch" approve={approve} />);
    expect(approve).not.toHaveBeenCalled();
  });

  it("sends the chosen days when pressed", async () => {
    const approve = vi.fn(async () => [{ date: "2026-11-04", status: "approved" as const }]);
    render(<ApproveButton dates={["2026-11-04", "2026-11-05"]} label="Approve all 2" approve={approve} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve all 2" }));
    expect(approve).toHaveBeenCalledWith(["2026-11-04", "2026-11-05"]);
  });

  it("shows why a day was refused", async () => {
    const approve = vi.fn(async () => [
      { date: "2026-11-04", status: "refused" as const, error: "This week is locked until the ankle check is passed." },
    ]);
    render(<ApproveButton dates={["2026-11-04"]} label="Approve" approve={approve} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("locked");
  });

  it("says so when the signal drops", async () => {
    const approve = vi.fn(async () => { throw new Error("network"); });
    render(<ApproveButton dates={["2026-11-04"]} label="Approve" approve={approve} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your signal");
  });

  it("cannot be pressed with no days", () => {
    render(<ApproveButton dates={[]} label="Approve" approve={vi.fn(async () => [])} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });
});
