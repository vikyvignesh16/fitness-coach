// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryPanel } from "../chat/memory-panel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/chat/actions", () => ({ sendMessageAction: vi.fn(), forgetFactAction: vi.fn() }));

const A = { id: "7f3a1b2c-1111-4222-8333-444455556666", fact: "Favourite route is the canal loop.", created_at: "" };
const B = { id: "8f3a1b2c-1111-4222-8333-444455556666", fact: "Prefers morning runs.", created_at: "" };
type Deps = NonNullable<React.ComponentProps<typeof MemoryPanel>["deps"]>;

beforeEach(() => refresh.mockClear());

describe("MemoryPanel", () => {
  it("lists each note and how many there are", () => {
    render(<MemoryPanel facts={[A, B]} deps={{ forget: vi.fn() }} />);
    expect(screen.getByText(A.fact)).toBeTruthy();
    expect(screen.getByText(B.fact)).toBeTruthy();
    expect(screen.getByText(/2 of 50 notes/)).toBeTruthy();
  });
  it("explains how to add a note when there are none", () => {
    render(<MemoryPanel facts={[]} deps={{ forget: vi.fn() }} />);
    expect(screen.getByText(/Nothing remembered yet/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("forgets exactly the note whose button was pressed, then refreshes", async () => {
    const forget = vi.fn(async () => ({ ok: true as const }));
    render(<MemoryPanel facts={[A, B]} deps={{ forget }} />);
    await userEvent.click(screen.getByRole("button", { name: `Forget: ${B.fact}` }));
    expect(forget).toHaveBeenCalledTimes(1);
    expect(forget).toHaveBeenCalledWith(B.id);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("shows the error and does not refresh when forgetting fails", async () => {
    const forget: Deps["forget"] = vi.fn(async () => ({ ok: false as const, error: "Could not forget that. Please try again." }));
    render(<MemoryPanel facts={[A]} deps={{ forget }} />);
    await userEvent.click(screen.getByRole("button", { name: /Forget/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not forget that. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows an error when the action itself throws", async () => {
    render(<MemoryPanel facts={[A]} deps={{ forget: vi.fn(async () => { throw new Error("network"); }) }} />);
    await userEvent.click(screen.getByRole("button", { name: /Forget/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
