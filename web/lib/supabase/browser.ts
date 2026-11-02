import { createBrowserClient } from "@supabase/ssr";

/** Supabase in the browser, signed in as the user. Used only to upload photos, so the file never passes through the server. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
