import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

// util.promisify(crypto.scrypt) only exposes the 3-arg (no options) overload's types, so the
// options-accepting call is wrapped by hand instead of losing the cost-parameter overload.
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Password hashing (SEC-002 "надежное хэширование паролей"). Uses Node's built-in scrypt
 * (a memory-hard KDF, OWASP-acceptable minimum: N=2^14, r=8, p=1) rather than a native
 * Argon2 addon, to keep the stack dependency-free and portable across build environments
 * (docs/architecture/adr/0003-authentication.md calls out Argon2id-class as an example, not
 * a hard requirement — this satisfies the same "memory-hard, never reversible" property).
 * Swapping to a native Argon2id binding later is a drop-in change behind this module's API.
 */
const N = 16384;
const r = 8;
const p = 1;
const KEY_LENGTH = 32;

export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plaintext, salt, KEY_LENGTH, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, r, p, salt.toString("hex"), derived.toString("hex")].join("$");
}

export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const saltN = Number(nStr);
  const saltR = Number(rStr);
  const saltP = Number(pStr);
  const salt = Buffer.from(saltHex ?? "", "hex");
  const expected = Buffer.from(hashHex ?? "", "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = await scrypt(plaintext, salt, expected.length, {
    N: saltN,
    r: saltR,
    p: saltP,
    maxmem: 64 * 1024 * 1024,
  });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
