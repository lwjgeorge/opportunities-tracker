import { describe, expect, it } from "vitest";

import { extract, isAllowedByRobots } from "./html";

const fixtureHtml = `<!doctype html>
<html>
  <head>
    <title>Acme — Industrial-grade explosives</title>
    <meta name="description" content="We make the cartoon dynamite">
    <meta property="og:site_name" content="Acme Inc">
    <meta property="og:title" content="Acme — pioneers in dynamite">
  </head>
  <body>
    <h1>Welcome to Acme</h1>
    <h2>What we do</h2>
    <h2>Our team</h2>
    <a href="/careers">Careers</a>
    <a href="/about-us">About us</a>
    <a href="https://acme.com/contact">Contact our sales team</a>
    <a href="https://twitter.com/acme">Follow us</a>
    <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
    <a href="mailto:hello@acme.com">say hi</a>
    <p>Reach me at sales@acme.com or wile.e.coyote@acme.com</p>
  </body>
</html>`;

describe("extract", () => {
  const result = extract(fixtureHtml, "https://acme.com");

  it("prefers <title> over og:title", () => {
    expect(result.title).toBe("Acme — Industrial-grade explosives");
  });

  it("reads the meta description", () => {
    expect(result.description).toBe("We make the cartoon dynamite");
  });

  it("reads og:site_name", () => {
    expect(result.siteName).toBe("Acme Inc");
  });

  it("collects h1 + h2 in order, deduped", () => {
    expect(result.headings).toEqual([
      "Welcome to Acme",
      "What we do",
      "Our team",
    ]);
  });

  it("finds careers links", () => {
    expect(result.careersLinks).toContain("https://acme.com/careers");
  });

  it("finds about links", () => {
    expect(result.aboutLinks).toContain("https://acme.com/about-us");
  });

  it("finds contact links", () => {
    expect(result.contactLinks).toContain("https://acme.com/contact");
  });

  it("classifies social links by host", () => {
    const kinds = result.socialLinks.map((l) => l.kind).sort();
    expect(kinds).toEqual(["linkedin", "twitter"]);
  });

  it("regex-mines email addresses, lowercased + deduped", () => {
    expect(result.emails.sort()).toEqual([
      "hello@acme.com",
      "sales@acme.com",
      "wile.e.coyote@acme.com",
    ]);
  });

  it("returns empty arrays for missing fields rather than throwing", () => {
    const minimal = extract("<html><body></body></html>", "https://x.test");
    expect(minimal.title).toBeNull();
    expect(minimal.description).toBeNull();
    expect(minimal.headings).toEqual([]);
    expect(minimal.emails).toEqual([]);
  });
});

describe("isAllowedByRobots", () => {
  const robots = `
User-agent: *
Disallow: /admin/
Disallow: /private

User-agent: BadBot
Disallow: /

User-agent: OpportunitiesTracker
Disallow: /opt-out/
`;

  it("allows root for our agent", () => {
    expect(isAllowedByRobots(robots, "OpportunitiesTracker", "/")).toBe(true);
  });

  it("blocks the explicit opt-out path for our agent", () => {
    expect(
      isAllowedByRobots(robots, "OpportunitiesTracker", "/opt-out/foo"),
    ).toBe(false);
  });

  it("respects the wildcard group", () => {
    expect(isAllowedByRobots(robots, "OpportunitiesTracker", "/admin/x")).toBe(
      false,
    );
  });

  it("allows when no rule matches", () => {
    expect(isAllowedByRobots(robots, "OpportunitiesTracker", "/public")).toBe(
      true,
    );
  });

  it("allows everything when robots.txt is empty", () => {
    expect(isAllowedByRobots("", "OpportunitiesTracker", "/anywhere")).toBe(
      true,
    );
  });

  it("strips comments before parsing", () => {
    const withComments = `
# disable junk
User-agent: *
Disallow: /tmp  # temp area
`;
    expect(isAllowedByRobots(withComments, "OpportunitiesTracker", "/tmp/x")).toBe(false);
    expect(isAllowedByRobots(withComments, "OpportunitiesTracker", "/keep")).toBe(true);
  });
});
