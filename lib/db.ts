import "server-only";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __sidequestSql?: Sql };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function db(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!globalForDb.__sidequestSql) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    globalForDb.__sidequestSql = postgres(url, {
      ssl: local ? false : "require",
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      max: 5,
      idle_timeout: 20,
    });
  }
  return globalForDb.__sidequestSql;
}
