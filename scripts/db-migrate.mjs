// Applies db/migrations/*.sql (once each) and then db/seed.sql to DATABASE_URL.
// Usage: npm run db:migrate            (migrations + seed)
//        npm run db:migrate -- --no-seed
import postgres from "postgres";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.local or environment).");
  process.exit(1);
}

const local = /localhost|127\.0\.0\.1/.test(url);
const sql = postgres(url, { ssl: local ? false : "require", prepare: false, max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));

  const dir = join(root, "db", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) {
      console.log(`skip   ${file} (already applied)`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, file), "utf8"));
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`apply  ${file}`);
  }

  if (!process.argv.includes("--no-seed")) {
    await sql.unsafe(readFileSync(join(root, "db", "seed.sql"), "utf8"));
    console.log("seed   db/seed.sql (demo data reset)");
  }
  console.log("Done.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
