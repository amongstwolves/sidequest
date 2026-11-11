// Video scene: a brand's AI agent asks SIDEQUEST for help over MCP.
// Shows an over-limit request being refused, then a compliant one being planned.
//
//   SIDEQUEST_URL=https://sidequest-9qkp.onrender.com MCP_AGENT_API_KEY=... node scripts/agent-demo.mjs
//   (or put MCP_AGENT_API_KEY in .env.local; the first key in the list is used)
//   Add --html to also write storyboard/03-agent-terminal.html for a still image.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const BASE = process.env.SIDEQUEST_URL ?? "https://sidequest-9qkp.onrender.com";
const KEY = (process.env.MCP_AGENT_API_KEY ?? "").split(",")[0].trim();
if (!KEY) throw new Error("Set MCP_AGENT_API_KEY");

const C = { dim: "\x1b[2m", reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m", yellow: "\x1b[33m" };
const lines = []; // [kind, text] for the HTML still
const say = (kind, text, color = "") => {
  lines.push([kind, text]);
  console.log(`${color}${text}${C.reset}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const client = new Client({ name: "demo-brand-agent", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", BASE), { requestInit: { headers: { Authorization: `Bearer ${KEY}` } } }));

say("title", "Demo Brand Marketing Agent  →  SIDEQUEST (MCP)", C.bold);
say("blank", "");

const policy = (await client.callTool({ name: "get_spending_policy", arguments: {} })).structuredContent;
say("call", "▸ get_spending_policy()", C.cyan);
say("info", `  daily limit ${policy.daily_limit} · per mission ${policy.per_mission_limit} · approval above ${policy.human_approval_required_above}`, C.dim);
say("blank", "");
await pause(800);

const ask = "Verify our autumn counter display at Café A and Café B: storefront, full display and a readable price card.";
say("call", `▸ create_mission_objective(budget: $250)`, C.cyan);
const big = await client.callTool({ name: "create_mission_objective", arguments: { request: ask, budget_usd: 250 } });
say("refused", `  ✗ REFUSED  ${big.structuredContent.reasons?.[0] ?? "over limit"}`, C.red + C.bold);
say("blank", "");
await pause(800);

say("call", `▸ create_mission_objective(budget: $75)`, C.cyan);
const ok = await client.callTool({ name: "create_mission_objective", arguments: { request: ask, budget_usd: 75 } });
const r = ok.structuredContent;
if (ok.isError) {
  say("refused", `  ✗ REFUSED  ${r.reasons?.[0] ?? r.error}`, C.red + C.bold);
} else {
  say("ok", `  ✓ PLANNED  ${r.proposed_missions?.length ?? 0} missions · ${r.proposed_missions?.map((m) => m.reward).join(" + ")} of ${r.budget}`, C.green + C.bold);
  for (const m of r.proposed_missions ?? []) say("info", `    · ${m.title}  ${m.reward}`, C.dim);
  say("info", `  next: Demo Brand Co. approves the PayPal hold`, C.yellow);
  say("info", `  objective ${r.objective_id}`, C.dim);
}
await client.close();

if (process.argv.includes("--html")) {
  const color = { title: "#ffffff", call: "#7dd3fc", refused: "#f87171", ok: "#6ee7b7", info: "#94a3b8", blank: "#94a3b8" };
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = lines.map(([k, t]) => `<div style="white-space:pre-wrap;color:${color[k]};${k === "refused" || k === "ok" || k === "title" ? "font-weight:700;" : ""}">${esc(t) || "&nbsp;"}</div>`).join("");
  mkdirSync("storyboard", { recursive: true });
  writeFileSync(
    "storyboard/03-agent-terminal.html",
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0c111b;font:15px/1.7 ui-monospace,Menlo,monospace;padding:28px 22px;word-break:break-word"><div style="color:#64748b;margin-bottom:14px">$ node agent.mjs</div>${body}</body>`,
  );
  console.log(`${C.dim}wrote storyboard/03-agent-terminal.html${C.reset}`);
}
