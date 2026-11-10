-- SIDEQUEST demo seed. Safe to re-run: it wipes all demo data first ("Reset demo").
-- Everything here is fictional: brand, people, venues, and neighborhoods.
-- Coordinates are placed around central Charlotte, NC for realistic distances.

truncate table
  notifications, audit_events, webhook_events, payment_transactions, payment_obligations,
  funding_authorizations, evidence_reviews, evidence, assignments, mission_dependencies,
  missions, mission_plans, objectives, locations, agent_policies, agent_principals,
  operators, organization_members, organizations, users
restart identity cascade;

-- People (fixed IDs so the demo role switcher can map personas to rows)
insert into users (id, email, display_name) values
  ('00000000-0000-4000-8000-000000000001', 'requester@demobrand.example', 'Demo Brand Co.'),
  ('00000000-0000-4000-8000-0000000000a1', 'operator-a@sidequest.example', 'Riley Okonkwo'),
  ('00000000-0000-4000-8000-0000000000b1', 'operator-b@sidequest.example', 'Marisol Tran'),
  ('00000000-0000-4000-8000-0000000000c1', 'operator-c@sidequest.example', 'Devin Achebe'),
  ('00000000-0000-4000-8000-0000000000c2', 'operator-d@sidequest.example', 'Priya Lindqvist'),
  ('00000000-0000-4000-8000-0000000000c3', 'operator-e@sidequest.example', 'Jonah Whitfield'),
  ('00000000-0000-4000-8000-0000000000c4', 'operator-f@sidequest.example', 'Amara Castellanos'),
  ('00000000-0000-4000-8000-0000000000c5', 'operator-g@sidequest.example', 'Theo Nakamura');

insert into organizations (id, name, owner_user_id) values
  ('00000000-0000-4000-8000-00000000f001', 'Demo Brand Co.', '00000000-0000-4000-8000-000000000001');

insert into organization_members (organization_id, user_id, role) values
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-000000000001', 'owner');

-- Operators. A and B are the demo personas; the rest exist so matching has real choices
-- (one is offline, one lacks photo capability, one is outside radius, two are viable runners-up).
insert into operators (user_id, persona_key, availability, neighborhood, lat, lng, radius_meters, capabilities, reliability_score) values
  ('00000000-0000-4000-8000-0000000000a1', 'operator_a', 'available', 'Northgate Mill',  35.2452, -80.8105, 4000, '{photo,retail_display}',        0.94),
  ('00000000-0000-4000-8000-0000000000b1', 'operator_b', 'available', 'Southline',       35.2105, -80.8588, 5000, '{photo,retail_display,event}',  0.91),
  ('00000000-0000-4000-8000-0000000000c1', null,         'available', 'Elm Plaza',       35.2201, -80.8126, 5000, '{photo}',                       0.78),
  ('00000000-0000-4000-8000-0000000000c2', null,         'offline',   'Northgate Mill',  35.2440, -80.8120, 4000, '{photo,retail_display}',        0.97),
  ('00000000-0000-4000-8000-0000000000c3', null,         'available', 'Southline',       35.2098, -80.8601, 3000, '{assist}',                      0.88),
  ('00000000-0000-4000-8000-0000000000c4', null,         'available', 'Riverside Yard',  35.1590, -80.9050, 3000, '{photo,retail_display}',        0.90),
  ('00000000-0000-4000-8000-0000000000c5', null,         'busy',      'Old Depot',       35.2290, -80.8460, 6000, '{photo,retail_display,courier}', 0.85);

-- Fictional venues (permission for the demo is assumed and recorded)
insert into locations (id, name, neighborhood, address_label, lat, lng, permission_note) values
  ('cafe_demo_a', 'Café A', 'Northgate Mill', '100 Fictional Mill Way', 35.2470, -80.8070, 'Owner approved exterior and counter-display photos for Demo Brand Co. campaign.'),
  ('cafe_demo_b', 'Café B', 'Southline',      '200 Example Line Ave',   35.2080, -80.8610, 'Owner approved exterior and counter-display photos for Demo Brand Co. campaign.'),
  ('cafe_demo_c', 'Café C', 'Elm Plaza',      '300 Sample Elm St',      35.2215, -80.8140, 'Owner approved exterior photos only.');

-- The brand's AI marketing agent and its spending policy (spec Section 9)
insert into agent_principals (id, name, principal_user_id, organization_id, status) values
  ('00000000-0000-4000-8000-00000000a6e1', 'Demo Brand Marketing Agent',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000f001', 'active');

insert into agent_policies (agent_id, currency, daily_limit_minor, per_mission_limit_minor, allowed_categories,
                            allowed_region, requires_human_approval_above_minor, auto_publish, auto_release_payment) values
  ('00000000-0000-4000-8000-00000000a6e1', 'USD', 10000, 4000, '{RECON,SCOUT}', 'charlotte_demo', 2500, false, false);

insert into audit_events (actor_type, actor_id, action, resource_type, resource_id, metadata) values
  ('system', 'seed', 'demo.reset', 'system', 'demo', '{"note": "Demo data loaded"}');
