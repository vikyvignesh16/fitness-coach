// Small pure helpers for the Chat tab. No network, no database, so they are easy to test.

export const MAX_TEXT = 2000; // the coach service refuses anything longer
export const FALLBACK_CAP_USD = 10; // used when no cap row exists, same default as coach/budget.py
export const WARN_AT = 0.8;
export const MAX_FACTS = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatMessage = { id: string; role: "user" | "coach"; body: string; created_at: string };
export type ChatThread = { id: string; title: string | null; created_at: string };
export type RememberedFact = { id: string; fact: string; created_at: string };
export type Spend = { spentUsd: number; capUsd: number };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The ?thread= value from the address bar, or null if it is missing, repeated or not an id. */
export function parseThreadParam(value: unknown): string | null {
  return isUuid(value) ? value.toLowerCase() : null;
}

/** Midnight in Paris on the first day of the month that contains `today` (yyyy-mm-dd), as a UTC time. The cap resets then. */
export function monthStartUtc(today: string): string {
  const first = `${today.slice(0, 7)}-01`;
  const noon = new Date(`${first}T12:00:00Z`);
  const label =
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", timeZoneName: "longOffset" })
      .formatToParts(noon)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = label.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  // Midnight is 12 hours before noon. Clock changes happen on the last Sunday, never on the 1st, so one offset covers both.
  return new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 1) - offsetMinutes * 60_000).toISOString();
}

export function spendLine(spend: Spend): { text: string; level: "ok" | "careful" | "stop" } {
  const { spentUsd, capUsd } = spend;
  const text = `This month: $${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)}`;
  if (capUsd <= 0 || spentUsd >= capUsd) return { text, level: "stop" };
  return { text, level: spentUsd >= capUsd * WARN_AT ? "careful" : "ok" };
}

export function threadTitle(thread: ChatThread): string {
  const title = thread.title?.trim();
  return title ? title : `Chat from ${thread.created_at.slice(0, 10)}`;
}

export type CoachFlags = { revised: boolean; replaced: boolean; blocked: boolean; stopped: boolean };

/** Plain words for what the guardrails did to an answer. Empty when nothing happened. */
export function noticesFor(flags: CoachFlags): string[] {
  const notes: string[] = [];
  if (flags.blocked) notes.push("The monthly spending cap stopped this message, so nothing was sent to the model.");
  if (flags.stopped) notes.push("The coach took too many steps and stopped.");
  if (flags.replaced) notes.push("The coach could not check its own answer, so this fixed message is shown instead.");
  else if (flags.revised) notes.push("The coach checked its first answer against your data and wrote it again before showing it.");
  return notes;
}
