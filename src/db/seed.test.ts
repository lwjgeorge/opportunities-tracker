import { describe, expect, it } from "vitest";

import { APPLICATION_STAGES } from "@/lib/types";

import {
  seedApplications,
  seedCompanies,
  seedContacts,
  seedEmailAllowlist,
  seedEmailEvents,
  seedRecruiters,
  seedRelationships,
} from "./seed-data";

// Pure tests of the demo fixture. No database. The goal is to keep the
// dataset internally consistent so that running `pnpm db:seed` against a
// fresh Postgres can't fail on a referential-integrity error we could've
// caught at edit-time.

describe("seed-data: spec compliance", () => {
  it("has 5 companies with website + careersUrl filled in", () => {
    expect(seedCompanies).toHaveLength(5);
    for (const c of seedCompanies) {
      expect(c.name).toBeTruthy();
      expect(c.website).toMatch(/^https?:\/\//);
      expect(c.careersUrl).toMatch(/^https?:\/\//);
    }
  });

  it("includes the five named companies", () => {
    const names = seedCompanies.map((c) => c.name).sort();
    expect(names).toEqual(
      ["Anthropic", "Linear", "Neon", "Stripe", "Vercel"].sort(),
    );
  });

  it("has 4 contacts with realistic emails and notes", () => {
    expect(seedContacts).toHaveLength(4);
    for (const c of seedContacts) {
      expect(c.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      expect(c.notes).toBeTruthy();
    }
  });

  it("has 3 recruiters; exactly one has an agency", () => {
    expect(seedRecruiters).toHaveLength(3);
    const withAgency = seedRecruiters.filter((r) => r.agency !== null);
    expect(withAgency).toHaveLength(1);
  });

  it("has 4 relationships with role filled in", () => {
    expect(seedRelationships).toHaveLength(4);
    for (const r of seedRelationships) {
      expect(r.role).toBeTruthy();
    }
  });

  it("has 10 applications", () => {
    expect(seedApplications).toHaveLength(10);
  });

  it("has 2 email_allowlist entries (one domain, one address)", () => {
    expect(seedEmailAllowlist).toHaveLength(2);
    const kinds = seedEmailAllowlist.map((e) => e.kind).sort();
    expect(kinds).toEqual(["address", "domain"]);
  });

  it("has 6 email_events", () => {
    expect(seedEmailEvents).toHaveLength(6);
  });

  it("has half of email_events linked to applications", () => {
    const linked = seedEmailEvents.filter((e) => e.applicationIndex !== null);
    expect(linked).toHaveLength(3);
  });
});

describe("seed-data: stage coverage", () => {
  it("covers all 7 application stages", () => {
    const stagesSeen = new Set(seedApplications.map((a) => a.stage));
    for (const stage of APPLICATION_STAGES) {
      expect(stagesSeen.has(stage)).toBe(true);
    }
  });

  it("uses the exact per-stage counts the brief asked for", () => {
    const counts: Record<string, number> = {};
    for (const a of seedApplications) {
      counts[a.stage] = (counts[a.stage] ?? 0) + 1;
    }
    expect(counts).toEqual({
      lead: 2,
      applied: 2,
      screen: 2,
      interview: 1,
      offer: 1,
      closed_won: 1,
      closed_lost: 1,
    });
  });

  it("stamps positionInStage sequentially per stage starting at 0", () => {
    const perStage: Record<string, number[]> = {};
    for (const a of seedApplications) {
      (perStage[a.stage] ??= []).push(a.positionInStage);
    }
    for (const positions of Object.values(perStage)) {
      const sorted = [...positions].sort((a, b) => a - b);
      expect(sorted).toEqual(positions.map((_, i) => i));
    }
  });

  it("clears appliedAt for leads and sets it for everything else", () => {
    for (const a of seedApplications) {
      if (a.stage === "lead") {
        expect(a.appliedAt).toBeNull();
      } else {
        expect(a.appliedAt).toBeInstanceOf(Date);
      }
    }
  });
});

describe("seed-data: referential integrity", () => {
  it("every recruiter.contactIndex points at an existing contact", () => {
    for (const r of seedRecruiters) {
      expect(r.contactIndex).toBeGreaterThanOrEqual(0);
      expect(r.contactIndex).toBeLessThan(seedContacts.length);
    }
  });

  it("every relationship.{contactIndex,companyIndex} resolves", () => {
    for (const r of seedRelationships) {
      expect(r.contactIndex).toBeGreaterThanOrEqual(0);
      expect(r.contactIndex).toBeLessThan(seedContacts.length);
      expect(r.companyIndex).toBeGreaterThanOrEqual(0);
      expect(r.companyIndex).toBeLessThan(seedCompanies.length);
    }
  });

  it("every application.{companyIndex,recruiterIndex,primaryContactIndex} resolves", () => {
    for (const a of seedApplications) {
      expect(a.companyIndex).toBeGreaterThanOrEqual(0);
      expect(a.companyIndex).toBeLessThan(seedCompanies.length);
      if (a.recruiterIndex !== null) {
        expect(a.recruiterIndex).toBeGreaterThanOrEqual(0);
        expect(a.recruiterIndex).toBeLessThan(seedRecruiters.length);
      }
      if (a.primaryContactIndex !== null) {
        expect(a.primaryContactIndex).toBeGreaterThanOrEqual(0);
        expect(a.primaryContactIndex).toBeLessThan(seedContacts.length);
      }
    }
  });

  it("every email_event.applicationIndex resolves when non-null", () => {
    for (const e of seedEmailEvents) {
      if (e.applicationIndex !== null) {
        expect(e.applicationIndex).toBeGreaterThanOrEqual(0);
        expect(e.applicationIndex).toBeLessThan(seedApplications.length);
      }
    }
  });
});

describe("seed-data: hygiene", () => {
  it("allowlist values are lowercased", () => {
    for (const e of seedEmailAllowlist) {
      expect(e.value).toBe(e.value.toLowerCase());
    }
  });

  it("allowlist domain entries do not contain '@'", () => {
    for (const e of seedEmailAllowlist) {
      if (e.kind === "domain") {
        expect(e.value).not.toContain("@");
      } else {
        expect(e.value).toContain("@");
      }
    }
  });
});
