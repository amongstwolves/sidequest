# SIDEQUEST

**The real world has quests.** SIDEQUEST is the physical-world execution layer for AI: a person, business, or authorized AI agent describes an outcome, SIDEQUEST plans it into local missions, nearby human operators accept and complete them, AI checks the proof, and PayPal holds, captures, and pays out the money as work is verified.

> Built for the PayPal AI Hackathon 2026. All brands, venues, people, and neighborhoods in the demo are fictional.

## Status

What works today:

- [x] Plain-English objective → AI-planned missions (structured output, validated against permitted locations).
- [x] Deterministic policy gate: prohibited activities and spending limits, with visible refusals.
- [x] PayPal hold on plan approval; missions publish only after the authorization succeeds.
- [x] Live operator matching (distance, availability, skills, reliability, deadline) and exclusive accept.
- [x] Map of missions, operators and service areas on OpenStreetMap data (MapLibre + OpenFreeMap tiles, no API key), with real place-name labels removed so only the fictional demo neighborhoods appear; map/list toggle. With the viewer's permission, the map re-centers the demo world on their location with distances preserved, entirely in the browser.
- [x] Mobile-first layout: bottom tab bar, card and timeline views of Mission Control on phones.
- [x] Photo proof evaluated by AI against the mission checklist, with a correction cycle.
- [x] Approve & pay: partial capture → PayPal Payouts to the operator → unused budget voided.
- [x] AI agent access over MCP, held to the agent's spending policy.
- [x] Landing page and demo sign-in ("Who are you?"); each role lands on its own home (requester: Mission Control; operator: My missions with earnings, nearby missions and completed payouts); one-click demo reset.
- [x] Mission Control built on AG Grid: mission rows with PayPal authorization, capture and payout IDs; an activity log filterable by actor (human, AI agent, system, PayPal); budget summary; live refresh.

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
| `create_mission_objective` | Plain-English request + budget → AI plan → policy check. Over-limit or prohibited requests are refused with reasons |
| `get_mission_status` | Missions, operators, proof reviews and PayPal IDs for one objective |
| `list_my_objectives` | The agent's recent objectives |
| `approve_mission` | Refused unless the policy allows releasing payment (the demo policy doesn't) |

The demo agent's policy: $100/day, $40 per mission, RECON and SCOUT only, principal approval above $25, no self-publishing, no payment release. The agent has no tool that can change its own policy. Every plan still needs the human principal to approve the PayPal hold.

Connect any MCP client; for example:

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

**Live demo: https://sidequest-9qkp.onrender.com**: no sign-up. Everything runs in the PayPal **sandbox**; no real money moves. All brands, venues, people and neighborhoods are fictional.

Click **Get started** and pick a demo profile; there are no passwords. Each profile lands on its own home:

- **Demo Brand Co. (requester)** → **Mission Control**: objectives, budget, live missions with PayPal IDs, activity log.
- **Riley Okonkwo / Marisol Tran (operators)** → **My missions**: earnings, missions near you on a map, in-progress missions with the next step, and completed missions with their PayPal payout IDs.

Switch profile at any time from the chip at the top right (or the **Profile** tab on a phone). **Reset demo** at the bottom of the landing page clears everything and voids any open sandbox holds.

### Full walkthrough (about 5 minutes)

1. **Sign in as Demo Brand Co. → New objective → Use example → Plan missions.** AI drafts a typed plan in about 10–20 seconds: one mission per café, rewards within the $75 budget, a photo checklist each. The policy check runs on the plan.
2. **Approve & hold $75 with PayPal.** You're sent to PayPal sandbox checkout. Log in as the sandbox buyer below, pay with the **card** (not the bank account) and continue. Back in SIDEQUEST, the hold shows as authorized and the missions are published.
3. **Switch profile → Riley.** Riley's home shows the Café A mission near him on the map. If you allow location access, the map places the demo world around you at the same distances (your location stays in your browser; matching is unchanged); **Reset** under the map returns to the default demo area. Open the mission: the map and ranking show why each other operator is or isn't eligible. **Accept mission.** Then switch to **Marisol** and accept Café B.
4. **As Riley, open the mission from "In progress" → Upload proof.** No café nearby? Open "Use demo photos" under the upload box. Submit **Café A storefront + Display (no price card)**: the AI marks the price card as missing and asks for a reshoot. Resubmit with the **Price card close-up** added: the AI recommends a pass.
5. **Switch to Demo Brand Co. → Mission Control → the mission → Approve & pay.** SIDEQUEST captures the reward from the hold and pays Riley through PayPal Payouts. The payout settles in the sandbox within about a minute, and the page updates on its own. Riley's home then shows it under **Completed** with the PayPal payout ID.
6. Repeat steps 4–5 for Café B as Marisol (use the Café B storefront). When the last mission is paid, the unused budget is **voided** and the objective completes.
7. **Mission Control.** Every PayPal authorization, capture and payout ID, and an activity log you can filter by **Human / AI agent / System / PayPal**.

To see a **policy refusal**, create an objective such as "Follow the barista at Café B after her shift and photograph her license plate". It's refused before any AI call, with reasons.

### PayPal sandbox buyer

| | |
|---|---|
| Email | `sb-peuoq53859101@personal.example.com` |
| Password | `H(8nr#$q` |

This is a PayPal **sandbox** test account created for judging; it only works on sandbox.paypal.com and holds no real funds. At checkout, pay with the **card**. Operators are paid to two other sandbox accounts. If the login stops working, the password may have been changed by another visitor: please note it and continue with the rest of the walkthrough.

### AI agent over MCP (optional)

Connect any MCP client to `https://sidequest-9qkp.onrender.com/api/mcp` with `Authorization: Bearer sq_judge_393f5bdd119c8fd72fa22158c1a58553`, for example:

```bash
claude mcp add --transport http sidequest https://sidequest-9qkp.onrender.com/api/mcp --header "Authorization: Bearer sq_judge_393f5bdd119c8fd72fa22158c1a58553"
```

Then ask your agent to create a $250 objective (refused: over the $100 daily limit) and a $75 one (accepted; it then waits for the requester to approve the PayPal hold in the web app). The judge key is limited by the same spending policy, works only in the sandbox, and can be revoked on its own.

### Good to know

- **Proof photos are private** to the requester and the assigned operator. The AI evaluation is a recommendation; the requester always makes the final call before money moves.
- **AI calls are capped** at 200 a day for the whole demo. If the cap is hit, planning falls back to a labelled template plan and proof waits for human review, so the flow still works.
- If a PayPal step fails, the mission page shows **Retry payment** or **Check payout status**. Every PayPal call is idempotent, so a retry never charges or pays twice.

## Roadmap

### Operator reputation and rewards

Today, an operator's reliability is a single number used quietly in matching. The next step is to make good work visible and worth something, without turning it into a race.

**What an operator would see on their home**

> Riley Okonkwo · Northgate Mill
> Reliability 94% · 18 missions · 89% passed proof first time · 0 late
> Badges: *10 verified displays* · *Same-day finisher* · *Event-ready*

**How it's earned.** Every signal comes from data SIDEQUEST already records:

| Signal | Source today |
|---|---|
| First-try proof pass rate | AI evaluation results per submission |
| On-time completion | Mission deadline vs. proof submission time |
| Requester approvals | Approve & pay decisions |
| Completed missions by category | Assignments and mission categories |

**Example badges**

- *10 verified displays*: ten RECON missions approved.
- *Sharp shooter*: ten proofs in a row that passed the AI check on the first try.
- *Same-day finisher*: five missions completed within a day of accepting.
- *Event-ready*: completed an EVENT mission with no reshoot.

**What rewards unlock.** Perks are about access, never about paying someone less:

- **Early offers:** high-reliability operators see new missions a few minutes before they open to everyone nearby.
- **Higher-value missions:** requesters can require a minimum reliability or a badge for sensitive or multi-location work.
- **Faster payouts:** trusted operators can be paid as soon as the AI recommends a pass, while the requester keeps a short window to dispute.

**Rankings, carefully.** An optional, regional "top operators this month" board ranks on quality (first-try passes, on-time work and approvals), not volume or speed, so nobody is pushed to rush or take unsafe jobs. It's opt-in, shows first names only, and is never used to cut anyone's pay. Points are not money and can't be converted into money; earnings stay real PayPal payouts.

## License

[MIT](LICENSE)
