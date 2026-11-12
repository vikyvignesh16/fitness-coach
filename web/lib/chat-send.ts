// Sending one message to the coach service. Runs on the server only, because it carries the user's login token.
// The token goes in one header and nowhere else: not in the result, not in an error message, not in a log.
import { MAX_TEXT, isUuid, type CoachFlags } from "./chat";

export type ChatReply =
  | ({ ok: true; threadId: string | null; reply: string } & CoachFlags)
  | { ok: false; error: string };

export type SendDeps = {
  fetch: typeof fetch;
  baseUrl: string | undefined; // COACH_API_URL, the private address of the coach service
  token: string | null; // the signed in user's access token
  timeoutMs?: number;
};

const TIMEOUT_MS = 100_000; // the service gives up after 90 seconds

// Our own words for each answer, so nothing the service sends is shown as it is.
const ERRORS: Record<number, string> = {
  401: "Please sign in again.",
  404: "That conversation was not found.",
  409: "The coach is still answering your last message.",
  413: "That message is too long.",
  422: "That message was not accepted.",
  429: "That is a lot of messages in the last hour. Please wait a little.",
  503: "The coach is switched off.",
  504: "The coach took too long. Please try again.",
};
const GENERIC = "The coach could not answer. Please try again.";

function isText(value: unknown): value is string {
  return typeof value === "string";
}

export async function sendToCoach(input: { text: unknown; threadId: unknown }, deps: SendDeps): Promise<ChatReply> {
  const text = isText(input.text) ? input.text.trim() : "";
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > MAX_TEXT) return { ok: false, error: `Keep the message under ${MAX_TEXT} characters.` };
  const threadId = input.threadId == null ? null : input.threadId;
  if (threadId !== null && !isUuid(threadId)) return { ok: false, error: "That conversation was not found." };
  if (!deps.baseUrl) return { ok: false, error: "The coach is not connected yet." };
  if (!deps.token) return { ok: false, error: ERRORS[401] };

  let response: Response;
  try {
    response = await deps.fetch(`${deps.baseUrl.replace(/\/+$/, "")}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.token}` },
      body: JSON.stringify({ text, thread_id: threadId }),
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach the coach." }; // no error text: it could name the address
  }
  if (!response.ok) return { ok: false, error: ERRORS[response.status] ?? GENERIC };

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: GENERIC };
  }
  if (!isText(body.reply) || !body.reply.trim()) return { ok: false, error: GENERIC };
  const returned = body.thread_id;
  if (returned != null && !isUuid(returned)) return { ok: false, error: GENERIC };
  return {
    ok: true,
    reply: body.reply,
    threadId: returned ?? null,
    revised: body.revised === true,
    replaced: body.replaced === true,
    blocked: body.blocked === true,
    stopped: body.stopped === true,
  };
}
