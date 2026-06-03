import { describe, expect, it } from "vitest";

import { buildFromQuery } from "./gmail";

describe("buildFromQuery", () => {
  it("returns null when allowlist is empty", () => {
    expect(buildFromQuery({ domains: [], addresses: [] })).toBeNull();
  });

  it("returns null when only blanks", () => {
    expect(buildFromQuery({ domains: [" ", ""], addresses: [""] })).toBeNull();
  });

  it("formats a single domain as a bare @-prefixed term", () => {
    expect(buildFromQuery({ domains: ["example.com"], addresses: [] })).toBe(
      "from:(@example.com)",
    );
  });

  it("formats a single address as the raw email", () => {
    expect(
      buildFromQuery({ domains: [], addresses: ["recruiter@example.com"] }),
    ).toBe("from:(recruiter@example.com)");
  });

  it("joins multiple terms with OR", () => {
    expect(
      buildFromQuery({
        domains: ["acme.com", "globex.io"],
        addresses: ["talent@hooli.com"],
      }),
    ).toBe("from:(@acme.com OR @globex.io OR talent@hooli.com)");
  });

  it("lowercases and trims terms", () => {
    expect(
      buildFromQuery({
        domains: ["  ACME.com  "],
        addresses: ["TALENT@Hooli.com"],
      }),
    ).toBe("from:(@acme.com OR talent@hooli.com)");
  });

  it("skips empty entries inside otherwise-populated lists", () => {
    expect(
      buildFromQuery({
        domains: ["acme.com", "  ", ""],
        addresses: ["", "talent@hooli.com"],
      }),
    ).toBe("from:(@acme.com OR talent@hooli.com)");
  });
});
