import { createServerClient } from "@supabase/ssr";
import { feedResponse, type FeedDb } from "@/lib/calendar-feed";
import { TOKEN_PATTERN } from "@/lib/feed-token";
import type { FeedData } from "@/lib/ics";

/**
 * The calendar link. Google Calendar fetches this with no login, so the token in the address is the key.
 * It reads through the anon key and one database function, so nothing else is reachable from here.
 */
const db: FeedDb = {
  async feed(token) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => [], setAll: () => {} }, // no session: the token is the only credential
    });
    const { data, error } = await supabase.rpc("calendar_feed", { feed_token: token });
    if (error) throw new Error("feed read failed"); // the cause is not sent to the caller
    return (data as FeedData | null) ?? null;
  },
};

export async function GET(_req: Request, ctx: RouteContext<"/calendar/feed/[token]">) {
  const { token } = await ctx.params;
  const r = await feedResponse(token, db, (t) => TOKEN_PATTERN.test(t));
  return new Response(r.body, {
    status: r.status,
    headers: { "Content-Type": r.type, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
