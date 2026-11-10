# SIDEQUEST

**The real world has quests.** SIDEQUEST is the physical-world execution layer for AI: a person, business, or authorized AI agent describes an outcome, SIDEQUEST plans it into local missions, nearby human operators accept and complete them, AI checks the proof, and PayPal holds, captures, and pays out the money as work is verified.

> Built for the PayPal AI Hackathon 2026. All brands, venues, people, and neighborhoods in the demo are fictional.

## Status

Early build. What works today:

- [x] PayPal sandbox money flow verified end to end (`scripts/paypal_sandbox_check.py`): authorize → partial captures → idempotent replay → void → Payouts to two operators.
- [x] Next.js app shell with demo role switcher (Requester / Operator A / Operator B).
- [x] Postgres schema and fictional seed data, validated in an embedded database.
- [ ] Objective intake, AI planning, matching, evidence review, Mission Control, MCP agent access (in progress).

## How PayPal is used

| Step | PayPal API |
|---|---|
| Requester approves the plan | Orders v2 `intent: AUTHORIZE` — funds are held, not taken |
| Each mission's proof is approved | Partial capture on the authorization, one per mission |
| Retries | `PayPal-Request-Id` idempotency keys, so a retry never double-charges |
| Unused budget | Authorization void |
| Operator is paid | Payouts API, one item per operator |

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
