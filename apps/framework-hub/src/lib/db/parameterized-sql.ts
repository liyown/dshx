import { sql, type SQL } from "drizzle-orm";

/**
 * Builds a Drizzle SQL object from a static SQLite statement with positional
 * placeholders. Values remain parameters; only the statement fragments are raw.
 * This is reserved for repository queries that cannot use the query builder.
 */
export function parameterizedSql(statement: string, parameters: readonly unknown[] = []): SQL {
  const fragments = statement.split("?");
  if (fragments.length !== parameters.length + 1) {
    throw new Error(
      `SQL placeholder mismatch: expected ${fragments.length - 1}, received ${parameters.length}`,
    );
  }

  const query = sql.raw(fragments[0] ?? "");
  for (let index = 0; index < parameters.length; index += 1) {
    query.append(sql`${parameters[index]}`);
    query.append(sql.raw(fragments[index + 1] ?? ""));
  }
  return query;
}
