import { describe, expect, it } from "vitest";

import {
  applicationStage,
  applications,
  companies,
  contacts,
  emailAllowlist,
  emailAllowlistKind,
  emailEvents,
  emailProvider,
  recruiters,
  relationships,
} from "./schema";
import { companyScrapes } from "./scrapes-schema";

// Sanity coverage: the schema modules import cleanly and the enums/tables
// expose the expected shape. This catches accidental rename / removal in
// either schema file before it bites a runtime caller.

describe("schema modules", () => {
  it("exports all expected tables from src/db/schema.ts", () => {
    expect(applications).toBeDefined();
    expect(companies).toBeDefined();
    expect(contacts).toBeDefined();
    expect(emailAllowlist).toBeDefined();
    expect(emailEvents).toBeDefined();
    expect(recruiters).toBeDefined();
    expect(relationships).toBeDefined();
  });

  it("exports company_scrapes from src/db/scrapes-schema.ts", () => {
    expect(companyScrapes).toBeDefined();
  });

  it("application_stage enum covers all kanban columns", () => {
    expect(applicationStage.enumValues).toEqual([
      "lead",
      "applied",
      "screen",
      "interview",
      "offer",
      "closed_won",
      "closed_lost",
    ]);
  });

  it("email_allowlist_kind enum is exactly { domain, address }", () => {
    expect([...emailAllowlistKind.enumValues].sort()).toEqual([
      "address",
      "domain",
    ]);
  });

  it("email_provider enum currently only knows 'gmail'", () => {
    expect(emailProvider.enumValues).toEqual(["gmail"]);
  });
});
