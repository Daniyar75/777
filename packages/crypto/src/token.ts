import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Opaque, high-entropy token for refresh tokens / MFA challenge codes etc. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Refresh tokens are stored hashed (SEC-006) — the plaintext only ever exists client-side. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Short numeric code for MFA/email-style challenges, hashed the same way as a token. */
export function randomNumericCode(digits = 6): string {
  const max = 10 ** digits;
  const n = randomBytes(4).readUInt32BE(0) % max;
  return n.toString().padStart(digits, "0");
}
