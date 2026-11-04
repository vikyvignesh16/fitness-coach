// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdoptPlanButton } from "../adopt-plan-button";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/plan/proposal/actions", () => ({ adoptProposalAction: vi.fn() }));

describe("AdoptPlanButton", () => {
  it("changes nothing on the first tap", async () => {
    const adopt = vi.fn(async () => ({ ok: true as const }));
    render(<AdoptPlanButton id="abc" version="5.7" adopt={adopt} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve v5.7" }));
    expect(adopt).not.toHaveBeenCalled();
    expect(screen.getByText(/switches your whole plan/)).toBeInTheDocument();
  });

  it("switches on the second tap", async () => {
    const adopt = vi.fn(async () => ({ ok: true as const }));
    render(<AdoptPlanButton id="abc" version="5.7" adopt={adopt} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve v5.7" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, switch to v5.7" }));
    expect(adopt).toHaveBeenCalledWith("abc");
  });

  it("can be backed out of", async () => {
    const adopt = vi.fn(async () => ({ ok: true as const }));
    render(<AdoptPlanButton id="abc" version="5.7" adopt={adopt} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve v5.7" }));
    await userEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(adopt).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Approve v5.7" })).toBeInTheDocument();
  });

  it("shows why it failed", async () => {
    const adopt = vi.fn(async () => ({ ok: false as const, error: "This draft was already decided. Refresh the page." }));
    render(<AdoptPlanButton id="abc" version="5.7" adopt={adopt} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve v5.7" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, switch to v5.7" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already decided");
  });
});
