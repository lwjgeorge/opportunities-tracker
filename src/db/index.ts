import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail fast at import time rather than on the first query — makes
  // misconfiguration loud during boot in any runtime (Node, Edge, scripts).
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

const sqlClient = neon(connectionString);

export const db = drizzle(sqlClient, { schema });

export type Database = typeof db;
export { schema };
