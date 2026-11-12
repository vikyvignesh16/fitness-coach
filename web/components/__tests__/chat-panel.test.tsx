// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "../chat/chat-panel";
import type { ChatMessage } from "@/lib/chat";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/app/(app)/chat/actions", () => ({ sendMessageAction: vi.fn(), forgetFactAction: vi.fn() }));

const ID = "7f3a1b2c-1111-4222-8333-444455556666";
const flags = { revised: false, replaced: false, blocked: false, stopped: false };
type Deps = NonNullable<React.ComponentProps<typeof ChatPanel>["deps"]>;
const earlier: ChatMessage[] = [
  { id: "m1", role: "user", body: "How did I sleep?", created_at: "2026-11-12T08:00:00Z" },
  { id: "m2", role: "coach", body: "About 7 hours 50 minutes.", created_at: "2026-11-12T08:00:05Z" },
];

function setup(send: Deps["send"], props: { threadId?: string | null; initialMessages?: ChatMessage[] } = {}) {
  render(<ChatPanel threadId={props.threadId ?? null} initialMessages={props.initialMessages ?? []} deps={{ send }} />);
  return { box: screen.getByLabelText("Message the coach"), button: screen.getByRole("button", { name: "Send" }) };
}

beforeEach(() => { replace.mockClear(); refresh.mockClear(); });

describe("showing the conversation", () => {
  it("shows earlier messages in order", () => {
    setup(vi.fn(), { threadId: ID, initialMessages: earlier });
    const log = screen.getByRole("log");
    expect(log.textContent?.indexOf("How did I sleep?")).toBeLessThan(log.textContent!.indexOf("About 7 hours 50 minutes."));
  });
  it("invites a first message in an empty chat", () => {
    setup(vi.fn());
    expect(screen.getByText(/Ask about your sleep/)).toBeTruthy();
  });
  it("shows message text as text, never as HTML", () => {
    setup(vi.fn(), { threadId: ID, initialMessages: [{ id: "x", role: "coach", body: "<img src=x onerror=alert(1)>", created_at: "" }] });
    expect(screen.getByRole("log").querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("sending", () => {
  it("cannot send an empty or blank message", async () => {
    const send = vi.fn();
    const { box, button } = setup(send);
    expect(button).toHaveProperty("disabled", true);
    await userEvent.type(box, "   ");
    expect(button).toHaveProperty("disabled", true);
    expect(send).not.toHaveBeenCalled();
  });
  it("cannot send more than 2000 characters", async () => {
    const send = vi.fn();
    const { box, button } = setup(send);
    await userEvent.click(box);
    await userEvent.paste("x".repeat(2001));
    expect(button).toHaveProperty("disabled", true);
    expect(screen.getByText("2001 / 2000")).toBeTruthy();
  });
  it("sends the trimmed text with the current thread, then shows the reply", async () => {
    const send = vi.fn(async () => ({ ok: true as const, threadId: ID, reply: "About 7 hours 50 minutes.", ...flags }));
    const { box, button } = setup(send, { threadId: ID });
    await userEvent.type(box, "  How did I sleep?  ");
    await userEvent.click(button);
    expect(send).toHaveBeenCalledWith({ text: "How did I sleep?", threadId: ID });
    expect(await screen.findByText("About 7 hours 50 minutes.")).toBeTruthy();
    expect(screen.getByText("How did I sleep?")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("");
  });
  it("says the coach is thinking until the answer arrives, and blocks a second send", async () => {
    let finish!: (r: Awaited<ReturnType<Deps["send"]>>) => void;
    const send = vi.fn(() => new Promise<Awaited<ReturnType<Deps["send"]>>>((res) => { finish = res; }));
    const { box, button } = setup(send);
    await userEvent.type(box, "hello");
    await userEvent.click(button);
    expect(screen.getByRole("status").textContent).toMatch(/thinking/);
    expect(button).toHaveProperty("disabled", true);
    finish({ ok: true, threadId: null, reply: "Hi.", ...flags });
    await screen.findByText("Hi.");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("moves a new chat to its own address", async () => {
    const send = vi.fn(async () => ({ ok: true as const, threadId: ID, reply: "Hi.", ...flags }));
    const { box, button } = setup(send);
    await userEvent.type(box, "hello");
    await userEvent.click(button);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/chat?thread=${ID}`));
  });
  it("refreshes the page data after a reply in an existing chat", async () => {
    const send = vi.fn(async () => ({ ok: true as const, threadId: ID, reply: "Hi.", ...flags }));
    const { box, button } = setup(send, { threadId: ID });
    await userEvent.type(box, "hello");
    await userEvent.click(button);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("the form itself refuses what the button already blocks", () => {
  it("does not send a blank message even if the form is submitted directly", () => {
    const send = vi.fn();
    const { box } = setup(send);
    fireEvent.submit(box.closest("form")!);
    expect(send).not.toHaveBeenCalled();
  });
  it("does not send a message over 2000 characters even if the form is submitted directly", async () => {
    const send = vi.fn();
    const { box } = setup(send);
    await userEvent.click(box);
    await userEvent.paste("x".repeat(2001));
    fireEvent.submit(box.closest("form")!);
    expect(send).not.toHaveBeenCalled();
  });
  it("does not send a second message while the first is still running", async () => {
    const send = vi.fn(() => new Promise<never>(() => undefined));
    const { box } = setup(send);
    await userEvent.type(box, "first");
    fireEvent.submit(box.closest("form")!);
    fireEvent.change(box, { target: { value: "second" } });
    fireEvent.submit(box.closest("form")!);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("when something goes wrong", () => {
  it("shows the error, takes the message back out of the conversation and gives the text back", async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: "The coach is switched off." }));
    const { box, button } = setup(send);
    await userEvent.type(box, "hello coach");
    await userEvent.click(button);
    expect(await screen.findByText("The coach is switched off.")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("hello coach");
    expect(screen.getByRole("log").textContent).not.toContain("hello coach");
  });
  it("handles the action itself failing", async () => {
    const { box, button } = setup(vi.fn(async () => { throw new Error("network"); }));
    await userEvent.type(box, "hello");
    await userEvent.click(button);
    expect(await screen.findByText("Could not reach the coach.")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("hello");
  });
  it("shows what the guardrails did under the answer", async () => {
    const send = vi.fn(async () => ({ ok: true as const, threadId: ID, reply: "I don't have a source for that in my library.", ...flags, revised: true, replaced: true }));
    const { box, button } = setup(send, { threadId: ID });
    await userEvent.type(box, "protein?");
    await userEvent.click(button);
    expect(await screen.findByText(/fixed message is shown instead/)).toBeTruthy();
  });
  it("shows nothing extra for a normal answer", async () => {
    const send = vi.fn(async () => ({ ok: true as const, threadId: ID, reply: "Fine.", ...flags }));
    const { box, button } = setup(send, { threadId: ID });
    await userEvent.type(box, "hi");
    await userEvent.click(button);
    await screen.findByText("Fine.");
    expect(screen.queryByRole("list")).toBeNull();
  });
});
