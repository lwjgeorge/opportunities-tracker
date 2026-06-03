import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { fixtureSchema } from "./fixture-schema";

const fixturesDir = path.join(process.cwd(), "src/lib/llm/eval/fixtures");

describe("eval fixtures on disk", () => {
  it("every *.json file parses against the fixture schema", async () => {
    const files = (await readdir(fixturesDir)).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);

    for (const f of files) {
      const raw = await readFile(path.join(fixturesDir, f), "utf-8");
      const parsed = fixtureSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error(
          `Fixture ${f} failed schema: ${JSON.stringify(parsed.error.flatten(), null, 2)}`,
        );
      }
    }
  });

  it("fixture file basenames match their declared `name`", async () => {
    const files = (await readdir(fixturesDir)).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const raw = await readFile(path.join(fixturesDir, f), "utf-8");
      const parsed = fixtureSchema.parse(JSON.parse(raw));
      // Filename pattern: <NN>-<name>.json. The `name` field should equal the
      // filename minus the numeric prefix and extension.
      const expected = f.replace(/^\d+-/, "").replace(/\.json$/, "");
      expect(parsed.name).toBe(expected);
    }
  });
});
