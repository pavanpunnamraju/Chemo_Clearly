# Backend Schema — Chemo Patient Education App

Every table, every row we store, and how auth works. Kept in sync with
`web/supabase/schema.sql` — this doc explains the *why* behind each table;
the SQL file is the source of truth for the actual DDL. No dead
tables/columns, no unused wrapper functions — if it's not in the SQL file and
wired to a real code path, it doesn't belong in either place.

Live Supabase project: provisioned, schema applied (verified via REST).

## Auth Model

- **Patients**: Supabase Auth, email + password. `auth.uid()` is the
  patient's identity everywhere below.
- **Care team (nurses)**: no Supabase account — single shared passcode
  checked server-side, shared across all nurses. All care-team-facing reads
  go through the service-role key server-side (bypasses RLS), same pattern
  as the existing pipeline writes in `lib/storage.ts` / `lib/supabase/client.ts`.
- **RLS**: patients are restricted to their own rows (`auth.uid() =
  patient_id`). No public/anon policies beyond that — anything the doctor's
  view needs goes through the service-role key, not client-side RLS.

## Tables

### `intake_responses`
One row per intake form submission.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `patient_id` | uuid, references `auth.users` | nullable — set once patient auth is wired in; existing rows predate patient accounts |
| `regimen_id` | text | |
| `education_level` | text | `basic` / `some_college` / `advanced` |
| `topics` | text[] | unused as of 2026-08-10 — topic/side-effect selection removed from intake; column and constraint left in place (not ALTERed) in case it's reintroduced, inserts now send `[]` |
| `depth_preference` | text | `short` / `detailed` |
| `voice_tone` | text | `neutral` / `friendly` / `hopeful` — passed to narration TTS as a style prompt |
| `follow_up_questions` | text[] | nullable |
| `created_at` | timestamptz | |

### `generated_videos`
One row per unique generated video. Not one-per-intake-submission — one per
distinct (regimen, education level, depth, voice tone) combination, so
multiple patients with matching intake reuse the same row/video instead
of triggering regeneration.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `filter_hash` | text, not null, unique with `regimen_id` | deterministic hash of the normalized personalization filter (tags, depth, education level, voice tone) — the cache lookup key. `tags` is now always the full fixed set (topics selection removed 2026-08-10), so it no longer differentiates entries; the hash formula itself hasn't been cleaned up yet — tracked as Phase 1 #3d, reopened but not started |
| `regimen_id` | text | |
| `storage_url` | text | |
| `selection_method` | text | `gemini` / `fallback` |
| `entry_ids` | text[] | which approved content entries were used |
| `total_seconds` | numeric | |
| `created_at` | timestamptz | |

Patients no longer own a video 1:1 — `intake_responses` rows link to a
`generated_videos` row by looking up `filter_hash`, not by a foreign key
owned by the video. A patient's watch history query joins through
`intake_responses.patient_id` → matching `generated_videos.filter_hash`.

### `watch_status` (new — Phase 1 goal #4)
One row per patient per regimen, tracks care-team-visible progress. Also
doubles as the patient's regimen **assignment**: a row existing for a
patient is what "you have a prescribed regimen" means — created on
successful QR scan (`status = 'not_started'`), not by picking from a list
(there is no picker — see `product_requirements.md` Regimen Selection).
Deliberate reuse instead of a separate assignment table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `patient_id` | uuid, references `auth.users`, not null | |
| `regimen_id` | text, not null | |
| `status` | text | `not_started` / `in_progress` / `done` |
| `updated_at` | timestamptz | |

Unique on `(patient_id, regimen_id)` — one status per patient per regimen. A
patient's "current" regimen for the Regimen Access page is their most
recently `updated_at` row (handles the rare re-scan-a-different-QR case).

### `notes` (new — Phase 1 goal #5)
One row per saved patient question/note from the post-video chat.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `patient_id` | uuid, references `auth.users`, not null | |
| `regimen_id` | text, not null | |
| `question_text` | text, not null | |
| `created_at` | timestamptz | |

Patient-only per `product_requirements.md` — never read by the care-team
view. No doctor-facing query should ever select from this table.

## Care-Team Query Pattern

The care-team list page (single page, no drill-down) reads, server-side with
the service-role key:
- All patients (from `auth.users` or a lightweight view over it) joined to
  their latest `watch_status` row per regimen.
- Never joins/selects `notes`.

## Deferred / Not Built

- Doctor-prescribes-patient flow (patient_id assigned by doctor, printable
  QR PDF) — no schema for this yet; when built, likely needs a
  `prescriptions` table (doctor-assigned patient_id ↔ regimen_id ↔ QR
  token). Not added now to avoid unused schema.
