/** Pages anyone can open without signing in. Everything else needs a login. */
// /calendar/feed is the private calendar link. Google Calendar cannot log in, so the long token in the address is the key.
const PUBLIC_PATHS = ["/login", "/calendar/feed"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
