# App Flow — Chemo Patient Education App

Pages the app contains and how a user navigates between them. Two roles:
patient and care team (nurses). See `product_requirements.md` for what
each page must do; this doc is the map, not the requirements.

## Entry Point

**Landing page** — role split:
- "I'm a patient" → Patient Login/Signup
- "Care team" → Passcode Entry

A QR scan (regimen-specific, printed/posted per regimen) lands the patient
directly at the landing page with the scanned regimen id carried through to
step 2 below — there is no picker/search page to carry it to.

## Patient Flow

1. **Login / Signup** (Supabase Auth, email + password) — returning patients
   log in; new patients create an account.
2. **Regimen Access** — no search or browsing, ever. Two states:
   - No assigned regimen yet: a simple prompt, "Scan your QR code to access
     your regimen." Nothing else visible.
   - Assigned regimen (QR previously scanned successfully, persisted to the
     account — see `backend_schema.md`): straight to that one regimen,
     highlighted, with video access. A fresh scan of a *different* regimen's
     QR (rare, but possible) updates the assignment.
3. **Intake Form** — education level, content-depth preference (short vs.
   detailed), desired voice tone (neutral, friendly, hopeful). No
   topic/side-effect picker (removed 2026-08-10) — the video always covers
   the full regimen side-effect set, concisely, not a patient-chosen subset.
4. **Generating** — loading/progress state while the video pipeline runs
   (content selection → TTS → render).
5. **Video Player** — the tailored narrated video.
6. **Chat (optional)** — free-form follow-up questions after watching.
7. **Notes** — patient's own saved questions/notes from the chat step,
   retrievable any time they're logged in. Patient-only — not visible to the
   care team.

Watch status (not started / in progress / done) updates automatically as the
patient moves through steps 4-5, independent of whether they use chat/notes.

## Care-Team Flow

1. **Passcode Entry** — single shared passcode, shared by all nurses, no
   per-nurse account.
2. **Patient List** — single page, all patient accounts with their assigned
   regimen and watch status. No per-patient drill-down in v1. Notes are not
   shown here.

## Navigation Notes

- No EHR/patient-record lookup — patient accounts are self-created, not
  pre-loaded.
- Deferred (not v1): doctor prescribing a regimen to a specific patient and
  generating a per-patient printable QR PDF. When built, this would add a
  "Doctor adds patient" step before the QR exists — noted here so future
  work doesn't have to rediscover this shape.
