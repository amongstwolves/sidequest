// Validates db/migrations + db/seed.sql in an embedded Postgres (PGlite) — no database needed.
// Also proves the key invariants hold at the database level.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new PGlite();
let failures = 0;

function check(name, ok, detail = "") {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

async function expectError(name, sql, pattern) {
  try {
    await db.exec(sql);
    check(name, false, "statement succeeded but should have been rejected");
  } catch (err) {
    check(name, pattern.test(err.message), err.message.split("\n")[0]);
  }
}

const migrationsDir = join(root, "db", "migrations");
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  check(`migration ${file}`, true);
}
const seed = readFileSync(join(root, "db", "seed.sql"), "utf8");
await db.exec(seed);
await db.exec(seed); // must be re-runnable (demo reset)
check("seed runs twice (reset-safe)", true);

const count = async (t) => (await db.query(`select count(*)::int as n from ${t}`)).rows[0].n;
check("users seeded", (await count("users")) === 8);
check("operators seeded", (await count("operators")) === 7);
check("locations seeded", (await count("locations")) === 3);
check("agent policy seeded", (await count("agent_policies")) === 1);

// Build a minimal objective + mission to exercise constraints.
await db.exec(`
  insert into objectives (id, requester_id, agent_id, request_text, budget_minor, state)
  values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-00000000a6e1', 'Verify displays at Café A and Café B', 7500, 'PUBLISHED');
  insert into missions (id, objective_id, category, title, description, location_id, lat, lng, reward_minor, deadline, rubric_json, state)
  values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'RECON',
          'Photograph display at Café A', 'Two photos of the counter display', 'cafe_demo_a', 35.247, -80.807,
          3000, now() + interval '1 day', '{"requirements": []}', 'PUBLISHED');
  insert into assignments (mission_id, operator_id, agreed_reward_minor)
  values ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-0000000000a1', 3000);
`);
check("first operator accepts mission", true);

await expectError(
  "second active assignment rejected (no double-assign)",
  `insert into assignments (mission_id, operator_id, agreed_reward_minor)
   values ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-0000000000b1', 3000);`,
  /assignments_one_active_per_mission/
);

await db.exec(`update assignments set status = 'WITHDRAWN', withdrawal_reason = 'test'
               where mission_id = '22222222-2222-4222-8222-222222222222';`);
await db.exec(`insert into assignments (mission_id, operator_id, agreed_reward_minor)
               values ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-0000000000b1', 3000);`);
check("reassignment allowed after withdrawal", true);

await db.exec(`insert into payment_transactions (operation, idempotency_key, state)
               values ('CAPTURE', 'mission:2222:capture:v1', 'COMPLETED');`);
await expectError(
  "duplicate idempotency key rejected (no double-pay)",
  `insert into payment_transactions (operation, idempotency_key, state)
   values ('CAPTURE', 'mission:2222:capture:v1', 'COMPLETED');`,
  /idempotency_key/
);

await expectError(
  "negative money rejected",
  `insert into missions (objective_id, category, title, description, lat, lng, reward_minor, deadline, rubric_json)
   values ('11111111-1111-4111-8111-111111111111', 'RECON', 'x', 'x', 0, 0, -100, now(), '{}');`,
  /reward_minor_check/
);

await expectError(
  "capture beyond authorization rejected",
  `insert into funding_authorizations (objective_id, amount_minor, captured_minor)
   values ('11111111-1111-4111-8111-111111111111', 7500, 8000);`,
  /check/
);

await db.close();
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll database checks passed.");
process.exit(failures ? 1 : 0);
