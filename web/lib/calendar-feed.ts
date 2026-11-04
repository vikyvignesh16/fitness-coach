import { buildIcs, type FeedData } from "./ics";

/** Reads the feed for a token. Returns null for an unknown token. Only the database function is behind this. */
export interface FeedDb {
  feed(token: string): Promise<FeedData | null>;
}

export type FeedResponse = { status: 200 | 404 | 500; body: string; type: string };

const NOT_FOUND: FeedResponse = { status: 404, body: "Not found", type: "text/plain; charset=utf-8" };

/** The link ends in .ics so calendar apps recognise it. The token is the part before that. */
export function tokenFromPath(segment: string): string {
  return segment.endsWith(".ics") ? segment.slice(0, -4) : segment;
}

/**
 * Answer a calendar request. A token of the wrong shape never reaches the database.
 * Unknown and malformed tokens look the same from outside, and errors never reveal why.
 */
export async function feedResponse(
  segment: string,
  db: FeedDb,
  isValidToken: (t: string) => boolean,
  now: Date = new Date(),
): Promise<FeedResponse> {
  const token = tokenFromPath(segment);
  if (!isValidToken(token)) return NOT_FOUND;
  try {
    const feed = await db.feed(token);
    if (!feed) return NOT_FOUND;
    return { status: 200, body: buildIcs(feed, now), type: "text/calendar; charset=utf-8" };
  } catch {
    return { status: 500, body: "Something went wrong.", type: "text/plain; charset=utf-8" };
  }
}
