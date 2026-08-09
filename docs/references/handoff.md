from: "orchestrator-agent"
to: "git-agent"

content:

## Kickoff: Phase 1 close-out commit

All Phase 1 goals (#1-#7c) are done and verified — see
`docs/implementation_plan.md` for the full status table. Human wants this
committed as **one commit covering all of Phase 1**, then Phase 2 (frontend)
starts.

### Deliberate deviation from your one-branch-per-goal default

Your doc's default is one branch per phase goal, merged when done. This
round intentionally bundles many already-completed goals (#2-#7c landed
across several sessions, none committed yet) into a single Phase 1
close-out — explicit human direction, not something I'm asking you to infer.
Flagging it per your own working agreement ("if unsure whether the human
actually wants X, ask") so it's a known, not silent, deviation. If you think
this should still be split (e.g. by branch-then-squash, or you want to
confirm with the human directly before committing to `main`), say so — your
call on the *how*.

### What's in the working tree (from my `git status --short` review)

**Modified:**
- `docs/agents/orchestrator-agent.md`, `docs/design/Chemo_Patient_Education_App.md`,
  `docs/references/handoff.md` — doc updates.
- `docs/content/rchop.md` — logic-agent's stats-strip edit (goal #1, see
  git log of this file... actually not yet committed, so see the prior
  handoff round for the diff description if needed).
- `web/` — various `lib/`, `app/api/`, `scripts/` files modified across the
  Phase 1 build (intake, video pipeline, package files, schema.sql).

**Deleted (already staged `D `, confirmed intentional per
`implementation_plan.md`'s "queued stale-file cleanup" note):**
- `video-test/` (entire dir) — superseded by the real pipeline in `web/`.
- `docs/live_task_progress.md` — superseded by `docs/implementation_plan.md`.

**Deleted (unstaged ` D`, not yet reviewed by me — please confirm these are
also intentional before including, I don't have prior context on why they
were removed):**
- `docs/references/framework-hosting-recommendation.md`
- `docs/references/video-gen-vendor-comparison.md`

**Untracked new files (`??`) — real source, not artifacts, should be
added:**
- New docs: `UI_UX_design_brief.md`, `agent_requirements.md`,
  `agentic_design_live.md`, `app_flow.md`, `backend_schema.md`,
  `implementation_plan.md`, `product_requirements.md`,
  `requirements_Nataraj.md`, `technical_requirement_document.md`.
- New `web/` modules: `app/api/care-team/`, `app/api/notes/`,
  `app/api/scan/`, `app/api/watch-status/`, `lib/auth/`, `lib/gemini/`,
  `lib/notes/`, `lib/watch/`, `lib/video/{align,components,guardrail,icons,rewrite}.ts`,
  `scripts/demo-{components,guardrail,notes,patient-flow,rewrite}.ts`,
  `scripts/sync-schema.ts`.

### Your standard checks apply as always

- Confirm nothing resembling real patient data/identifiers is staged (this
  project uses synthetic test patients throughout — verify none leaked into
  a fixture or demo script as a literal value).
- Confirm no secrets/API keys — `web/.env.local` should already be
  gitignored (verified separately this session, not by you), just double-
  check nothing slipped in some other way (e.g. hardcoded in a script).
- Confirm no large generated binaries (rendered `.mp4`s, cached audio) are
  staged — the pipeline renders to a temp dir and uploads to Supabase, so
  there shouldn't be any, but verify.
- Stage by name, review `git diff --staged` immediately before committing,
  per your own process.

### Process

- If anything looks off (the two unconfirmed deletions, anything
  resembling real data, anything you'd normally stop and ask about), stop
  and ask rather than proceeding.
- No push to remote — commit only, unless the human separately asks for a
  push.
- Write your report back into this file (`docs/references/handoff.md`,
  `to: "orchestrator-agent"`) when done — what was committed, what (if
  anything) was left out and why.
</content>
