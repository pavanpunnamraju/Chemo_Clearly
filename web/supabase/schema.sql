-- Auto-generated from the live Supabase project via `npm run sync:schema`.
-- Do not hand-edit — change the DB (SQL editor / migration), then re-run the sync.

create table if not exists generated_videos (
  id uuid not null default gen_random_uuid(),
  intake_response_id uuid,
  regimen_id text not null,
  storage_url text not null,
  selection_method text not null,
  entry_ids text[] not null,
  total_seconds numeric not null,
  created_at timestamp with time zone not null default now(),
  filter_hash text not null,
  constraint generated_videos_intake_response_id_fkey FOREIGN KEY (intake_response_id) REFERENCES intake_responses(id),
  constraint generated_videos_pkey PRIMARY KEY (id),
  constraint generated_videos_regimen_filter_hash_key UNIQUE (regimen_id, filter_hash),
  constraint generated_videos_selection_method_check CHECK ((selection_method = ANY (ARRAY['gemini'::text, 'fallback'::text])))
);

create table if not exists intake_responses (
  id uuid not null default gen_random_uuid(),
  regimen_id text not null,
  education_level text not null,
  topics text[] not null,
  depth_preference text not null,
  follow_up_questions text[],
  created_at timestamp with time zone not null default now(),
  voice_tone text not null default 'neutral'::text,
  constraint intake_responses_depth_preference_check CHECK ((depth_preference = ANY (ARRAY['short'::text, 'detailed'::text]))),
  constraint intake_responses_education_level_check CHECK ((education_level = ANY (ARRAY['basic'::text, 'some_college'::text, 'advanced'::text]))),
  constraint intake_responses_pkey PRIMARY KEY (id),
  constraint intake_responses_voice_tone_check CHECK ((voice_tone = ANY (ARRAY['neutral'::text, 'friendly'::text, 'hopeful'::text])))
);

create table if not exists notes (
  id uuid not null default gen_random_uuid(),
  patient_id uuid not null,
  regimen_id text not null,
  question_text text not null,
  created_at timestamp with time zone not null default now(),
  constraint notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES auth.users(id),
  constraint notes_pkey PRIMARY KEY (id)
);

create table if not exists watch_status (
  id uuid not null default gen_random_uuid(),
  patient_id uuid not null,
  regimen_id text not null,
  status text not null default 'not_started'::text,
  updated_at timestamp with time zone not null default now(),
  constraint watch_status_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES auth.users(id),
  constraint watch_status_patient_regimen_key UNIQUE (patient_id, regimen_id),
  constraint watch_status_pkey PRIMARY KEY (id),
  constraint watch_status_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'done'::text])))
);

alter table generated_videos enable row level security;
alter table intake_responses enable row level security;
alter table notes enable row level security;
alter table watch_status enable row level security;

create policy notes_insert_own on notes for INSERT to authenticated with check ((patient_id = auth.uid()));
create policy notes_select_own on notes for SELECT to authenticated using ((patient_id = auth.uid()));

create policy watch_status_update_own on watch_status for UPDATE to authenticated using ((patient_id = auth.uid())) with check ((patient_id = auth.uid()));
create policy watch_status_insert_own on watch_status for INSERT to authenticated with check ((patient_id = auth.uid()));
create policy watch_status_select_own on watch_status for SELECT to authenticated using ((patient_id = auth.uid()));
