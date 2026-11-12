"use server";

import { revalidatePath } from "next/cache";
import { forgetFact } from "@/lib/chat-memory";
import { sendToCoach, type ChatReply } from "@/lib/chat-send";
import { createClient } from "@/lib/supabase/server";

/** Send one message to the coach. The login is checked here, on the server, and the token never goes back to the browser. */
export async function sendMessageAction(input: { text: string; threadId: string | null }): Promise<ChatReply> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); // asks Supabase. getSession alone only reads the cookie
  if (!user) return { ok: false, error: "Please sign in again." };
  const { data: { session } } = await supabase.auth.getSession();
  const result = await sendToCoach(
    { text: input?.text, threadId: input?.threadId ?? null },
    { fetch, baseUrl: process.env.COACH_API_URL, token: session?.access_token ?? null },
  );
  if (result.ok) revalidatePath("/chat");
  return result;
}

/** Forget one remembered fact. */
export async function forgetFactAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const result = await forgetFact(supabase, id);
  if (result.ok) revalidatePath("/chat");
  return result;
}
