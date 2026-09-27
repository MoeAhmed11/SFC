import { createHash, randomBytes } from "node:crypto";

// Session token generation. The raw token is returned once to the caller (set
// as a cookie); only its SHA-256 hash is persisted, so a database leak does not
// expose usable session tokens.

const TOKEN_BYTES = 32; // 256 bits of entropy

export function generateSessionToken(): { raw: string; hash: string } {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("base64url");
}
