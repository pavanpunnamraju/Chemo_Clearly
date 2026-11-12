# Motion implementation and frame diagnosis

Date: 2026-09-13. Assistant-authored procedure in response to Pavan's request:

> I can't just have verbal feedback to your next session, I need implementation feedback, that means design techniques, frame diagnosing issues, and steps to identify realism vs "oh that looks weird".

Apply this before implementing or reviewing motion. Use the relevant techniques;
do not add every technique to every asset. This operationalizes the two-stream
retrospective in [feedback_v1.md](../../feedback_v1.md). It does not promise
first-attempt approval or create an additional user approval gate.

## 1. Convert the brief into a small construction plan

Before editing, put these six items in the active asset's plan:

1. **Meaning and clock:** exact narration cue, visible action and end state. Identify
   what is literal and what is an explanatory convention. The WBC dissolve depicts
   declining counts; it must not acquire unrequested bursting/destruction details.
2. **Locked appearance:** approved source bytes/reference frames, camera, materials,
   lighting, palette, framing and effects to preserve. Include the soft reveal edge,
   not just the large objects. Name permitted changes separately.
3. **Geometry and coordinates:** anatomical joints or 3D paths; source coordinates,
   world coordinates, projected scene pixels and final viewport coordinates. Name
   which space owns each anchor, mask and measurement.
4. **Layer ownership:** draw the stack, identify each stationary silhouette's owner,
   what moves together, what becomes exposed, and which surface receives a shadow.
5. **Motion contract:** persistent object IDs, path, speed relative to visible peers,
   contact/attachment constraints, opacity schedule and complete return or final hold.
6. **Review frames:** select events and neighboring frames before rendering. Attach
   an expected visible result to each event, not merely a timestamp.

If the middle scale or composition is unresolved, show a small storyboard and ask
about that visible choice. Do not ask Pavan to solve masks, joints or renderer math.
Carry these six items into a delegated task; the lead verifies the final composition.

## 2. Choose construction techniques that prevent the defect

| Problem | Technique | Evidence to inspect |
| --- | --- | --- |
| A zoom feels like a replacement image | Preserve one scene and register a recognizable landmark through scale changes. For uniform scale, `screenPoint = scale * scenePoint + translation`; therefore `translation = targetAnchor - scale * landmark`. | Track the same bend/feature across adjacent frames. Check the actual rendered matrix, not only the helper output. An off-center canvas is valid when the chosen landmark stays registered. |
| A thin curved object becomes a dark slit | Project the actual geometry into scene pixels; construct a ribbon mask following that curve. Mask the existing art rather than drawing a substitute. | Sample visible wall color along the projected curve, measure its thickness and continuity, and check the encoded image. A narrow bounding box alone proves nothing about its contents. |
| A reveal has a halo, hole or spill | Keep the intact source beneath the revealed scene; clip early content to the source silhouette. Use one deliberate feather, with a defined opaque interior and transparent exterior. Release the anatomical clip only when the next view covers the stage. | Inspect first-visible pixels and both sides of clip release. Temporarily visualize each mask separately. Check that the feather does not expose an empty canvas or multiply with another feather. |
| An arm stretches, disconnects or leaves fabric behind | Mark joints on the source image before splitting paths. Transform complete connected sleeve/skin/crease units. Use a joint hierarchy and plausible contact target; supply the stationary underlayer exposed by motion. | Overlay joints and limb segments. Check attachment distances and segment lengths through the action, plus the composited silhouette. A source SVG path boundary is not an anatomical joint. |
| A stamp or held prop floats/slides | Express the grip in hand-local coordinates and derive the prop transform from it. Define a contact point and board plane; separate approach, contact dwell and withdrawal. | Hand-to-grip separation should remain stable; contact must meet the board without penetrating it. Check shadow/contact location at impact and the frames immediately around it. |
| A cell looks pinned or teleports | Use persistent IDs and a continuous path parameter. Compare peer velocities, not just nonzero coordinates. Continue path motion while opacity changes; do not reset visible objects on screen. | Track per-frame positions and opacity together. Check travel over a visible interval at phone size, direction relative to the stream, boundary exits and return/wrap logic. |
| Gloss or membranes change unexpectedly | Preserve material/light/camera state; update stable shader uniforms on the actual material. Verify the frame has rendered before capturing. | Compare sequentially encoded frames with isolated stills. State values can be correct while the GPU displays stale values. |

Use smooth velocity through unconstrained travel: inspect finite differences of
position and speed near curve joins. Smooth easing is not a substitute for correct
contact or anatomy. Contact can change velocity; a visible bounce needs an intended
material response and damping, not a generic spring pasted onto the whole figure.

For 3D flow, check clearance in world space and readability in screen space.
Projection can make separate objects overlap; conversely, a nonintersection test
can pass while the shot looks cluttered. Fix the relevant problem rather than
forcing every projected silhouette to remain disjoint.

## 3. Diagnose frames in a repeatable order

**First watch the actual export at normal speed and intended display size.** Mark
the time and the specific object that draws attention. Then frame-step the marked
interval. Closeups explain defects; normal/phone playback establishes whether the
intended motion and meaning are perceptible.

For every visibility, clipping, parenting or representation change, inspect
`f-2, f-1, f, f+1, f+2`, within shot bounds. Also inspect rest, first changed frame,
mid-motion, maximum reach/speed, contact, fade midpoint, final changed frame and
the following hold. Do not sample only attractive endpoints.

For the approved 30 fps vessel study, useful existing samples are:

| Event | Frames | What to diagnose |
| --- | --- | --- |
| First reveal | 36, 37, 38 | Empty portal, new halo, first discontinuity |
| Thin middle vessel | 54, 60, 66 | Red wall continuity, thickness, arm containment |
| Widening reveal | 72, 78, 84 | Feather loss, edge clipping, scale/landmark drift |
| Full-view handoff | 94, 95, 96 | Residual mask/transform and appearance pop |
| Count decline | 139, 140, 141, 180, 220, 222, 225 | Travel during fading, membrane persistence, sequential-render errors |
| Final hold | 360, 401 | Survivor framing and unintended late state changes |

These are examples for this shot, not reusable hardcoded times. For another regimen,
derive events from its narration and motion state. Add the immediate neighbors of
any newly identified change; existing sparse samples do not cover every boundary.

When a defect appears, use this isolation order:

1. **Silhouette:** pause and inspect the outline with internal details hidden. If
   it is broken, debug geometry, pose, framing or clipping before changing shading.
2. **Attachment and coordinates:** overlay joints, anchor points, path centers and
   local axes. Inspect final transform ancestry. Measure both points in the same
   coordinate space; do not compare cached offscreen bounds to fresh screen bounds.
3. **Occlusion:** temporarily give layers distinct debug colors and show clip/mask
   outlines. Identify the exact layer exposing the hole or owning the doubled edge.
4. **Timing:** graph or tabulate position, displacement, speed and opacity across
   the bad interval. Change one variable to test the cause. A static correct pose
   with an unnatural arrival usually needs trajectory/timing diagnosis.
5. **Surface integration:** restore materials; examine contact shadows, edge alpha,
   lighting direction and depth cues. Use a difference image or pixel patch when a
   regression is subtle. Remove debugging overlays from the review output.

## 4. Replace “weird” with a falsifiable diagnosis

Classify the observation before proposing a fix:

| Class | Examples | Response |
| --- | --- | --- |
| Construction failure | Disconnected cuff, grip slips, prop penetrates board, object jumps, reveal spills outside arm | State the violated attachment/contact/continuity constraint; measure it and repair internally. |
| Perceptual failure | WBC technically moves but reads as stationary; narrow mask reads blue rather than red; contact is visually ambiguous | Measure the screen result and compare with nearby objects at playback size. Adjust presentation and replay. A mathematical pass cannot override the visible failure. |
| Unresolved physical or biological meaning | Motion suggests a mechanism unsupported by the script; an unfamiliar gesture may require a reference | Identify the specific implied action. Check the source and an appropriate reference before asserting realism; ask a targeted content question if needed. Do not turn aesthetic approval into clinical validation. |
| Style preference | Amount of gloss, chosen palette, preferred camera angle or feather softness | Compare with the latest approved reference and explicit direction. If undecided, show the concrete choice rather than calling it physically wrong. |

Realism here means coherent shape, attachment, contact, trajectory, occlusion,
scale cues and source-supported meaning within the chosen illustration style.
Photorealism is not required. A deliberate microscopic scale transition or symbolic
dissolve is an explanatory convention; its internal continuity still needs to work.

Example diagnosis: “At frames 54–66 the intended red vessel appears navy. The
straight mask crosses the curved wall rather than following it. Overlay the
projected rim and mask centerline; compare red versus blue coverage along that
curve. Replace the slit with a projected rim ribbon; verify red coverage and the
soft widening edge in both stills and the encoded clip.” This identifies a cause
and a repair. “Make it more natural” does neither.

## 5. Evidence and regression checks

Define tolerances in the relevant units and explain why they matter. Keep them
specific to the shot and output size; renderer tolerances are not biological laws.

- **Attachment/registration:** measure pixel distance between projected anchors
  after actual DOM transforms. The vessel inspector uses a 0.35 px landmark
  tolerance; this is an engineering tolerance for this composition.
- **Visible shared flow:** compare displacement and direction for both populations
  over the same interval, then watch it. Current WBC path speeds are 0.030–0.033
  against RBC 0.034. This fixed the pinned appearance; these are animation
  parameters, not measured physiological rates.
- **Thin wall:** final frame 54 has 268 crimson versus 0 blue sampled encoded
  pixels in the existing check. Curve coverage and thickness accompany this count;
  color count alone could accept an unrelated red patch.
- **Preserved appearance:** the final implementation matched 17 sampled post-entry
  PNGs exactly against the preserved reference. Exact comparison is useful for an
  unchanged deterministic endpoint. For deliberately changed areas, define a region
  and an explained tolerance; never regenerate the baseline just to make a test pass.
- **GPU/export behavior:** inspect an encoded interval containing successive moving
  and fading frames. Compare membrane visibility against stills. A still-only pass
  missed our shader state bug; encoding is a separate check.

Existing implementation and evidence entry points:

- [Registration and projected rim mask](../../web/lib/video/continuous-arm-vessel-motion.ts)
- [Layering and live-scene reveal](../../web/video-composition/directed/ContinuousArmVesselOpening.tsx)
- [Cell trajectories and fade state](../../web/lib/video/curved-vessel-motion.ts)
- [Actual render/export inspector](../../web/scripts/inspect-curved-arm-blood-cell-study.ts)
- [Retained approval records and compact evidence](approved-animations.json)

The original preview-6 evidence/export-inspection files under `web/out` were
removed after approval. Measurements above are historical results, not links to
retained review artifacts. Reproduce a fresh export with the retained scripts.

The inspector is asset-specific, not a universal realism test. Reuse the diagnostic
methods and data contracts across regimens; derive timings/labels from their source
cues. Do not assume the same depiction fits every narration or clinical context.

## 6. Execute, record and hand off

Prototype the uncertain contact or transition first. Run relevant type/geometry/
motion checks, inspect event stills, then inspect a sequential encoded clip. Finish
the full narrated render only after the local defect is resolved. Review the final
MP4 at normal and phone landscape sizes, including captions, framing and sound
synchronization. If the current runner only exports a whole study, use that export;
do not claim a short-clip facility exists without implementing it.

Record each defect using this compact template in the asset review:

```text
Output path + hash / frame + time / normal or phone or closeup:
Observed symptom (specific object and visible behavior):
Expected constraint or approved reference:
Classification: construction / perception / meaning / style
Measurement + coordinate space (or reference needed):
Suspected cause and one-variable isolation check:
Fix and neighboring features that must remain unchanged:
Rechecked frames + encoded interval + result:
Remaining uncertainty / human approval status:
```

Future sessions must read this protocol through AGENTS.md, apply the relevant
construction and diagnosis steps, and leave this evidence with the next asset.
Known anatomy, clipping and export defects should be caught by the implementation
review, rather than becoming questions Pavan has to answer. Technical evidence,
human animation approval, source/speech checks and clinical approval stay distinct.

## 7. Work-to-relax construction checks (2026-09-13)

- A two-bone solver can jump between elbow solutions. Preserve the source bend
  branch through the lift; change branches only at the unique straight-arm apex,
  and inspect the frames immediately before/after. Route wrists around the face;
  merely separating wrist targets can still leave elbows crossing the face.
- Give easing one owner. Reapplying smoothstep to an already eased narration cue
  compressed most shoulder travel into a half-second despite continuous equations.
  Inspect angular travel across adjacent encoded frames, not only smooth endpoints.
- A source-to-rig switch needs matching full silhouettes. Matching cuff anchors did
  not prevent shoulders and exposed skin from changing shape on the first moving
  frame. Preserve opaque source clothing/skin until the moving surfaces match;
  inspect the original, first change, and overlapping clip transfer at close range.
- Retire departed editorial props after they are fully offstage. A later parent
  swipe can otherwise bring right-translated children back into view. Verify the
  final encoded frames, including after the subject has left.
- Confirm an occlusion claim against actual painter order and pixels. Background
  cards touching a hair silhouette were initially misclassified by a reviewer as
  foreground occlusion. The lead rechecked source order and exported pixels; the
  reviewer corrected this to background clutter. Independent review needs evidence.
