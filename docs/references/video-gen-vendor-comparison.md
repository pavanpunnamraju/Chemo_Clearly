# Video-generation vendor comparison (Phase 1 goal 3)

Goal: narrated slides/animation style (explicitly **not** an AI avatar/talking head), cheapest
option that actually achieves it, verified for real usability. This is a recommendation only
— **not locked in**, needs explicit human approval per the design doc and the handoff.

## Candidates considered and ruled out early

- **Synthesia, HeyGen, Colossyan** — primarily avatar/talking-head products. Some offer a
  "slides + voiceover, no avatar" mode, but it's a secondary feature bolted onto an
  avatar-first product and priced accordingly (avatar-tier pricing, $20-90+/mo). Doesn't
  match the "optimize for cheapest option" instruction when better-fit options exist.
- **Renderforest** — good template-based explainer videos, but **no public API** confirmed
  in research — automation/backend integration isn't realistically possible, which Phase 1
  goal 7 (pipeline runs end-to-end without a finished UI) requires.
- **Plainly Videos** — has a real API, but the workflow requires building the video template
  in **Adobe After Effects** first (a design tool, not something this pipeline currently has
  a workflow for), and starts at $69/mo for a small render-minute allotment. Viable future
  option if we later want more visual polish than code-driven slides give us, but not the
  cheapest path to a working v1.

## Top 2 candidates, compared and verified

### 1. Remotion (self-hosted, code-based) + Google Cloud Text-to-Speech — recommended

**What it is:** Remotion is an open-source library (React-based) for producing videos
programmatically — you write the slide layouts/animations as React components, Remotion
renders them to video. It is not a hosted "upload a script, get a video" service; it's a
rendering engine we control end-to-end, which is actually a *better* fit for "narrated
slides/animation" than any avatar SaaS, since we're not fighting a product built around a
different use case. Narration comes from a separate TTS call (Google Cloud TTS), synced to
the slide timing in code.

**Cost:**
- **Remotion license**: confirmed free for individuals, non-profits, and for-profit
  companies with ≤3 employees; a paid Company License (~$25/seat/mo, $100/mo minimum) is
  only required once a for-profit org hits 4+ employees or sets up automated/programmatic
  rendering at scale. [Verified directly against `remotion.dev/docs/license/faq` — primary
  source, not an aggregator.] For this project's current size, this is **$0**.
- **Rendering compute**: self-hosted (run on our own server/CI) is cheapest; Remotion Lambda
  (AWS) or Cloud Run (GCP) are optional scale-up paths if needed later, priced by
  compute-second, not per-video.
- **Narration (Google Cloud TTS)**: Standard/WaveNet voices are $4 per 1M characters, with a
  generous **4M characters/month free tier that doesn't expire**, per multiple pricing
  aggregators as of mid-2026 — a full regimen video's narration script (a few thousand
  characters) is essentially free at demo scale.

**Verification done:**
- ✅ Docs match claims — fetched Remotion's actual license FAQ page directly (not a summary
  site) and confirmed the free-tier threshold (≤3 employees / individual / non-profit).
- ✅ "API key" equivalent — Google Cloud TTS uses a standard GCP service-account
  key/OAuth credential, the same mechanism as any other GCP API; well-documented, low-risk
  to obtain (no special approval process).
- ⚠️ Not yet done: an actual live test render + TTS call — that requires provisioning real
  credentials, which needs the human's go-ahead before spending anything (even free-tier
  usage means creating accounts). Flagging this as the remaining verification step once
  vendor choice is approved.

**Trade-off to be upfront about:** this is the cheapest option because we're doing more of
the work ourselves (building the slide templates/animations in code) rather than paying a
SaaS to do it. Given this is the *codebase agent* building it, that's a reasonable trade — it
also gives the most control over matching the calm, plain-language tone Phase 2 wants, since
nothing is templated by a third party.

### 2. Elai.io — SaaS fallback if we want less to build ourselves

**What it is:** A hosted video-generation product with a slide-based editor that accepts
text/PowerPoint/PDF input and adds AI narration; it does default to an on-screen avatar but
the avatar can be removed/hidden, leaving narrated slides. Has a genuine REST API.

**Cost:** Plans start at $23/mo (lowest tier found across pricing aggregators); the API is
available on paid *and trial* accounts, so a free trial is enough to verify before paying.

**Verification done:**
- ✅ Docs match claims — fetched Elai's actual API reference page directly
  (`elai.readme.io/reference/getting-started-with-your-api`), confirmed the real
  token-generation flow (Elai account → admin login → API Settings page → Generate token)
  and a real endpoint shape: `POST https://apis.elai.io/api/v1/videos/render/{videoId}` with
  a Bearer token — this is a legitimate, working API, not vaporware.
- ✅ API key obtainable — confirmed available on trial accounts, no paid commitment needed
  to test.
- ⚠️ Not yet done: an actual test call (needs a trial account signup — same "needs go-ahead
  before creating third-party accounts" caveat as above).

**Why it's #2, not #1:** it's fundamentally an avatar-presenter product with slides as a
secondary mode, priced and designed around that; less alignment with "narrated
slides/animation, not talking head" than a purpose-built code approach, and it's a recurring
subscription cost vs. Remotion's ~$0 at our scale.

## Recommendation

**Remotion + Google Cloud TTS**, as the cheapest option that directly matches the required
style and gives full control over tone/pacing. **Elai.io** as a documented fallback if we
decide we want a faster path to a demo without building animation code ourselves, at a real
but modest recurring cost.

**Needs human approval before either is locked in** — this is a comparison + recommendation
only, per the handoff's instructions. Next step once approved: create real accounts/API
keys and run one actual end-to-end test render before building the pipeline around it.
