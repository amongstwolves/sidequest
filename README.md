# SIDEQUEST

**The real world has quests.** SIDEQUEST is the physical-world execution layer for AI: a person, business, or authorized AI agent describes an outcome, SIDEQUEST plans it into local missions, nearby human operators accept and complete them, AI checks the proof, and PayPal holds, captures, and pays out the money as work is verified.

> Built for the PayPal AI Hackathon 2026. All brands, venues, people, and neighborhoods in the demo are fictional.

## Status

What works today:

- [x] Plain-English objective → Claude-planned missions (structured output, validated against permitted locations).
- [x] Deterministic policy gate: prohibited activities and spending limits, with visible refusals.
- [x] PayPal hold on plan approval; missions publish only after the authorization succeeds.
- [x] Live operator matching (distance, availability, skills, reliability, deadline) and exclusive accept.
- [x] Photo proof reviewed by Claude against the mission checklist, with a correction cycle.
- [x] Approve & pay: partial capture → PayPal Payouts to the operator → unused budget voided.
- [x] AI agent access over MCP, held to the agent's spending policy.
- [x] Demo role switcher (Requester / Operator A / Operator B) and one-click demo reset.
- [ ] AG Grid Mission Control (in progress).

## How PayPal is used

| Step | PayPal API |
|---|---|
| Requester approves the plan | Orders v2 `intent: AUTHORIZE` — funds are held, not taken |
| Each mission's proof is approved | Partial capture on the authorization, one per mission |
| Retries | `PayPal-Request-Id` idempotency keys, so a retry never double-charges |
| Unused budget | Authorization void |
| Operator is paid | Payouts API, one item per operator |

## AI agents (MCP)

SIDEQUEST exposes an [MCP](https://modelcontextprotocol.io) server at `/api/mcp` (Streamable HTTP). An agent authenticates with `Authorization: Bearer <agent key>` and acts for its accountable principal (in the demo, "Demo Brand Marketing Agent" for Demo Brand Co.).

| Tool | What it does |
|---|---|
| `get_spending_policy` | Limits, what's committed today, allowed categories and region |
| `list_locations` | Locations with permission on file |
| `create_mission_objective` | Plain-English request + budget → Claude plan → policy check. Over-limit or prohibited requests are refused with reasons |
| `get_mission_status` | Missions, operators, proof reviews and PayPal IDs for one objective |
| `list_my_objectives` | The agent's recent objectives |
| `approve_mission` | Refused unless the policy allows releasing payment (the demo policy doesn't) |

The demo agent's policy: $100/day, $40 per mission, RECON and SCOUT only, principal approval above $25, no self-publishing, no payment release. The agent has no tool that can change its own policy. Every plan still needs the human principal to approve the PayPal hold.

Connect Claude Code to it:

```bash
claude mcp add --transport http sidequest https://<host>/api/mcp --header "Authorization: Bearer <agent key>"
```

## Run locally

Requirements: Node 20.9+, a PayPal developer account (sandbox), a Postgres database (Supabase free tier works).

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run db:migrate           # creates tables and loads demo seed data
npm run dev                  # http://localhost:3000
```

Useful checks:

```bash
npm run db:validate                                   # schema + seed in an embedded Postgres, no DB needed
python3 scripts/paypal_sandbox_check.py token         # PayPal credentials + Payouts scope
python3 scripts/paypal_sandbox_check.py payouts       # sandbox payouts to two operators
```

## Judge testing

A hosted demo URL, test personas, and sandbox buyer credentials will be listed here before submission.

## License

[MIT](LICENSE)
