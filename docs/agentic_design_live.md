# Agentic Design, Live

## Overview

This system turns pre-approved, clinically reviewed patient education content into a personalized narrated video. Four AI agents make judgment calls in the pipeline, in this order: Content Selector picks what to include, Narration Rewriter turns it into a spoken script, Safety Critic double-checks that script, Component Timing Placer times the on-screen icons. Everything else in the pipeline (voice synthesis, audio to text alignment) is mechanical execution, not judgment, so it is not listed here as an agent.

## What the agents never do

No agent writes medical content from scratch. All medical facts, thresholds, and instructions are written and clinically reviewed by a person before any agent touches them. Agents only select which reviewed content to use, rephrase it, or decide where to place a visual. None of them can introduce a new medical claim.

## Failure posture

If any agent's output fails its checks after all allowed attempts, the system stops and shows the patient an error. It never shows a video built on unreviewed or partially checked content.

## Patient data used

Only the patient's reading level and tone preference reach these agents. No
names, no identifiers, no medical record data. Patients don't choose topics
— every video covers the full regimen side-effect set, so no patient
preference reaches Agent 1 at all.

## Agent 1

- **position_in_pipeline:** 1
- **name:** Content Selector
- **goal:** Order the full set of pre-approved medical content for this
  regimen into a sensible narration sequence. It is an orderer, not a
  filter — every video covers every piece of approved content, regardless
  of patient preference.
- **context_passed:** The full list of available content pieces for the
  regimen (their category and safety level only, not the medical wording
  itself).
- **guardrails_set:** Can only choose from the list it was given, so it
  cannot invent a new content piece. Must include every piece in the
  catalog — if its output drops any, the deterministic fallback runs
  instead, so incomplete coverage never reaches the patient.
- **desired_output:** Every content piece, in a narration order.
- **fallback:** true. If the call fails, returns something invalid, or
  omits any content piece, a deterministic canonical ordering (grouped by
  section) runs instead. The patient always gets a complete, safe video
  either way.

## Agent 2

- **position_in_pipeline:** 2
- **name:** Narration Rewriter
- **goal:** Turn the selected, pre-approved medical content into one natural-sounding spoken script, matched to the patient's requested tone and reading level.
- **context_passed:** The selected content pieces in their approved wording, plus the patient's requested tone (friendly, neutral, or hopeful) and reading level (basic, some college, or advanced).
- **guardrails_set:** Must cover every selected piece, in order, none skipped or added. The result is checked for invented facts, numbers, or names; for being safe to read aloud; and, for a basic reading level, for short enough sentences. On failure it is told exactly what was wrong and asked to try again, up to 3 attempts total.
- **desired_output:** One continuous spoken script, with each part traceable back to the content piece it came from.
- **fallback:** false. If it cannot produce a version that passes every check within 3 attempts, video generation stops and the patient sees an error. It never shows an unreviewed or partially checked script.

## Agent 3

- **position_in_pipeline:** 3
- **name:** Safety Critic
- **goal:** Independently double-check the rewritten script against the original approved wording for a specific, high-stakes mistake: wording that keeps all the right facts but flips what the patient is being told to believe or do. Example: turning "this is an emergency, call immediately" into something that reads as optional.
- **context_passed:** For each content piece, its safety level (routine or emergency), the original approved wording, and the rewritten version of it.
- **guardrails_set:** Any issue found in emergency-level content is an automatic failure. For non-emergency content, it only flags a real change in instruction, not a change in wording or tone. It also checks that an emergency instruction was not quietly dropped or softened.
- **desired_output:** A pass or fail decision, and if it fails, a plain-language explanation of what changed and why it is a problem.
- **fallback:** false. This check runs inside the same 3-attempt loop as the Narration Rewriter. If it never passes, generation stops rather than shipping unreviewed narration.

## Agent 4

- **position_in_pipeline:** 4
- **name:** Component Timing Placer
- **goal:** Pick the best moment on screen to show a small supporting icon for a side effect mentioned in the narration, so it appears while the topic is actually being discussed, not just at its first passing mention.
- **context_passed:** A short window of nearby sentences around each place a side effect was already found by a simple keyword match. Never the full script, and never content it was not already matched to.
- **guardrails_set:** Can only choose between a small set of pre-selected candidate sentences. Cannot pick an arbitrary moment or invent a new visual. Never touches or influences the narration text itself, only when an icon appears.
- **desired_output:** For each side-effect icon, which nearby sentence is the best moment to display it.
- **fallback:** true. If the call fails or returns something invalid, each icon simply appears at its first plain keyword match instead. Worst case is a slightly less well-timed icon, never a missing or wrong one.
