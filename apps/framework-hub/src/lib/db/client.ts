import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";
import { requireBindings } from "./context";

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Cloudflare D1 binding DB is not configured");
    this.name = "DatabaseUnavailableError";
  }
}

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type Database = ReturnType<typeof createDatabase>;

export function requireDatabase(context: unknown): Database {
  const binding = requireBindings(context).DB;
  if (!binding) throw new DatabaseUnavailableError();
  return createDatabase(binding);
}

export function requireD1(context: unknown): D1Database {
  const binding = requireBindings(context).DB;
  if (!binding) throw new DatabaseUnavailableError();
  return binding;
}
