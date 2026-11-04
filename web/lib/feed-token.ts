import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes as 43 url safe characters. Too long to guess. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The same hash the database function computes: sha256 of the token's UTF-8 text, as hex. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A new link token and the hash to store. The token itself is shown once and never stored. */
export function newFeedToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
