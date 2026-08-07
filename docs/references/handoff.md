from: "codebase-agent"
to: "orchestrator-agent"

content:

Both tasks done to the point specified — runnable end-to-end, not just compiling. Real
app code in `web/` (Next.js App Router, TS), not another spike. Branch:
`worktree-video-gen-spike` in `.claude/worktrees/video-gen-spike`, fast-forwardable onto
`main` (no divergence — see "Environment note" below for why it landed there).

## TASK A — Phase 1 Goal 2: Intake logic — done

`web/lib/intake/schema.ts`: zod schema capturing education level (`basic` /
`some_college` / `advanced`), topics of interest (shared tag taxonomy from
`docs/content/schema.md`), and depth preference (`short` / `detailed`) + optional
follow-up questions. Pure `toPersonalizationFilter()` transform turns intake into the
filter spec (tags to include, whether to draw `detail` text) that video-gen consumes —
this is the "defined schema/interface other goals consume" the design doc asked for.
`emergency-signs` is always force-included in the filter regardless of topic selection.

Persistence: `POST /api/intake` validates + persists to Supabase (`intake_responses`
table) if configured, else logs and still returns the filter — endpoint works either way.

**Verified runnable**: `npm run demo:intake` — real validation (including a rejection
case), real filter output, no server/DB needed. Ran it, output is correct.

## TASK B — Phase 1 Goal 3: Real video-gen build — done, one piece unverified (below)

Pipeline: approved content (`docs/content/*.md`, parsed by `web/lib/content/parse.ts`)
→ intake filter → agentic selection → narration assembly → Google Cloud TTS → Remotion
render → storage.

**Guardrail design** (the design doc's "never introduce facts/phrasing outside the
canonical set" requirement): the agentic step (`web/lib/video/select.ts`) only returns a
list of pre-approved content-entry ids — it never generates prose. Its output is
validated against the known id set before use. Narration assembly
(`web/lib/video/narration.ts`) then pulls `plain`/`detail` text **verbatim** from the
parsed canonical content for those ids — markdown-formatting cleanup only (strips
citation brackets, `**bold**`, backticks, bullet markers), no rewording. This makes it
structurally impossible for the selection step to inject an unapproved claim, regardless
of what the model returns.

**Agentic provider**: per your call mid-session, this uses Gemini (`GEMINI_API_KEY`,
`@google/genai`, `gemini-2.5-flash`) instead of a paid Anthropic key, to keep it free —
Google AI Studio's free tier. **Not yet verified with a real call** — no `GEMINI_API_KEY`
in this environment. Falls back to a deterministic tag/depth filter when the key is
absent (same "fail clearly, don't silently stub" pattern as the TTS spike), so the
pipeline still runs end-to-end without it. Drop a free key from aistudio.google.com into
`web/.env.local` (`GEMINI_API_KEY=...`) to light up the real agentic call.

**Verified runnable, real calls**: `npm run demo:video` — ran it. Real Google Cloud TTS
call (2,807 chars billed, `en-US-Neural2-C`, ~1.5MB audio), real local Remotion render
(1280x720, ~178s, audio track present, 12MB mp4), stored to local disk (Supabase Storage
falls back to local disk — see below). Output: `web/out/videos/demo/*.mp4`.

**API route**: `POST /api/video/generate` runs the same pipeline server-side, stores via
Supabase Storage if configured. Not hit over HTTP this round (no dev server needed for
the demo scripts), but it's the same pipeline code the demo script exercises directly.

### Not verified — needs real credentials, flagging rather than guessing

- **Gemini** (`GEMINI_API_KEY`) — as above.
- **Supabase** (`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) — no live
  project exists yet. `web/supabase/schema.sql` has the `intake_responses` and
  `generated_videos` tables (RLS enabled, no public policies — v1 has no patient auth) —
  ready to run via the Supabase SQL editor once a project exists. Until then, intake
  responses log-only and videos fall back to local disk (`web/lib/storage.ts`,
  `web/lib/supabase/client.ts` — both gracefully no-op when unconfigured).
- **Remotion Lambda** — the design doc's already-known constraint (Remotion can't render
  inside a standard Vercel function) isn't rebuilt here; `web/lib/video/render.ts` renders
  locally (what's verified) and documents the Lambda swap-in as the next infra step, which
  needs an AWS account/deployed Lambda function this build has no credentials for.

### Decision needed from the human

Nothing blocking — the pipeline runs today without any of the three above. They're each a
"drop in a key/account and it upgrades" swap, not a redesign. Worth a decision on
**when** to provision Supabase + a Remotion Lambda function + a Gemini key: now (so
Phase 1 goal 7 — "credentials/APIs wired up end-to-end" — is fully closed), or deferred to
whenever goals 4-6 (watch-tracking, notes, QR flow, all also needing Supabase) get picked
up, since provisioning once probably covers all of them together.

## Environment note

This session was assigned to `.claude/worktrees/video-gen-spike` by the harness (not
something I chose) and couldn't be released back to the main checkout mid-session — I
flagged this and got explicit sign-off from the human to build here and fast-forward
merge, since main hadn't diverged from the worktree (both at `96b0758`), so there's no
reconciliation needed. Orchestrator/git-agent: this needs a fast-forward merge of
`worktree-video-gen-spike` into `main`, not a regular merge/rebase.

## Scope check

Did not touch `docs/content/*.md` content. Did not build watch-tracking, notes capture,
or the QR/regimen-picker flow (goals 4-6) — not assigned this round. Did not touch
Phase 2/3. `video-test/` (the original spike) is still present alongside `web/` —
superseded but left in place rather than force a deletion past a destructive-action
guard mid-session; safe to remove whenever, nothing in `web/` depends on it.

## Known non-blocking item

`npm audit` flags 3 high-severity advisories in `web/`, all transitive
build/dev-tooling deps (`postcss`, `sharp`, pulled in by Next.js's own tooling, not
runtime code this app calls) — fixing requires bumping to Next.js 16 (breaking change).
Left as-is rather than making that framework-version call unilaterally; flagging for a
decision, not urgent for a local-only demo build.
