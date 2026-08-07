-- Phase 1 goals 2 & 3 only (intake logic + video-gen workflow). Watch-tracking,
-- notes, and QR/regimen-picker tables are out of scope for this round (goals
-- 4-6, not assigned) and deliberately not added here to avoid scope creep.
--
-- NOT YET APPLIED to a live Supabase project — no credentials available to
-- provision/verify one this round. Written to the decided stack (Postgres +
-- RLS) so it's ready to run via `supabase db push` / the SQL editor once a
-- project exists.

create table if not exists intake_responses (
  id uuid primary key default gen_random_uuid(),
  regimen_id text not null,
  education_level text not null check (education_level in ('basic', 'some_college', 'advanced')),
  topics text[] not null,
  depth_preference text not null check (depth_preference in ('short', 'detailed')),
  follow_up_questions text[],
  created_at timestamptz not null default now()
);

create table if not exists generated_videos (
  id uuid primary key default gen_random_uuid(),
  intake_response_id uuid references intake_responses (id),
  regimen_id text not null,
  storage_url text not null,
  selection_method text not null check (selection_method in ('gemini', 'fallback')),
  entry_ids text[] not null,
  total_seconds numeric not null,
  created_at timestamptz not null default now()
);

alter table intake_responses enable row level security;
alter table generated_videos enable row level security;

-- v1 has no patient auth/identity (self-selected regimen, no EHR integration
-- per design doc) — service-role key does all writes server-side. RLS is
-- enabled with no public policies so anon/authenticated clients get nothing
-- by default; revisit when Phase 3 defines the real access model.
