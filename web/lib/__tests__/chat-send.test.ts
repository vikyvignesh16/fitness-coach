import { describe, expect, it, vi } from "vitest";
import { connectionCode, sendToCoach, type SendDeps } from "../chat-send";

const ID = "7f3a1b2c-1111-4222-8333-444455556666";
const TOKEN = "eyJ.super-secret-token";
const GOOD = { reply: "You slept well.", thread_id: ID, revised: false, replaced: false, blocked: false, stopped: false };

function deps(over: Partial<SendDeps> = {}, response: Response | Error = new Response(JSON.stringify(GOOD), { status: 200 })) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { fetchMock, deps: { fetch: fetchMock as unknown as typeof fetch, baseUrl: "http://coach-api.railway.internal:8000", token: TOKEN, ...over } };
}
const send = (d: SendDeps, text: unknown = "How did I sleep?", threadId: unknown = null) => sendToCoach({ text, threadId }, d);

describe("what is sent", () => {
  it("posts the text and thread to /chat with the token in the Authorization header only", async () => {
    const { fetchMock, deps: d } = deps();
    await send(d, "  How did I sleep?  ", ID);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://coach-api.railway.internal:8000/chat");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ text: "How did I sleep?", thread_id: ID });
    expect(init.body as string).not.toContain(TOKEN);
    expect(init.cache).toBe("no-store");
  });
  it("never sends a user id", async () => {
    const { fetchMock, deps: d } = deps();
    await send(d);
    expect(Object.keys(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))).toEqual(["text", "thread_id"]);
  });
  it("does not double the slash when the address ends with one", async () => {
    const { fetchMock, deps: d } = deps({ baseUrl: "http://coach-api.railway.internal:8000/" });
    await send(d);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("http://coach-api.railway.internal:8000/chat");
  });
});

describe("checks before anything is sent", () => {
  it.each([["", "Write a message first."], ["   ", "Write a message first."], [null, "Write a message first."], [5, "Write a message first."],
    ["x".repeat(2001), "Keep the message under 2000 characters."]])("refuses text %j", async (text, error) => {
    const { fetchMock, deps: d } = deps();
    expect(await send(d, text)).toEqual({ ok: false, error });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("allows exactly 2000 characters", async () => expect((await send(deps().deps, "x".repeat(2000))).ok).toBe(true));
  it.each(["abc", 5, {}, ID + "x"])("refuses thread %j", async (thread) => {
    const { fetchMock, deps: d } = deps();
    expect(await send(d, "hi", thread)).toEqual({ ok: false, error: "That conversation was not found." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("says the coach is not connected when there is no address", async () => {
    const { fetchMock, deps: d } = deps({ baseUrl: undefined });
    expect(await send(d)).toEqual({ ok: false, error: "The coach is not connected yet." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("asks to sign in again when there is no token", async () => {
    const { fetchMock, deps: d } = deps({ token: null });
    expect(await send(d)).toEqual({ ok: false, error: "Please sign in again." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("what comes back", () => {
  it("returns the reply, the thread and the flags", async () => {
    expect(await send(deps().deps)).toEqual({ ok: true, reply: "You slept well.", threadId: ID, revised: false, replaced: false, blocked: false, stopped: false });
  });
  it("passes the guardrail flags on", async () => {
    const r = await send(deps({}, new Response(JSON.stringify({ ...GOOD, revised: true, replaced: true }), { status: 200 })).deps);
    expect(r).toMatchObject({ ok: true, revised: true, replaced: true });
  });
  it("accepts a null thread for a blocked first message", async () => {
    const r = await send(deps({}, new Response(JSON.stringify({ ...GOOD, thread_id: null, blocked: true }), { status: 200 })).deps);
    expect(r).toMatchObject({ ok: true, threadId: null, blocked: true });
  });
  it("only counts a flag that is exactly true", async () => {
    const r = await send(deps({}, new Response(JSON.stringify({ ...GOOD, revised: "yes", blocked: 1 }), { status: 200 })).deps);
    expect(r).toMatchObject({ revised: false, blocked: false });
  });
  it.each([[{}], [{ reply: "" }], [{ reply: "   " }], [{ reply: 5 }], [{ reply: "hi", thread_id: "nope" }], [{ reply: "hi", thread_id: 5 }]])(
    "refuses a strange answer %j", async (body) => {
      expect(await send(deps({}, new Response(JSON.stringify(body), { status: 200 })).deps)).toEqual({ ok: false, error: "The coach could not answer. Please try again." });
    });
  it("refuses an answer that is not JSON", async () => {
    expect((await send(deps({}, new Response("<html>", { status: 200 })).deps)).ok).toBe(false);
  });
});

describe("errors use our words, never the service's, and never hold the token", () => {
  it.each([[401, "Please sign in again."], [404, "That conversation was not found."], [409, "The coach is still answering your last message."],
    [413, "That message is too long."], [422, "That message was not accepted."], [429, "That is a lot of messages in the last hour. Please wait a little."],
    [503, "The coach is switched off."], [504, "The coach took too long. Please try again."], [500, "The coach could not answer. Please try again."],
    [502, "The coach could not answer. Please try again."]])("status %i", async (status, error) => {
    const r = await send(deps({}, new Response(JSON.stringify({ error: `service says ${TOKEN} and private words` }), { status })).deps);
    expect(r).toEqual({ ok: false, error });
  });
  it("hides the reason when the service cannot be reached", async () => {
    const r = await send(deps({}, new Error(`connect ECONNREFUSED coach-api.railway.internal ${TOKEN}`)).deps);
    expect(r).toEqual({ ok: false, error: "Could not reach the coach." });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });
  it("gives up after the time limit", async () => {
    const slow = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted")))));
    const r = await sendToCoach({ text: "hi", threadId: null }, { fetch: slow as unknown as typeof fetch, baseUrl: "http://x", token: TOKEN, timeoutMs: 20 });
    expect(r).toEqual({ ok: false, error: "Could not reach the coach." });
  });
  it("never puts the token in a successful result either", async () => expect(JSON.stringify(await send(deps().deps))).not.toContain(TOKEN));
});

describe("what is logged when the coach cannot be reached", () => {
  it("logs the error code only, never the address, the token or the message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new TypeError("fetch failed to http://coach-api.railway.internal:8000"), {
      cause: { code: "ECONNREFUSED", message: `connect refused ${TOKEN}` },
    });
    await send(deps({}, err).deps);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("ECONNREFUSED");
    expect(logged).not.toContain("railway.internal");
    expect(logged).not.toContain(TOKEN);
    spy.mockRestore();
  });
  it("turns a strange code into unknown", () => {
    expect(connectionCode({ cause: { code: "bad code with spaces and http://x" } })).toBe("unknown");
    expect(connectionCode("nope")).toBe("unknown");
  });
});
