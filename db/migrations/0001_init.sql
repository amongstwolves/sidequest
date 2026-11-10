-- SIDEQUEST initial schema (spec v1.1, Section 13).
-- Money is always integer minor units (cents). Timestamps are timestamptz (UTC).

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  display_name  text not null,
  status        text not null default 'active' check (status in ('active', 'suspended')),
  created_at    timestamptz not null default now()
);

create table organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_user_id   uuid not null references users(id),
  billing_status  text not null default 'demo',
  created_at      timestamptz not null default now()
);

create table organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  role             text not null check (role in ('owner', 'approver', 'member')),
  unique (organization_id, user_id)
);

create table operators (
  user_id             uuid primary key references users(id) on delete cascade,
  persona_key         text unique,
  availability        text not null default 'available' check (availability in ('available', 'busy', 'offline')),
  verification_state  text not null default 'demo_verified',
  neighborhood        text not null,
  lat                 double precision not null check (lat between -90 and 90),
  lng                 double precision not null check (lng between -180 and 180),
  radius_meters       integer not null check (radius_meters > 0),
  capabilities        text[] not null default '{}',
  reliability_score   numeric(3,2) not null default 0.80 check (reliability_score between 0 and 1)
);

create table agent_principals (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  principal_user_id  uuid not null references users(id),
  organization_id    uuid references organizations(id),
  credential_hash    text,
  status             text not null default 'active' check (status in ('active', 'revoked')),
  created_at         timestamptz not null default now()
);

create table agent_policies (
  id                                   uuid primary key default gen_random_uuid(),
  agent_id                             uuid not null references agent_principals(id) on delete cascade,
  currency                             char(3) not null default 'USD',
  daily_limit_minor                    integer not null check (daily_limit_minor >= 0),
  per_mission_limit_minor              integer not null check (per_mission_limit_minor >= 0),
  allowed_categories                   text[] not null,
  allowed_region                       text not null,
  requires_human_approval_above_minor  integer not null check (requires_human_approval_above_minor >= 0),
  auto_publish                         boolean not null default false,
  auto_release_payment                 boolean not null default false,
  expires_at                           timestamptz,
  created_at                           timestamptz not null default now()
);

-- Fictional venues that have granted permission for the demo.
create table locations (
  id               text primary key,
  name             text not null,
  neighborhood     text not null,
  address_label    text not null,
  lat              double precision not null,
  lng              double precision not null,
  permission_note  text not null
);

create table objectives (
  id               uuid primary key default gen_random_uuid(),
  requester_id     uuid not null references users(id),
  agent_id         uuid references agent_principals(id),
  organization_id  uuid references organizations(id),
  request_text     text not null,
  target_outcome   text,
  geo_scope        text,
  deadline         timestamptz,
  budget_minor     integer not null check (budget_minor > 0),
  currency         char(3) not null default 'USD',
  state            text not null default 'DRAFT' check (state in (
                     'DRAFT', 'VALIDATING', 'PLANNED', 'AWAITING_APPROVAL', 'PUBLISHED', 'IN_PROGRESS',
                     'COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED_POLICY', 'CANCELLED', 'EXPIRED')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table mission_plans (
  id                    uuid primary key default gen_random_uuid(),
  objective_id          uuid not null references objectives(id) on delete cascade,
  version               integer not null check (version > 0),
  plan_json             jsonb not null,
  estimated_cost_minor  integer not null check (estimated_cost_minor >= 0),
  risk                  jsonb not null default '{}'::jsonb,
  model                 text,
  approval_state        text not null default 'PENDING' check (approval_state in ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  created_at            timestamptz not null default now(),
  unique (objective_id, version)
);

create table missions (
  id            uuid primary key default gen_random_uuid(),
  objective_id  uuid not null references objectives(id) on delete cascade,
  plan_id       uuid references mission_plans(id),
  category      text not null check (category in ('RECON', 'SCOUT', 'COURIER', 'ASSIST', 'EVENT')),
  title         text not null,
  description   text not null,
  location_id   text references locations(id),
  lat           double precision not null,
  lng           double precision not null,
  reward_minor  integer not null check (reward_minor > 0),
  currency      char(3) not null default 'USD',
  deadline      timestamptz not null,
  required_capabilities text[] not null default '{}',
  rubric_json   jsonb not null,
  state         text not null default 'DRAFT' check (state in (
                  'DRAFT', 'PUBLISHED', 'OFFERED', 'ACCEPTED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED',
                  'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED',
                  'EXPIRED', 'CANCELLED', 'REASSIGNMENT_REQUIRED', 'DISPUTED', 'PAYMENT_FAILED', 'MANUAL_REVIEW')),
  ai_created    boolean not null default true,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index missions_state_deadline on missions (state, deadline);
create index missions_objective on missions (objective_id);

create table mission_dependencies (
  predecessor_id   uuid not null references missions(id) on delete cascade,
  successor_id     uuid not null references missions(id) on delete cascade,
  dependency_type  text not null default 'finish_to_start',
  primary key (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create table assignments (
  id                   uuid primary key default gen_random_uuid(),
  mission_id           uuid not null references missions(id) on delete cascade,
  operator_id          uuid not null references operators(user_id),
  agreed_reward_minor  integer not null check (agreed_reward_minor > 0),
  status               text not null default 'ACCEPTED' check (status in (
                         'ACCEPTED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'CHANGES_REQUESTED',
                         'APPROVED', 'WITHDRAWN', 'CANCELLED')),
  accepted_at          timestamptz not null default now(),
  started_at           timestamptz,
  submitted_at         timestamptz,
  completed_at         timestamptz,
  withdrawal_reason    text
);
-- Invariant 2: never assign an exclusive mission to two active operators.
create unique index assignments_one_active_per_mission
  on assignments (mission_id) where status not in ('WITHDRAWN', 'CANCELLED');
create index assignments_operator_status on assignments (operator_id, status);

create table evidence (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references assignments(id) on delete cascade,
  storage_key    text not null,
  mime_type      text not null,
  file_hash      text not null,
  metadata_json  jsonb not null default '{}'::jsonb,
  submitted_at   timestamptz not null default now()
);

create table evidence_reviews (
  id              uuid primary key default gen_random_uuid(),
  evidence_id     uuid not null references evidence(id) on delete cascade,
  mission_id      uuid not null references missions(id) on delete cascade,
  reviewer_type   text not null check (reviewer_type in ('ai', 'human')),
  model           text,
  rubric_version  integer not null default 1,
  result          text not null check (result in ('PASS_RECOMMENDED', 'CHANGES_REQUESTED', 'INCONCLUSIVE', 'REVIEW_REQUIRED')),
  findings_json   jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- One PayPal authorization funds an objective; missions capture against it.
create table funding_authorizations (
  id                         uuid primary key default gen_random_uuid(),
  objective_id               uuid not null unique references objectives(id) on delete cascade,
  provider                   text not null default 'paypal',
  provider_order_id          text unique,
  provider_authorization_id  text unique,
  amount_minor               integer not null check (amount_minor > 0),
  captured_minor             integer not null default 0 check (captured_minor >= 0),
  currency                   char(3) not null default 'USD',
  state                      text not null default 'CREATED' check (state in (
                               'CREATED', 'APPROVED', 'AUTHORIZED', 'PARTIALLY_CAPTURED', 'CAPTURED', 'VOIDED', 'FAILED')),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (captured_minor <= amount_minor)
);

create table payment_obligations (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null unique references assignments(id),
  payer_id        uuid not null references users(id),
  payee_id        uuid not null references users(id),
  amount_minor    integer not null check (amount_minor >= 0),
  currency        char(3) not null default 'USD',
  approval_state  text not null default 'PENDING' check (approval_state in ('PENDING', 'APPROVED')),
  status          text not null default 'PENDING' check (status in (
                    'PENDING', 'CAPTURED', 'PAYOUT_PENDING', 'PAID', 'PAYMENT_FAILED')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Every provider call, keyed by a unique idempotency key (invariant 1: never pay twice).
create table payment_transactions (
  id                         uuid primary key default gen_random_uuid(),
  funding_id                 uuid references funding_authorizations(id),
  obligation_id              uuid references payment_obligations(id),
  provider                   text not null default 'paypal',
  operation                  text not null check (operation in ('ORDER_CREATE', 'AUTHORIZE', 'CAPTURE', 'VOID', 'PAYOUT')),
  idempotency_key            text not null unique,
  amount_minor               integer check (amount_minor >= 0),
  provider_order_id          text,
  provider_authorization_id  text,
  provider_capture_id        text,
  provider_payout_batch_id   text,
  provider_payout_item_id    text,
  provider_debug_id          text,
  state                      text not null,
  raw                        jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null default 'paypal',
  provider_event_id  text not null unique,
  event_type         text not null,
  payload            jsonb not null,
  processing_state   text not null default 'RECEIVED' check (processing_state in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
  received_at        timestamptz not null default now(),
  processed_at       timestamptz
);

create table audit_events (
  id              bigint generated always as identity primary key,
  actor_type      text not null check (actor_type in ('human', 'agent', 'system', 'provider')),
  actor_id        text not null,
  action          text not null,
  resource_type   text not null,
  resource_id     text not null,
  before_state    text,
  after_state     text,
  metadata        jsonb not null default '{}'::jsonb,
  correlation_id  text,
  created_at      timestamptz not null default now()
);
create index audit_events_resource on audit_events (resource_type, resource_id);
create index audit_events_created on audit_events (created_at desc);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  event_type  text not null,
  payload     jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
