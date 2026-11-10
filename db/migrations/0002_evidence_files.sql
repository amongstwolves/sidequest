-- Proof photos for the hackathon build are stored in Postgres (bytea) behind an authorized
-- route instead of a separate object store; evidence.storage_key = 'db:<evidence id>'.
-- Photos are downscaled in the browser (max 1600px JPEG), so rows stay small.
create table evidence_files (
  evidence_id  uuid primary key references evidence(id) on delete cascade,
  bytes        bytea not null,
  byte_size    integer not null check (byte_size > 0 and byte_size <= 4194304)
);

-- One AI review covers a whole submission (all photos uploaded together).
alter table evidence add column submission_no integer not null default 1;
alter table evidence_reviews add column submission_no integer not null default 1;
alter table evidence_reviews add column summary text;
alter table evidence_reviews add column operator_message text;
