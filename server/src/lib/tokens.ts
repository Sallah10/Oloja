import crypto from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days: shop phones log in regularly

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// We only ever store the SHA-256 of a token, never the token itself, so a DB
// dump does not hand out working sessions.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}