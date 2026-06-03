import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// Build a singleton db client on first access. Eager construction at import
// time made `next build` explode whenever any route file imported `@/db`
// without DATABASE_URL set — the Neon driver throws on an empty connection
// string. Lazy is the right shape: build only resolves modules, runtime is
// the place to demand env vars.
let cached: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  cached = drizzle(neon(connectionString), { schema });
  return cached;
}

// Proxy so existing `import { db } from "@/db"` call sites keep working.
// Reads trigger lazy init on first access; calls forward to the real client.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type Database = ReturnType<typeof drizzle>;
export { schema };
