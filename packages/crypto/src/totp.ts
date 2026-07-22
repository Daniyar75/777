import { createHmac, randomBytes } from "node:crypto";

/**
 * Minimal RFC 6238 TOTP implementation (used for MFA, SEC-002/ADR-0003), dependency-free
 * on purpose — same reasoning as password.ts choosing node:crypto scrypt over a native
 * addon. 6-digit codes, 30s step, HMAC-SHA1 (the widely interoperable authenticator-app
 * default).
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

export function computeTotp(secretBase32: string, timeStepSeconds = 30, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / timeStepSeconds);
  return hotp(base32Decode(secretBase32), counter);
}

/** window=1 accepts the previous/next 30s step too, tolerating minor clock drift. */
export function verifyTotp(
  secretBase32: string,
  code: string,
  window = 1,
  timeStepSeconds = 30,
  at: number = Date.now(),
): boolean {
  const counter = Math.floor(at / 1000 / timeStepSeconds);
  const secret = base32Decode(secretBase32);
  for (let errorWindow = -window; errorWindow <= window; errorWindow += 1) {
    if (hotp(secret, counter + errorWindow) === code) return true;
  }
  return false;
}
