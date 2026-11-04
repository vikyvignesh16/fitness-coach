"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { newFeedToken } from "@/lib/feed-token";
import { createClient } from "@/lib/supabase/server";

export type FeedLinkResult = { url: string | null; error: string | null };

/**
 * Make the calendar link. If one exists it is replaced, so the old link stops working.
 * The token is returned once and never stored, only its hash is.
 */
export async function createFeedLink(): Promise<FeedLinkResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { url: null, error: "You are signed out. Sign in again." };

  const { token, hash } = newFeedToken();
  const { error } = await supabase
    .from("calendar_feeds")
    .upsert({ user_id: user.id, token_hash: hash, created_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { url: null, error: "Could not make the link. Try again." }; // never show database errors

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return { url: null, error: "Could not work out the address of this site." };
  revalidatePath("/calendar");
  return { url: `https://${host}/calendar/feed/${token}.ics`, error: null };
}
