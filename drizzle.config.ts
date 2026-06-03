import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js convention: app code reads .env.local. Drizzle-kit is invoked
// outside the Next.js runtime, so we load it manually here. Fall back to
// .env so CI / Vercel-style env injection still works.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  // Both files contribute tables; drizzle-kit unions them into one migration.
  schema: ["./src/db/schema.ts", "./src/db/scrapes-schema.ts"],
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // `db:generate` doesn't need a live DB (it diffs schema -> SQL), so
    // an empty string is acceptable. `db:migrate` will fail loudly if
    // this is missing, which is the correct behaviour.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
