# SIDEQUEST
## Comprehensive Product Requirements & Technical Design Specification

**Version:** 1.1  
**Status:** Proposed — Hackathon MVP (revised against official rules)  
**Date:** November 7, 2026  
**Target event:** PayPal AI Hackathon 2026  
**Target submission:** November 12, 2026, 12:00 PM PT / 3:00 PM ET (hard deadline)  
**Judging period:** December 1–15, 2026 (hosted demo must stay live through Dec 15)  
**Product category:** Agentic commerce / Hyperlocal marketplace / Human-in-the-loop AI infrastructure  
**Initial market:** Charlotte, North Carolina (simulated)  
**Initial currency:** USD  
**Tagline:** *The real world has quests.*  
**Positioning:** *The physical-world execution layer for AI.*

---

## Changes in v1.1

- Removed all references to third-party fictional works, brands, and real business names. SIDEQUEST is an original concept; all demo locations, brands, and people are fictional.
- Payment flow is now PayPal-native end to end: authorize at plan approval → capture on verified completion → real sandbox payout to operators (Payouts API or Hyperwallet). Simulated payout is a last-resort fallback only.
- External AI agent access via MCP moved from P2 to P0 and now opens the demo.
- Hosted demo (Render), role switcher, and one-click demo reset moved to P0 to satisfy the judge-testing requirement.
- Requester Mission Control built on AG Grid (sponsor prize eligibility).
- Scope cuts: PostGIS → in-app distance calculation; durable queue → Postgres state machine; organizations/RBAC deferred.
- Added named target audience (Section 2.1), judging-criteria map (Section 30), and submission compliance checklist (Section 31).

---

# 1. Executive Summary

SIDEQUEST is an AI-native, hyperlocal mission marketplace connecting three classes of requesters—individuals, businesses, and autonomous AI agents—with nearby human operators who can complete paid tasks in the physical world.

SIDEQUEST is designed as a lawful, permissioned marketplace emphasizing transparency, consent, safety, and reliable compensation. Its defining feature is that the requester can be an AI agent operating under a spending policy that the platform—not the model—enforces, with PayPal holding and releasing funds as work is verified.

Rather than requiring users to manually structure every job, find workers, coordinate assignments, review deliverables, and administer payments, SIDEQUEST accepts a high-level objective and uses agentic workflows to:

1. Interpret the desired outcome.
2. Evaluate safety and policy eligibility.
3. Decompose complex requests into executable missions.
4. Estimate effort, rewards, and deadlines.
5. Match nearby qualified operators.
6. Coordinate acceptance and execution.
7. Evaluate evidence against predefined acceptance criteria.
8. Request corrections or escalate uncertain outcomes.
9. Initiate authorized transactions through PayPal.
10. Produce a consolidated completion report.

**Canonical workflow:** Objective → Planning → Missions → Operators → Evidence → Approval → Payment → Result.

## 1.1 Value propositions

- **Operators:** Discover nearby, legitimate paid assignments and decide freely whether to accept them.
- **Individuals:** Describe the desired result, set a budget, and delegate coordination.
- **Businesses:** Distribute bounded operational tasks across locations with auditable results.
- **AI developers:** Programmatically commission authorized physical-world actions through a structured interface.

## 1.2 Product principles

- Outcome-first interaction, not form-heavy manual dispatch.
- Human choice and meaningful informed consent.
- Constrained autonomy rather than unlimited agent authority.
- Clear compensation and measurable deliverables.
- Location relevance with privacy minimization.
- Safety policy enforced independently of LLM output.
- Inspectable agent actions and durable audit events.
- Financial truth sourced from the payment provider, not inferred from an LLM.
- Recoverable, idempotent workflows.

# 2. Problem and Opportunity

Small local tasks—authorized storefront photos, public information checks, setup help, approved deliveries, and other routine errands—often require coordination disproportionate to the task's value. Existing marketplaces solve portions of worker discovery, but requesters still spend time describing tasks, selecting workers, checking outcomes, and settling compensation.

AI agents can perform substantial digital work but cannot themselves take photographs at a venue, inspect a physical display, or carry out a local errand. SIDEQUEST supplies the missing operational layer: a permissioned system that turns an agent's objective into human-executed, compensated physical work.

**Hypothesis:** Narrow, low-risk, easily verified tasks can support an effective local marketplace when intelligent coordination reduces operational friction.

## 2.1 Initial audience: retail-execution verification

The first audience is consumer brands and their marketing teams (increasingly, their AI marketing agents) that need proof that in-store displays, signage, and promotional placements actually went up as contracted. Retail-execution auditing is an established, paid activity today, but it is coordinated manually: someone writes the brief, finds a local worker, checks the photos, and pays them. SIDEQUEST collapses that loop.

**Demo scenario:** A fictional brand ("Demo Brand Co.") runs a local campaign through an AI marketing agent. Before the agent releases the next tranche of ad spend, it needs verified photo proof that displays are installed at two fictional cafés ("Café A" and "Café B" in seeded, fictional Charlotte neighborhoods).

## 2.2 Differentiation

Crowdsourced audit apps and general task marketplaces already exist. SIDEQUEST differs on three points that existing approaches do not combine:

1. **Agent-native requesting.** An external AI agent commissions physical work through MCP tools under a server-enforced spending policy it cannot change.
2. **AI-verified proof.** Evidence is checked against a per-mission rubric, with automatic correction requests before a human approves.
3. **PayPal-native money flow.** Funds are authorized up front, captured only on verified completion, and paid out to operators through PayPal—so the money and the proof move together.

# 3. Personas and Roles

## 3.1 Individual requester

Can create objectives, review AI plans, authorize budgets, publish missions, monitor progress, inspect evidence, approve completion, initiate permitted payments, and dispute results.

## 3.2 Business requester

Has individual requester permissions plus organization-wide budgets, role-based approvals, recurring campaigns (post-MVP), multi-location plans, reporting, and authorized agent management.

## 3.3 Operator

Can discover eligible missions, control availability, inspect requirements, accept or decline, submit evidence, request clarification, withdraw under published rules, and view payment status. Operators cannot be assigned involuntarily.

## 3.4 AI requester

An authenticated software agent acting on behalf of an accountable person or organization. It can only invoke tools allowed by an explicit policy: task categories, regions, limits, publication rights, and payment approval thresholds. An AI agent is **not** itself a legally independent payer.

## 3.5 Platform administrator

Can review flagged tasks, suspend accounts or missions, investigate fraud, revoke agent access, inspect audit trails, and handle escalations. Sensitive administrative actions are logged.

# 4. Product Scope

## 4.1 Hackathon P0 (must ship)

1. **Hosted demo on Render** that stays live through December 15, with a **role switcher** (requester / operator A / operator B) and a **one-click demo reset**.
2. Seeded fictional Charlotte neighborhoods, mission locations, and operators.
3. **External AI agent requester via MCP** (`create_mission_objective`, `get_mission_status`, `approve_mission`, etc.), plus natural-language intake in the web UI.
4. Typed, structured AI plan generation with validation.
5. Deterministic safety and budget policy gate, including a **visible refusal of one over-limit agent request**.
6. Multi-location mission decomposition.
7. Location-aware eligibility and matching against seeded operators (genuine ranking, not prewired).
8. Atomic mission offer/acceptance state transitions.
9. Evidence upload and AI-assisted rubric evaluation with a correction cycle.
10. Human completion approval.
11. **PayPal-native money flow in sandbox:** Orders `AUTHORIZE` at plan approval → capture on approved completion → **real sandbox payout** to each operator (Payouts API; Hyperwallet if sandbox access is granted). All provider IDs displayed.
12. **Requester Mission Control built on AG Grid** (missions, operator states, payment events, audit log).
13. Parent-objective rollup, activity timeline, and final report.
14. Public repository with a detectable open-source license, README with sandbox credentials and test instructions, and an under-three-minute YouTube demo.

## 4.2 P1 (desirable before submission)

- Mission map and list toggle.
- Agent Console showing policies, budget, and recent activity (minimum version may live inside Mission Control).
- Payment webhook verification and reconciliation.
- Automated end-to-end tests.
- Generated client SDK for the agent API (APIMatic sponsor tooling, optional).

## 4.3 P2 (post-hackathon)

Real operator onboarding, identity verification, production marketplace money movement, organizations and role-based approvals, sophisticated fraud detection, dynamic pricing, multi-operator squads, recurring programs, reputations, additional cities, multi-currency, advanced support and dispute processes, PostGIS-scale geospatial search, durable workflow queue, realtime push updates.

## 4.4 Hackathon scope cuts (explicit)

| Spec element | Hackathon implementation |
|---|---|
| PostGIS geospatial queries | Haversine distance in application code over ~10 seeded operators |
| Durable workflow queue | Postgres-backed state machine with idempotent transitions |
| Organizations / RBAC | Single requester principal; schema left extensible |
| Realtime updates | Polling (2–3s) |
| Full webhook reconciliation | P1; synchronous provider status checks are the P0 source of truth |

## 4.5 Explicit exclusions

No real-money escrow claims, live payouts without proper access, prohibited delivery categories, covert surveillance, hazardous tasks, unlicensed professional services, unrestricted agent budgets, native mobile apps, or autonomous dispute adjudication.

# 5. Mission Taxonomy

| Category | Example | Scope notes |
|---|---|---|
| **RECON** | Photograph an authorized promotional display | Recommended MVP; no surveillance of people |
| **SCOUT** | Confirm a publicly visible sign is present | Public/authorized observation only |
| **COURIER** | Deliver an approved small item | Requires identity, recipient, custody controls; post-MVP |
| **ASSIST** | Arrange chairs for an event | Avoid hazardous or regulated work |
| **EVENT** | Photograph approved vendor booth setup | Require appropriate venue permission |
| **SQUAD** | Verify three permitted locations concurrently | Composite objective containing independently accepted sub-missions |

A mission has a clear objective, category, location, deadline, offered reward, necessary skills, evidence requirements, approval rule, and safety classification. Individual missions must be independently completable and independently compensated according to their agreement.

# 6. Domain Model

## 6.1 Objective

The high-level result requested by a person, organization, or authorized agent. Contains `id`, `requester_id`, optional `agent_id` and `organization_id`, `request_text`, `target_outcome`, `geo_scope`, `deadline`, `budget_minor`, `currency`, `status`, and timestamps.

## 6.2 Mission plan

An AI-generated, versioned proposal associated with an objective. Contains `plan_id`, `objective_id`, `version`, mission graph, estimated total compensation, dependencies, required evidence, risk results, assumptions, and approval state. A plan cannot create financial obligations until authorized.

## 6.3 Mission

One executable job with title, category, description, point location, service radius, deadline, fixed reward, requirements, acceptance rubric, state, assignment reference, and version.

## 6.4 Assignment

The voluntary operator-to-mission agreement, preserving accepted reward, requirements, status, acceptance, start, submission, completion timestamps, and withdrawal reason.

## 6.5 Evidence and review

Evidence stores private object references, content type, hashes, timestamps, and bounded metadata. Reviews store rubric findings, model version, recommendation, reviewer type, and any request for correction.

## 6.6 Payment obligation and transaction

An obligation links an approved assignment to payer, payee, amount, currency, and authorization state. Provider transaction records separately store PayPal order/capture or payout references, idempotency keys, provider state, and reconciliation events. A checkout capture is **not** an operator payout.

# 7. Lifecycle and State Machine

**Happy path:**

```text
DRAFT → VALIDATING → PLANNED → AWAITING_APPROVAL → PUBLISHED
      → OFFERED → ACCEPTED → IN_PROGRESS → EVIDENCE_SUBMITTED
      → UNDER_REVIEW → APPROVED → PAYMENT_PENDING → PAID → CLOSED
```

**Alternative states:** `REJECTED_POLICY`, `EXPIRED`, `CANCELLED`, `WITHDRAWN`, `REASSIGNMENT_REQUIRED`, `CHANGES_REQUESTED`, `DISPUTED`, `PAYMENT_FAILED`, `MANUAL_REVIEW`.

## 7.1 Transition guards

- Publish requires validated policy and approved plan.
- Offer requires an eligible mission and qualified operator.
- Accept requires an explicit operator action and atomic exclusivity check.
- Submit requires ownership of the active assignment.
- Approve requires authorized requester or delegated approval authority.
- Pay requires a valid approved obligation, spending permission, and unique idempotency key.
- `PAID` requires confirmed provider evidence, never a mere LLM assertion.
- Parent objective is complete only when all required child missions satisfy success conditions.

## 7.2 Invariants

1. Never pay one obligation twice.
2. Never assign an exclusive mission to two active operators.
3. Never silently change reward or scope after acceptance.
4. Never exceed approved overall or per-mission budget.
5. Never publish prohibited tasks.
6. Never accept an expired/cancelled mission.
7. Never show unconfirmed provider payment as completed.
8. Never permit arbitrary users to inspect evidence.
9. Never let an external agent amend its own spending policy.
10. Never make payment for completed independent work contingent on unrelated operators' performance without a pre-agreed condition.

# 8. Agentic Capabilities

Use **one orchestrator with typed tools and durable workflow states**, not a collection of unconstrained LLMs communicating freely. Logical agents represent bounded responsibilities.

## 8.1 Mission Genesis

**Purpose:** Turn natural-language intent into typed objectives and missions.

**Inputs:** Request text, location, deadline, budget, permitted categories, optional reference files.

**Outputs:** Structured objective, proposed child missions, reward estimates, evidence rubric, assumptions, clarification requirements, and warnings.

**Rules:** No fabricated location permissions, confirmed operator availability, addresses, or committed prices. The model proposes; validator and requester authorize.

## 8.2 Policy Guardian

**Purpose:** Evaluate activity safety and financial eligibility.

**Returns:** `ALLOW`, `ALLOW_WITH_CONDITIONS`, `REQUIRES_HUMAN_REVIEW`, or `REJECT` with reasons.

**Design:** Deterministic rules define authoritative prohibitions and spending caps; model classification supplements ambiguity and contextual risk review. Reject covert tracking, stalking, trespass, prohibited goods, impersonation, and hazardous or unlicensed work.

## 8.3 Decomposition Agent

**Purpose:** Map an objective to one or more independently executable child missions, optionally in parallel.

**Example:** Three authorized retail displays → three RECON tasks each with its own location, reward, deadline, and evidence criteria.

**Optimization:** Balance turnaround time, travel, capability fit, reward, and deadline risk within approved budgets and consent constraints. Output dependency DAG and cost summary.

## 8.4 Matching/Dispatch Agent

**Purpose:** Rank eligible nearby operators, issue bounded offers, and recommend reassignment if needed.

**Hard filters:** Availability, radius, mandatory skills, eligibility, suspension, active conflicts.

**Illustrative score:**

```text
score = 0.35 * proximity
      + 0.25 * availability
      + 0.20 * capability
      + 0.10 * reliability
      + 0.10 * deadline_fit
```

Features are normalized 0–1. Seeded data must be ranked with genuine algorithms, not prewired outcomes. Scores are adjustable and subject to future fairness review.

## 8.5 Coordination Agent

**Purpose:** Monitor accepted work through status events, deadlines, voluntary withdrawal, reviews, and dependencies.

**Allowed actions:** Send predefined reminders, request status, offer authorized replacement, escalate delays.

**Prohibited actions:** Reduce agreed pay, unilaterally expand scope, or force acceptance.

## 8.6 Proof Engine

**Purpose:** Compare evidence against an explicit acceptance rubric.

**Returns:** `PASS_RECOMMENDED`, `CHANGES_REQUESTED`, `INCONCLUSIVE`, `REVIEW_REQUIRED`, with requirement-level findings and explanation.

**Demo feature:** One image passes; another misses required signage and triggers a corrected photo request.

**Important:** Image content or geotags do not establish definitive authenticity, presence, provenance, or worker identity. Model assessment informs human approval and fraud checks; it cannot alone guarantee work was performed.

## 8.7 Payment Agent

**Purpose:** Verify authorization, invoke provider-backed transactions, reconcile status, and record audit evidence.

**Boundary:** Payment credentials and tools live solely on trusted backend services. Every operation checks user/agent authority, reward, budget, recipient, mission state, and idempotency independent of model recommendations.

# 9. AI Principal and Spending Policies

Every external agent is linked to an accountable individual or organization. It is authenticated through dedicated credentials and granted explicit scopes.

Example policy:

```json
{
  "agent_id": "agent_demo_001",
  "principal_id": "org_demo_001",
  "currency": "USD",
  "daily_limit_minor": 10000,
  "per_mission_limit_minor": 4000,
  "allowed_categories": ["RECON", "SCOUT"],
  "allowed_region": "charlotte_demo",
  "requires_human_approval_above_minor": 2500,
  "auto_publish": false,
  "auto_release_payment": false
}
```

Rules: No self-escalation of limits; expired credentials are denied; policy enforcement happens server-side; all tool actions are auditable; agents cannot claim a payout occurred without provider confirmation. Operators can identify the responsible requester and whether a mission was AI-created.

# 10. Payment and PayPal Integration

## 10.1 Financial truth model

Distinguish these four states:

1. Requester payment authorization.
2. Requester payment capture.
3. Platform's recorded compensation obligation to an operator.
4. Actual operator payment (or **explicit simulation** if payout capability unavailable).

These are separate events. Neither an authorization nor a platform database balance represents an escrow arrangement.

## 10.1a Hackathon money flow (P0)

```text
Plan approved      → POST /v2/checkout/orders (intent: AUTHORIZE, amount = approved mission total + platform fee)
Requester approves → buyer approves in PayPal sandbox checkout
                   → POST /v2/checkout/orders/{id}/authorize   (funds held; authorization ID stored)
Mission approved   → POST /v2/payments/authorizations/{id}/capture  (partial capture per mission)
Captured           → POST /v1/payments/payouts  (one item per operator, sender_item_id = obligation ID)
                     or Hyperwallet sandbox payment if access is granted
Payout confirmed   → GET payout batch/item status → mark PAID
Unused budget      → void remaining authorization
```

Each step is a separate, idempotent, audited event. The UI shows the real PayPal order, authorization, capture, and payout IDs at each stage. A simulated payout is used **only** if sandbox payout access cannot be obtained, and is labeled as simulated everywhere it appears.

**Day-one verification — DONE (Nov 7, 2026), 13/13 steps passed** via `scripts/paypal_sandbox_check.py`: OAuth with Payouts scope, AUTHORIZE order approved by sandbox buyer, $75 authorization, $30 and $35 partial captures, idempotent capture replay (same capture ID, no duplicate charge), void of remaining $10 (authorization → `VOIDED`), and Payouts batch to two operator sandbox accounts (`SUCCESS`). **Decision: PayPal Payouts API is the P0 operator payout path; no simulation needed.** Hyperwallet is optional. Card funding is used for buyer approval (bank funding may leave authorizations pending).

## 10.2 Payment adapter

```typescript
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
  capturePayment(input: CapturePaymentInput): Promise<PaymentResult>;
  getPaymentStatus(id: string): Promise<PaymentStatus>;
  createPayout?(input: PayoutInput): Promise<PayoutResult>;
}
```

## 10.3 Orders integration

PayPal sandbox Orders API endpoints:

- `POST /v2/checkout/orders`
- `POST /v2/checkout/orders/{id}/capture`

Payer must approve the order before capture. Record order ID, capture ID, amount, currency, timestamps, and provider status. Associate provider records to the objective and relevant payment records.

## 10.4 Payout capability

Operator payout is P0. Preferred order:

1. **Hyperwallet sandbox** — PayPal's payout platform for gig and marketplace workers; the closest real-world fit. Use if sandbox access is granted in time.
2. **PayPal Payouts API sandbox** — batch/item status tracking, `sender_item_id` tied to the obligation, and provider reconciliation. Recipients may be PayPal or Venmo sandbox accounts where supported.
3. **Labeled simulation** — fallback only, if neither path works by end of Nov 9.

**Never equate checkout capture with worker compensation.**

## 10.5 Webhooks

`POST /api/webhooks/paypal` must receive raw body, verify authenticity per provider requirements, deduplicate provider event IDs, persist processing state, update payment records transactionally, and safely trigger dependent workflow actions. Return appropriate responses and tolerate retries.

## 10.6 Idempotency

Create a unique financial operation key, e.g.:

```text
mission:{missionId}:obligation:{obligationId}:capture:v1
```

Store key and provider result. A retry first checks existing state and queries provider as needed. Enforce uniqueness at database level, and use provider-supported idempotency mechanisms where applicable.

## 10.7 Failure modes

- Pending provider outcome → display `PROCESSING`.
- Transient error → retry only when confirmed safe.
- Uncertain capture status → reconcile provider instead of repeating capture blindly.
- Declined/failed transaction → retain obligation, mark `PAYMENT_FAILED`, notify authorized parties.
- Reversal/refund → reflect actual provider event and separate operator entitlement evaluation.

## 10.8 Production caveat

An approved commercial marketplace involves seller/recipient onboarding, terms, disputes, tax obligations, and provider-supported funds flows. Sandbox success does not establish permission to deploy live marketplace payouts or claim escrow.

# 11. Frontend and Experience Design

## 11.1 Visual language

Original visual identity built around mission immediacy. Dark-first, clear monetary rewards, map/list discovery, sparse copy, bold state indicators, and distinctly labeled AI-created missions.

Suggested palette:

| Token | Hex |
|---|---|
| Main background | `#0C111B` |
| Primary surface | `#192536` |
| Secondary surface | `#24344B` |
| Accent | `#6EE7B7` |
| Primary text | `#FFFFFF` |
| Muted text | `#94A3B8` |
| Warning | `#F6C56D` |
| Error | `#F87171` |

## 11.2 Core routes

- `/discover` — operator map/list, filters, reward markers.
- `/missions/[id]` — detail, scope, deadline, proof checklist, accept/decline.
- `/objectives/new` — conversational request input and constraints.
- `/objectives/[id]/plan` — AI plan, decomposition, compensation, approval.
- `/objectives/[id]` — requester Mission Control and statuses.
- `/operator/assignments/[id]` — in-progress task and evidence upload.
- `/agent-console` — agent principal, spending rules, audit activity.
- `/wallet` — clear real vs simulated payment statuses.

## 11.3 Screen requirements

**Discover:** Region, map/list toggle, mission pins, distance, category, payout, deadline, origin, filters.

**Mission Detail:** Description, verified/approved location scope, reward, evidence checklist, deadline, safety notes, accountable requester, accept action.

**Objective Creator:** Free-text prompt plus location, deadline, max budget, evidence, optional attachments.

**Plan Review:** Child missions, parallelism, total proposed compensation, unspent budget, warnings, assumptions, approve/revise controls.

**Mission Control:** Built on AG Grid. Mission rows with operator state, evidence/review status, reward, and PayPal IDs (authorization, capture, payout); a second grid for the audit/activity log with filtering by actor type (human, agent, system, provider). Budget summary above the grids.

**Demo controls (P0):** Persistent role switcher (Requester / Operator A / Operator B) and a "Reset demo" action that restores seed data and voids open sandbox authorizations.

**Operator Task:** Start, view objective, upload proof, request clarification, submit, withdraw, view review and payment outcome.

**Agent Console:** Principal, caps, categories, region, publication/payment approval thresholds, invocation timeline.

**Wallet:** Pending/approved/processing/confirmed/failed with conspicuous sandbox/simulation labeling.

## 11.4 Accessibility and privacy

Use semantic UI, keyboard navigation, sufficient contrast, non-color-only statuses, accessible upload feedback, and touch-friendly controls. Do not expose sensitive operator location unnecessarily; disclose exact locations only to authorized accepted operators where appropriate.

# 12. Functional Requirements and Acceptance Tests

| ID | Requirement | Minimum acceptance condition |
|---|---|---|
| FR-001 | Roles and permissions | One account can request and operate; server enforces rights |
| FR-002 | Natural-language intake | Persisted objective, typed valid plan or clear error |
| FR-003 | AI planning | Every child mission has reward, deadline, evidence, and category |
| FR-004 | Decomposition | Two-location request produces two linked missions |
| FR-005 | Matching | Ineligible operators filtered; distance and availability affect rank |
| FR-006 | Accept | Atomic exclusivity; competing acceptance receives conflict |
| FR-007 | Evidence | Files validated, private, associated with active assignment |
| FR-008 | Review | Rubric-level findings and corrective request for incomplete proof |
| FR-009 | Human approval | Only authorized requester can approve financial release |
| FR-010 | PayPal | Genuine supported sandbox transaction with reference and accurate status |
| FR-011 | Objective rollup | Partial vs full completion, budget and evidence aggregated |
| FR-012 | Audit | Consequential human/agent/financial actions logged |
| FR-013 | Spending policy | Out-of-limit attempts denied by backend |
| FR-014 | Status updates | User sees state changes; polling acceptable MVP fallback |
| FR-015 | Search | Filter by category, radius, reward, and availability |
| FR-016 | Recovery | Retry/restart cannot duplicate assignment or payment |

# 13. Database Schema

**Recommended:** PostgreSQL via Supabase, UUID PKs, UTC timestamps, money in integer minor units. Locations stored as lat/lng numeric columns for the hackathon (PostGIS is post-MVP). `organizations` and `organization_members` are created but unused in the demo.

| Table | Primary fields |
|---|---|
| `users` | id, email, display_name, status, created_at |
| `organizations` | id, name, owner_user_id, billing_status |
| `organization_members` | id, organization_id, user_id, role |
| `operators` | user_id, availability, verification_state, location_point, radius_meters, capabilities, reliability_score |
| `agent_principals` | id, name, principal_user_id, organization_id, credential_reference, status |
| `agent_policies` | id, agent_id, limits, region, categories, approval_threshold, expiry |
| `objectives` | id, requester_id, agent_id, organization_id, request_text, geo_scope, budget_minor, deadline, state |
| `mission_plans` | id, objective_id, version, plan_json, estimated_cost_minor, risk, approval_state |
| `missions` | id, objective_id, plan_id, category, title, description, point, reward_minor, deadline, rubric_json, state, version |
| `mission_dependencies` | predecessor_id, successor_id, dependency_type |
| `assignments` | id, mission_id, operator_id, agreed_reward_minor, status, timing fields |
| `evidence` | id, assignment_id, storage_key, mime_type, file_hash, metadata_json, submitted_at |
| `evidence_reviews` | id, evidence_id, mission_id, model, rubric_version, result, findings_json |
| `payment_obligations` | id, assignment_id, payer_id, payee_id, amount_minor, currency, approval_state, status |
| `payment_transactions` | id, obligation_id, provider, operation, provider_order_id, provider_capture_id, provider_payout_id, idempotency_key, state |
| `webhook_events` | id, provider_event_id, event_type, processing_state, processed_at |
| `audit_events` | id, actor_type, actor_id, action, resource_type, resource_id, before_state, after_state, metadata, created_at |
| `notifications` | id, user_id, event_type, payload_json, read_at |

**Indexes/constraints:** mission `(status, deadline)`; assignments `(operator_id, status)`; unique active assignment per exclusive mission (partial unique index); unique idempotency keys; unique provider webhook event IDs; FKs and CHECK constraints for nonnegative money.

**Security:** Row-level policies for owned resources, service-role keys only on server, signed access to private evidence, short retention for precise location, no secret credentials in logs.

# 14. API Surface

Base `/api/v1`. All mutations authenticate, validate input, authorize, enforce state transitions, and emit audit events.

## Objectives

- `POST /objectives` — create draft.
- `GET /objectives/{id}` — detail and status.
- `POST /objectives/{id}/plan` — generate validated plan.
- `POST /objectives/{id}/approve` — approve plan with budget.
- `GET /objectives/{id}/report` — consolidated results.

## Missions

- `GET /missions?lat=&lng=&radius=&category=&minReward=&deadline=` — eligible listings.
- `GET /missions/{id}` — detail.
- `POST /missions/{id}/accept` — atomic acceptance.
- `POST /missions/{id}/start` — begin.
- `POST /missions/{id}/evidence` — upload/associate proof.
- `POST /missions/{id}/withdraw` — leave under agreed terms.
- `POST /missions/{id}/review` — authorized review.
- `POST /missions/{id}/approve` — approval.

## Agents

- `POST /agents` — registered agent identity.
- `GET /agents/{id}/policy` — read authorized policy.
- `PATCH /agents/{id}/policy` — human administrator only.
- `POST /agents/{id}/objectives` — agent-created objective.
- `GET /agents/{id}/activity` — audited actions.

## Payments

- `POST /payments/create-order`
- `POST /payments/capture-order`
- `POST /payments/{id}/execute`
- `GET /payments/{id}`
- `POST /webhooks/paypal`

Common error response:

```json
{
  "error": {
    "code": "MISSION_ALREADY_ASSIGNED",
    "message": "This mission is no longer available.",
    "retryable": false
  }
}
```

# 15. External Agent Protocol

Expose authenticated REST plus an **MCP server (P0)** that wraps the same endpoints. The MCP server is a thin adapter: every tool call goes through the same authentication, policy, and state-machine checks as a human action. The demo opens with an off-the-shelf MCP-capable AI client calling these tools.

Proposed tools:

- `create_mission_objective`
- `plan_mission`
- `publish_mission_plan`
- `list_active_missions`
- `get_mission_status`
- `get_mission_evidence`
- `request_evidence_review`
- `approve_mission`
- `request_payment`
- `get_objective_report`

Sample objective payload:

```json
{
  "objective": "Verify promotional displays at two cafes",
  "deadline": "2026-11-09T12:00:00-05:00",
  "max_budget": { "currency": "USD", "amount_minor": 7500 },
  "locations": [{ "location_id": "cafe_demo_a" }, { "location_id": "cafe_demo_b" }],
  "evidence": { "type": "photo", "count_per_location": 2 },
  "approval_policy": "requester_review"
}
```

Sample plan response:

```json
{
  "objective_id": "obj_demo_001",
  "status": "AWAITING_APPROVAL",
  "plan": {
    "mission_count": 2,
    "parallel_execution": true,
    "proposed_compensation_minor": 6500,
    "remaining_budget_minor": 1000
  }
}
```

Security: authenticated principal, scoped tools, no dynamic self-granted rights, rate limits, origin-independent server checks, no privileged instructions from mission/evidence content.

# 16. Suggested Technical Stack

| Layer | Selection |
|---|---|
| UI | Next.js / React / Tailwind / TypeScript |
| Data grids | AG Grid (Mission Control, audit log) |
| Map (P1) | MapLibre |
| Backend | Next.js route handlers, Zod |
| Agent interface | REST + MCP server (TypeScript MCP SDK) |
| Authentication | Supabase Auth, plus seeded demo personas behind the role switcher |
| Data | Supabase PostgreSQL |
| Storage | Private Supabase Storage |
| Status events | Polling |
| Agent planning | Tool-capable LLM with strict structured output |
| Proof evaluation | Multimodal model with rubric-specific schema |
| Workflow engine | Postgres state machine with idempotent transitions |
| Payment | PayPal REST sandbox (Orders authorize/capture, Payouts) with provider adapter; Hyperwallet if available |
| Hosting | Render (web service + MCP endpoint) + managed Supabase |

**Cost guardrails for the judging period:** per-session and daily caps on AI calls, a hard spending limit on the AI provider key, and rate limits on public endpoints, so the hosted demo survives through December 15.

**System layers:** Presentation → Application/state machine → Typed agent tools → Integrations → Persistence.

Avoid granting LLMs direct SQL or payment credentials. Agent proposals enter the same authorization and validation path as human actions.

# 17. Orchestration Reference Flow

```typescript
async function processObjective(objectiveId: string) {
  const objective = await loadObjective(objectiveId);
  const policy = await validateObjectivePolicy(objective);

  if (!policy.allowed) {
    return rejectOrEscalateObjective(objective, policy);
  }

  const plan = await generateMissionPlan(objective);
  validatePlanSchema(plan);
  validatePlanBudget(plan, objective.budgetMinor);
  await savePlan(plan);

  if (!(await isPlanAuthorized(plan))) {
    return markAwaitingApproval(plan);
  }

  const missions = await publishMissionsAtomically(plan);
  for (const mission of missions) {
    await enqueueOperatorMatching(mission.id);
  }

  return { objectiveId, missionIds: missions.map(m => m.id) };
}
```

**Events:** `objective.created`, `plan.generated`, `plan.approved`, `mission.published`, `mission.offered`, `assignment.accepted`, `assignment.started`, `evidence.submitted`, `review.completed`, `mission.approved`, `payment.requested`, `payment.confirmed`, `payment.failed`, `objective.completed`.

Store model/version, prompt-policy version, structured decision, tool invocations, validation outcomes, and correlation ID. Keep personal information out of unnecessary telemetry.

# 18. Security, Safety, and Compliance

## Threats

Fraudulent missions, unsafe tasks, fake evidence, stalking/surveillance, account takeovers, location leakage, prompt injection, fraudulent webhooks, duplicate spending, collusion, and unauthorized financial actions.

## Controls

- Deterministic restricted-category checks and human escalation.
- Requester accountability and operator-informed consent.
- No covert tracking, impersonation, trespass, prohibited goods, or regulated hazardous work in MVP.
- Private evidence and location data with least-privilege access.
- Rate limiting, authorization on every server mutation, secure credentials.
- Treat all user text, attachments, evidence OCR/visual text, and API results as untrusted data—not tool instructions.
- Independent financial guardrails regardless of model claims.
- Webhook authenticity validation and deduplication.
- Human dispute path and manual intervention.
- Retention/deletion controls; do not retain location indefinitely by default.
- Log administrative overrides.

# 19. Nonfunctional Requirements

Engineering targets (not yet measured):

- Standard API p95 < 500ms excluding external AI/payment calls.
- Seeded geospatial list query p95 < 1s.
- Planning target < 15s; evidence review target < 20s.
- Status visibility within ~2s with realtime support.
- Zero duplicated payments or exclusive assignments in automated tests.
- Safe recovery after model, network, provider, or worker process failure.

Observability: workflow latency, provider calls, policy rejection rate, matching rate, offer acceptance, evidence correction rate, final payment outcomes, reconciliation gaps, and exception counts.

# 20. Testing Plan

## Unit

Budget and currency integer arithmetic, policy enforcement, schema validation, matching score, geographic filters, mission transitions, authorization, idempotency key generation.

## Integration

Objective → plan → published missions → assignment → evidence → review → approval → PayPal provider record → parent report.

## Security

Fake user IDs, off-policy agent spending, modified browser reward, concurrent assignment acceptance, duplicate webhooks, prompt injection in an image, unauthorized evidence reads, expired credentials, cross-organization operations.

## E2E demo acceptance

1. External AI agent (via MCP) attempts an objective over its per-mission limit and is refused by the backend.
2. Agent submits a compliant two-café verification objective (fictional Café A and Café B).
3. Planner creates two missions with $30 and $35 rewards under a $75 cap.
4. Requester approves; PayPal sandbox order is authorized (funds held).
5. Matching ranks seeded qualified operators.
6. Two distinct operators accept; a competing acceptance receives a conflict.
7. Both submit photos.
8. One photo passes; the other fails a required visual criterion.
9. The second operator submits corrected proof, which passes.
10. Requester approves both missions; per-mission captures succeed.
11. Sandbox payouts are issued to both operators and confirmed by provider status.
12. Order, authorization, capture, and payout IDs are shown in Mission Control.
13. Remaining authorization is voided; report shows two completed missions and $10 unused.
14. "Reset demo" restores the seeded state.

# 21. Three-Minute Demo Storyboard

| Time | Scene | Core message |
|---|---|---|
| 0:00–0:15 | Problem: a brand's AI agent needs proof displays went up before releasing ad spend; AI can't walk into a café | Who it's for, why it matters |
| 0:15–0:35 | Agent calls SIDEQUEST over MCP; an over-limit request is refused, then a compliant one is accepted | Agent-native, policy enforced by the platform |
| 0:35–0:55 | Plan decomposes into two missions; requester approves; PayPal authorizes and holds funds | Real orchestration + PayPal-native escrow-style hold |
| 0:55–1:20 | Two operators see and accept missions on mobile; conflict on double-accept | Human consent, local mission economy |
| 1:20–1:50 | Photo proof: one passes, one is missing signage → correction → passes | AI verification |
| 1:50–2:25 | Approval → capture → payouts to both operators; real PayPal IDs in Mission Control | PayPal at the center of the flow |
| 2:25–2:50 | Final report and audit timeline; unused budget voided | Accountability |
| 2:50–2:59 | Tagline and vision | Physical-world execution layer for AI |

Closing line: **"Both locations verified. Two operators paid. Mission complete."** (Use only if real sandbox payouts occurred; otherwise: "Payment captured in sandbox; operator payouts simulated.")

Video rules: under 3:00, public on YouTube, no third-party trademarks, brand names, copyrighted music, or footage. Use only fictional brands/locations and royalty-free or original audio.

# 22. Implementation Schedule

| Date | Deliverables |
|---|---|
| **Nov 7** | **Verify PayPal sandbox:** Orders authorize/capture and Payouts working from a script; request Hyperwallet sandbox access. Repo + license, Next.js, Supabase schema, seed data, deploy skeleton to Render. |
| **Nov 8** | Objective intake, validated plan, decomposition, policy gate, matching, atomic accept. MCP server wrapping objective tools. |
| **Nov 9** | Mission execution, evidence storage, AI review/correction cycle, objective rollup. **Payout path decision deadline.** |
| **Nov 10** | Full PayPal flow wired into state machine (authorize → capture → payout → void), idempotency, provider status checks. |
| **Nov 11** | AG Grid Mission Control, role switcher, demo reset, cost guardrails, README/test instructions. **Feature freeze at end of day.** Record draft video. |
| **Nov 12** | Final e2e run on hosted build, final video to YouTube, Devpost submission **by 9:00 AM PT** (3 hours of buffer before the 12:00 PM PT deadline). |

**Scope freeze:** No new features on Nov 12. Submit even if P1 features are incomplete.

# 23. Repository Layout

```text
sidequest/
├── app/
│   ├── discover/
│   ├── missions/[id]/
│   ├── objectives/
│   ├── operator/
│   ├── agent-console/
│   ├── wallet/
│   └── api/v1/
├── components/
│   ├── mission/
│   ├── map/
│   ├── agent/
│   ├── payments/
│   └── ui/
├── lib/
│   ├── auth/
│   ├── agents/
│   │   ├── orchestrator.ts
│   │   ├── planner.ts
│   │   ├── policy.ts
│   │   ├── decomposer.ts
│   │   ├── matcher.ts
│   │   └── proof-engine.ts
│   ├── missions/
│   │   ├── state-machine.ts
│   │   ├── assignments.ts
│   │   └── repository.ts
│   ├── payments/
│   │   ├── provider.ts
│   │   ├── paypal.ts
│   │   └── reconciliation.ts
│   └── db/
├── mcp/
│   └── server.ts
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── architecture.md
│   ├── agent-protocol.md
│   ├── payments.md
│   ├── security.md
│   └── demo.md
├── .env.example
├── README.md
├── LICENSE
└── package.json
```

Example env names (never commit values):

```dotenv
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI_API_KEY=
AI_PLANNING_MODEL=
AI_VISION_MODEL=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_ENVIRONMENT=sandbox
HYPERWALLET_API_USERNAME=
HYPERWALLET_API_PASSWORD=
HYPERWALLET_PROGRAM_TOKEN=
MCP_AGENT_API_KEY=
AI_DAILY_CALL_LIMIT=
NEXT_PUBLIC_MAP_STYLE_URL=
APP_BASE_URL=
```

# 24. Metrics and Success Criteria

## Hackathon definition of success

- One natural-language objective becomes multiple validated missions.
- Genuine operator matching and atomic acceptance.
- At least one evidence correction cycle.
- Human approval before consequential financial action.
- Real PayPal sandbox payment with accurate status and reference.
- Auditable, coherent finished objective report.
- Setup instructions and concise public demo.

## Suggested internal quality targets

- ≥99% schema validity after bounded AI retry/validation.
- Zero unauthorized spend in policy tests.
- Zero duplicate assignment/payment executions in controlled tests.
- ≥95% workflow completion across deterministic seeded runs.
- Evidence-review accuracy measured on a labeled test set, not assumed.

## Future commercial KPIs

Mission completion rate, acceptance latency, median mission duration, dispute rate, local operator liquidity, operator hourly realized income, repeat requester rate, gross transaction volume, fees, cost to support, contribution margin, retention.

# 25. Commercial Strategy

Initial illustrative fees: 12% platform fee on a $40 operator reward = $4.80, giving requester $44.80 **before** payment-processing costs and applicable taxes. This is a modeling assumption, not current pricing or expected profitability.

Longer-term revenue: business subscriptions, recurring programs, organization-level agent controls, developer API usage, and integration support. Model marketplace liquidity, trust, payment and tax compliance, support cost, fraud, and customer acquisition before claiming viability.

# 26. Roadmap

**Phase 0 — Hackathon:** Seeded city, full mission flow, genuine sandbox transaction.

**Phase 1 — Private alpha:** One neighborhood, verified partners, few low-risk categories, manual support, approved production payment architecture.

**Phase 2 — Local marketplace:** Real location discovery, operator onboarding, scheduling, reputation, recurring task programs.

**Phase 3 — Agent-native platform:** External developer API/SDK, MCP tools, organization policies, advanced orchestration and authorized payouts.

**Phase 4 — Regional infrastructure:** Multiple markets, enterprise agreements, analytics, routing, and service-level commitments.

# 27. Risks and Mitigations

| Risk | Priority | Mitigation |
|---|---|---|
| Lack of matching supply/demand | High | Launch in concentrated local clusters with repeat business buyers |
| Fraudulent evidence | High | Rubric checks, human approval, flags, dispute path |
| Unsafe mission creation | Critical | Bounded categories, deterministic policy, review |
| Unauthorized agent spending | Critical | Authenticated principals, server-side policy caps |
| PayPal capability limitations | High | Verify Payouts on day one; Hyperwallet requested in parallel; labeled simulation only as last resort |
| Hosted demo breaks or runs out of AI budget during judging (Dec 1–15) | High | Cost caps, rate limits, demo reset, uptime check before Dec 1 |
| Name conflict with an existing product | Medium | Run a name/trademark search before submission; keep a fallback name ready |
| Duplicate payment | Critical | DB unique operation key, provider idempotency, reconciliation |
| Hallucinated missions/locations | High | Structured validation and user approval |
| Privacy leakage | Critical | Restrict exact location and evidence; retention limits |
| Regulatory uncertainty | High | Professional review before real marketplace launch |
| Hackathon scope creep | High | Prioritize P0 vertical slice and submission readiness |

# 28. Definition of Done

- [ ] Hosted responsive application on Render, live through Dec 15, with role switcher and demo reset.
- [ ] Seeded requester, two operators, and safe fictional locations.
- [ ] External AI agent creates an objective via MCP; one over-limit request refused.
- [ ] Objective creation via natural language.
- [ ] Typed, budget-safe two-mission AI plan.
- [ ] Human plan approval and publication.
- [ ] Deterministic matching against geographic operator inventory.
- [ ] Independent operator acceptance.
- [ ] Private evidence upload.
- [ ] Successful AI evidence assessment plus correction request.
- [ ] Authorized completion approval.
- [ ] PayPal sandbox authorize → capture → operator payout, with stored provider identifiers.
- [ ] Clear status for real versus simulated money movement.
- [ ] AG Grid Mission Control and audit log.
- [ ] Objective rollup and audit timeline.
- [ ] No double assignment/payment in test cases.
- [ ] Public repository with installation instructions, sandbox credentials, and license visible in the About section.
- [ ] Under-three-minute public demonstration.
- [ ] Devpost submission before deadline.

# 29. Final Product Vision

SIDEQUEST begins as a mission-based hyperlocal marketplace. Its larger opportunity is to become a structured execution interface for systems that understand what needs to happen but cannot physically do it.

**Intent Layer:** A human, business, or authorized agent describes an outcome.

**Execution Layer:** SIDEQUEST plans, dispatches, coordinates, and reviews permitted real-world work.

**Commerce Layer:** PayPal supports appropriate authorized financial transactions with auditable outcomes.

The goal is to move from **“I need something done nearby”** to **“Mission planned. Operator accepted. Evidence reviewed. Payment confirmed.”**

**SIDEQUEST — The real world has quests.**

# 30. Judging Criteria Map

Stage One is pass/fail: the project must fit the theme and make PayPal integration central. Stage Two scores five equally weighted criteria; ties break on Technological Implementation first. Judges may score from the video and description alone, so every point below must be visible in the video and stated in the README.

| Criterion | What judges look for | How SIDEQUEST answers it |
|---|---|---|
| **Technological Implementation** (tie-breaker) | Thorough, skillful use of PayPal + AI; non-trivial, working build | Orders authorize/capture, partial captures, Payouts/Hyperwallet, voids, idempotency; structured-output planning, multimodal rubric review, MCP server, server-enforced agent policy |
| **Design** | Complete, coherent product, not a proof of concept | Polished operator and requester flows, AG Grid Mission Control, role switcher, clear real-vs-simulated money states |
| **Potential Impact** | Specific case for a real problem and real audience, supported by the demo | Retail-execution verification for consumer brands (Section 2.1); demo shows the full brief → proof → payment loop |
| **Innovation / Idea** | Creative, different from existing concepts | Agent-native requester + AI-verified proof + PayPal-held funds released on verification (Section 2.2) |
| **Presentation** | Video shows end-to-end working flow; clear problem, audience, and value | Storyboard in Section 21, opening with the agent and closing with real payout IDs |

## 30.1 Sponsor prizes

A project may win one Grand Prize (or Honorable Mention) **plus** one Sponsor Prize.

| Sponsor | Use in SIDEQUEST | Priority |
|---|---|---|
| AG Grid | Mission Control and audit log grids | P0, largest sponsor prize pool |
| Render | Hosting for web app and MCP endpoint | P0, needed anyway |
| APIMatic | Generated SDK for the agent REST API | P1, optional |

# 31. Submission Compliance Checklist

- [ ] Project integrates the PayPal developer platform (sandbox) and an AI model; PayPal is central to the flow.
- [ ] Text description explains features and functionality and maps them to the judging criteria.
- [ ] Working demo judges can use: hosted URL on Render **and** complete setup/run instructions in the README.
- [ ] README includes test personas, PayPal sandbox buyer login, and any credentials needed to test; no live secrets.
- [ ] Public GitHub repository with all source, assets, and instructions.
- [ ] Open-source license file, detectable and shown in the repository's About section.
- [ ] Demo video under 3:00, public on YouTube, showing the project running on its target devices.
- [ ] No third-party trademarks, brand names, real business names, references to fictional works, or copyrighted music/material in the app, repo, or video.
- [ ] All submission materials in English.
- [ ] Hosted demo free to use and kept running until the end of judging (Dec 15, 8:00 AM PT).
- [ ] Submitted on Devpost before Nov 12, 12:00 PM PT (target 9:00 AM PT).

---

# Appendix A: Official References

- [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/)
- [PayPal AI Hackathon Rules](https://paypalaihackathon.devpost.com/rules)
- [PayPal Developer](https://developer.paypal.com/)
- [PayPal Orders API](https://developer.paypal.com/api/rest/integration/orders-api/)
- [PayPal Payouts](https://developer.paypal.com/docs/payouts/)
- [Hyperwallet](https://www.hyperwallet.com/)
- [PayPal Multiparty Platform](https://developer.paypal.com/platforms/overview/)
- [PayPal Webhooks](https://developer.paypal.com/api/rest/webhooks/)
- [Supabase Documentation](https://supabase.com/docs)
- [AG Grid](https://www.ag-grid.com/)
- [Render](https://render.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MapLibre](https://maplibre.org/)

# Appendix B: Scope-Control Rule

Defer anything that does not directly improve:

1. Genuine AI autonomy.
2. Meaningful PayPal integration.
3. A complete mission lifecycle.
4. Clarity of the three-minute demo.
5. Mandatory submission requirements.

**Build the smallest complete version of the largest compelling idea.**
