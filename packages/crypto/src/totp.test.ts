import { describe, expect, it } from "vitest";
import { computeTotp, generateTotpSecret, verifyTotp } from "./totp.js";

describe("TOTP (RFC 6238)", () => {
  it("verifies a code computed for the same instant", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = computeTotp(secret, 30, now);
    expect(verifyTotp(secret, code, 1, 30, now)).toBe(true);
  });

  it("rejects a code for a different secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const now = Date.now();
    const code = computeTotp(secretA, 30, now);
    expect(verifyTotp(secretB, code, 1, 30, now)).toBe(false);
  });

  it("tolerates one time-step of drift but not two", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const codeOneStepAgo = computeTotp(secret, 30, now - 30_000);
    const codeTwoStepsAgo = computeTotp(secret, 30, now - 60_000);
    expect(verifyTotp(secret, codeOneStepAgo, 1, 30, now)).toBe(true);
    expect(verifyTotp(secret, codeTwoStepsAgo, 1, 30, now)).toBe(false);
  });

  it("rejects a garbage code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "000000", 1, 30, Date.now())).toBe(false);
  });
});
