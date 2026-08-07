# App framework / hosting recommendation (Phase 1)

Goal: a stack suited to a fast, polished demo build — Phase 1 backend-first, Phase 2
frontend to follow in the same codebase. Recommendation only, **needs human approval**
before building against it, per the design doc and handoff.

## Recommendation: Next.js (App Router, TypeScript) + Vercel + Supabase

- **Next.js** — one codebase for both the backend (API routes: intake, watch-tracking,
  notes, regimen content, QR/regimen-confirm) and, in Phase 2, the actual patient-facing
  UI. Avoids standing up a separate frontend/backend repo pair for a project this size —
  faster to get an end-to-end demo running, which is the Phase 1 goal 7 bar ("pipeline runs
  end-to-end, even without a finished UI").
- **Vercel** — deploys a Next.js app with near-zero config, handles environment
  variables/secrets cleanly (relevant to the "never commit API keys" rule in my working
  agreements), and is the natural pairing for Next.js.
- **Supabase** — Postgres database (regimen content, intake responses, watch-tracking
  status, patient notes), built-in Auth (fits the Phase 3 "Dr. Reddy only" access-control
  goal via Row-Level Security), and file Storage (rendered videos). One backend-as-a-service
  covers DB + auth + storage instead of three separate vendors — keeps the Phase 1 "wire up
  credentials/APIs" surface small.
- **QR flow**: no vendor needed — QR codes are generated with a small library (e.g. the
  `qrcode` npm package) pointing at a signed/tokenized URL; ties directly into Phase 3 goal 1
  (non-guessable QR tokens) later.

## Known integration gotcha, already resolved before building

Remotion (the video-gen recommendation) **cannot render inside a standard Vercel serverless
function** — Chromium (a Remotion dependency) alone exceeds Vercel's 50MB function size
limit. [Verified via Remotion's own docs on Vercel constraints.] The supported pattern,
confirmed in Remotion's own docs and an official Remotion-on-Vercel template, is:

- Trigger the render from a Vercel serverless function (API route), but do the actual
  rendering via **Remotion Lambda** (AWS) or **Vercel Sandbox**, not inline.
- Store the finished video in **Supabase Storage** — Remotion has a documented
  Supabase-storage output provider for exactly this.

This is a real constraint worth knowing before Phase 1 goal 3 is built, not after — flagging
it now so it doesn't surface as a surprise mid-build.

## Cost at demo scale

- Supabase free tier: 500MB DB, 1GB file storage, 50k MAUs, unlimited API requests — more
  than enough for a single-clinician demo with 1-2 regimens. Caveat: free projects pause
  after a week of inactivity (fine for active development; worth remembering before a demo
  day if the project's gone quiet for a week).
- Vercel: free tier covers a demo-scale app; Remotion Lambda/render compute is the only
  piece with real usage-based cost, and it's pay-per-render, not a subscription.

Net: this stack is close to **$0** to build and demo at this scale, same as the video-gen
recommendation — consistent with "optimize for cheapest option that actually achieves the
goal" running through both open technical decisions this round.

## Why not alternatives

- **Separate frontend (React/Vite) + separate backend (FastAPI/Express) + separate DB
  host** — more moving parts, more deploy configuration, no clear benefit at this scale;
  works against "fast, polished demo build."
- **Firebase** instead of Supabase — viable alternative, but Postgres (Supabase) gives more
  natural relational modeling for regimen content/schema (`docs/content/schema.md`) than
  Firestore's document model, and Supabase's Row-Level Security maps cleanly onto the
  Phase 3 "Dr. Reddy only" access-control goal.

## Status

Recommendation only — **needs explicit human approval** before any code is built against
this stack, per working agreements (tool/vendor choices confirmed before locking in
anything load-bearing).
