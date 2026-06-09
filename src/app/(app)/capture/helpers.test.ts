import { describe, expect, it } from "vitest";

import {
  matchExistingCompany,
  matchExistingContact,
  normalizeCompanyName,
  normalizeEmail,
} from "./helpers";

describe("normalizeCompanyName", () => {
  it("lower-cases and trims", () => {
    expect(normalizeCompanyName("  Stripe  ")).toBe("stripe");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeCompanyName("Bridge   Talent\tCo")).toBe("bridge talent co");
  });

  it("is idempotent", () => {
    const once = normalizeCompanyName(" Linear ");
    expect(normalizeCompanyName(once)).toBe(once);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeCompanyName("   \t  ")).toBe("");
  });
});

describe("normalizeEmail", () => {
  it("lower-cases and trims", () => {
    expect(normalizeEmail(" Aisha@Stripe.COM ")).toBe("aisha@stripe.com");
  });
});

describe("matchExistingCompany", () => {
  const COMPANIES = [
    { id: 1, name: "Stripe" },
    { id: 2, name: "Bridge Talent" },
    { id: 3, name: "Neon" },
  ];

  it("finds an exact-case match", () => {
    expect(matchExistingCompany("Stripe", COMPANIES)?.id).toBe(1);
  });

  it("finds a case-insensitive match", () => {
    expect(matchExistingCompany("stripe", COMPANIES)?.id).toBe(1);
    expect(matchExistingCompany("BRIDGE TALENT", COMPANIES)?.id).toBe(2);
  });

  it("tolerates extra whitespace", () => {
    expect(matchExistingCompany("  Neon  ", COMPANIES)?.id).toBe(3);
    expect(matchExistingCompany("Bridge   Talent", COMPANIES)?.id).toBe(2);
  });

  it("returns null when no candidate matches", () => {
    expect(matchExistingCompany("Linear", COMPANIES)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(matchExistingCompany("   ", COMPANIES)).toBeNull();
  });
});

describe("matchExistingContact", () => {
  const CONTACTS = [
    { id: 10, name: "Aisha Khan", email: "aisha@stripe.com" },
    { id: 11, name: "Marcus", email: null },
    { id: 12, name: "Talia", email: "talia@bridge-talent.com" },
  ];

  it("prefers email match (case-insensitive) over name", () => {
    // Different display name but same email → still matches by email.
    expect(
      matchExistingContact(
        { name: "Aisha K.", email: "AISHA@stripe.com" },
        CONTACTS,
      )?.id,
    ).toBe(10);
  });

  it("falls back to case-insensitive name match when no email is given", () => {
    expect(matchExistingContact({ name: "marcus" }, CONTACTS)?.id).toBe(11);
  });

  it("falls back to name when email has no match", () => {
    expect(
      matchExistingContact(
        { name: "Talia", email: "different@example.com" },
        CONTACTS,
      )?.id,
    ).toBe(12);
  });

  it("returns null when neither email nor name matches", () => {
    expect(
      matchExistingContact({ name: "Diego", email: "diego@neon.tech" }, CONTACTS),
    ).toBeNull();
  });

  it("does not match a name-only candidate via empty email lookup", () => {
    // Empty-string email must not collide with rows that have a null email.
    expect(
      matchExistingContact({ name: "nope", email: "" }, CONTACTS),
    ).toBeNull();
  });
});
