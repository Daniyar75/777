/**
 * Duplicate-detection normalization (BRULE-CONTACT-003, FR-CONTACT-004). Deliberately simple
 * for MVP — strips formatting so the same phone/email typed differently still matches; it is
 * not a full E.164 parser. Tenant-specific matching thresholds/rules beyond this are future
 * configuration, not something to invent here (ASM-001).
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length > 0 ? digits : null;
}

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
