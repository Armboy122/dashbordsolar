import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.NEON_DB;

if (!connectionString) {
  throw new Error("Missing NEON_DB environment variable");
}

export const sql = neon(connectionString);
export const db = drizzle(sql, { schema });
