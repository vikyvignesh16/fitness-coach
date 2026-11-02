// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnkleGateForm } from "../ankle-gate-form";
import { ANKLE_CHECKS } from "@/lib/gates";

vi.mock("@/app/(app)/gates/ankle/actions", () => ({ submitAnkleGate: vi.fn() }));

describe("AnkleGateForm", () => {
  it("asks all four checks with yes and no", () => {
    render(<AnkleGateForm action={vi.fn(async () => ({ error: null, passed: null, message: null }))} />);
    expect(screen.getAllByRole("radio", { name: /Yes, passed/ })).toHaveLength(ANKLE_CHECKS.length);
    expect(screen.getAllByRole("radio", { name: "No" })).toHaveLength(ANKLE_CHECKS.length);
  });

  it("shows a failed result in plain words", async () => {
    const action = vi.fn(async () => ({
      error: null, passed: false, message: "Do not run. Stop impact running and see a sports physio or doctor.",
    }));
    render(<AnkleGateForm action={action} />);
    for (const radio of screen.getAllByRole("radio", { name: "No" })) await userEvent.click(radio);
    await userEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("physio or doctor");
  });

  it("shows an error from the server", async () => {
    const action = vi.fn(async () => ({ error: "Could not save your answers. Nothing was changed.", passed: null, message: null }));
    render(<AnkleGateForm action={action} />);
    for (const radio of screen.getAllByRole("radio", { name: /Yes, passed/ })) await userEvent.click(radio);
    await userEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was changed");
  });
});
