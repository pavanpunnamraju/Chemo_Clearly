# UI/UX Design Brief — Chemo Patient Education App

Status: **stub — pending Phase 2b discovery.**

This brief covers the app-chrome UI (Phase 2b #2: overall feel/tone, color
palette, typography, and any reference points for a calm, plain-language,
accessible experience aimed at someone newly diagnosed and overwhelmed —
one that reads as genuinely engaging, not placeholder slides). It goes
through a real brainstorming/discovery pass when Phase 2b starts, per
`implementation_plan.md`. The video's own visual system (Phase 2a) is
separately specified in `docs/design/video_visual_system.md` and is not
this doc's scope.

## Copy framing (human-confirmed)

Frame the video/content as **"your care team's approved information,"** never
as an "AI-generated" badge or disclaimer. Backed by health-education-video
and AI-content-trust research: an "AI-generated" framing measurably lowers
patient trust versus a reviewed/approved framing, even when the underlying
content is identical.

Applies to any patient-facing copy that references how the video/content was
produced — video player page, intro/loading states, footer credit line,
chat/notes UI. Do not describe generation mechanics (LLM, script, pipeline)
in patient-facing text; describe the review/approval instead (e.g. "reviewed
by your care team," "approved for your regimen").

This is copy guidance only, to apply when Phase 2b builds the video-player
page (Phase 2a goal #9 / implementation_plan.md) — no patient-facing page
exists yet to carry it.
