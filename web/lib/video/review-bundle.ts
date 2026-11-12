import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadRegimenContent } from "../content";
import { IntakeSchema } from "../intake/schema";
import { validateDirection } from "./director";
import type { DirectedVideoProps } from "./direction-types";
import { buildDirectedCaptionTrack } from "./captions";
import { assertReliableTiming, type DirectedTiming } from "./timing";
import { digest, objectDigest, implementationDigest } from "./stage-cache";
import { speechReviewPassed } from "./speech-fidelity";
import { readLinear16Wav } from "./align";
import { SECTION_JOIN_SILENCE_MS } from "./pipeline";
import { validateSegmentEvidence } from "./speech-evidence";
import { PATIENT_ARTWORK_RECIPES } from "./library-patient-motion";
import { LIBRARY_CONTEXT_ARTWORK } from "./library-context-motion";

export const BUNDLE_FILES = ["narration.wav", "narration.txt", "captions.vtt", "captions.json", "storyboard.json", "timing.json", "acoustic-review.json", "speech-review.json", "props.json"] as const;

export function bundleChecksums(directory: string): Record<string, string> {
  return Object.fromEntries(BUNDLE_FILES.map((file) => [file, digest(readFileSync(path.join(directory, file)))]));
}

export function directedRendererDigest(): string {
  return implementationDigest(["render-directed.ts", "render-narration-audio.ts", "transition-plan.ts", "../../video-composition/directed/BoundaryTransitionStage.tsx", "direction-types.ts", "../../video-composition/DirectedRoot.tsx",
    "../../video-composition/directed/DirectedVideo.tsx", "../../video-composition/directed/DirectedScene.tsx",
    "../../video-composition/directed/PatientIllustration.tsx", "../../video-composition/directed/DirectedCaptions.tsx",
    "../../video-composition/directed/CallingArtwork.tsx", "../../video-composition/directed/DrinkingArtwork.tsx",
    "../../video-composition/directed/namespace-svg.ts", "../../video-composition/directed/ApprovedArtworkStage.tsx", "approved-artwork-motion.ts",
    "calling-study-motion.ts", "drinking-study-motion.ts", "arm-deform.ts",
    "../../public/studies/calling/Calling-pana.svg", "../../public/studies/drinking/drinking-water-pana.svg",
    "../../video-composition/directed/FeverSafetyScene.tsx", "../../video-composition/directed/DirectedLayoutQA.tsx",
    "../../video-composition/directed/DirectedFonts.tsx", "../../video-composition/directed/DirectedTheme.ts", "../../public/fonts/figtree-latin-v9.woff2",
    "library-direction.ts", "library-artwork-clock.ts", "library-patient-motion.ts", "library-context-motion.ts",
    "../../video-composition/directed/LibraryArtworkStage.tsx", "../../video-composition/directed/LibrarySvgArtwork.tsx",
    "../../video-composition/directed/LibraryPatientArtwork.tsx", "../../video-composition/directed/LibraryContextArtwork.tsx",
    "../../video-composition/directed/PatientCareObjects.tsx", "../../video-composition/directed/AdditionalCareArtwork.tsx",
    ...[...new Set([...Object.values(PATIENT_ARTWORK_RECIPES).map((recipe) => recipe.publicPath),
      ...LIBRARY_CONTEXT_ARTWORK.flatMap((recipe) => recipe.publicPath ? [recipe.publicPath] : [])])].map((file) => `../../public/${file}`),
  ]);
}

export function reusableRender(directory: string, manifest: Record<string, any>): boolean {
  const video = path.join(directory, "video.mp4");
  return existsSync(video) && manifest.rendererDigest === directedRendererDigest() &&
    manifest.videoDigest === digest(readFileSync(video));
}

/** A review bundle is immutable input to rendering. Edits require regeneration and new review. */
export function loadVerifiedBundle(directory: string) {
  const readJson = (file: string) => JSON.parse(readFileSync(path.join(directory, file), "utf8"));
  const manifest = readJson("manifest.json");
  const intake = IntakeSchema.parse(manifest.intake);
  const content = loadRegimenContent(intake.regimenId);
  if (manifest.sourceDigest !== objectDigest(content)) throw new Error("Source changed since this bundle was prepared. Regenerate before rendering or review.");
  const currentVersions = {
    rewriteVersion: implementationDigest(["rewrite.ts", "guardrail.ts", "source-packet.ts", "narration.ts", "select.ts", "../intake/schema.ts"]),
    voiceVersion: implementationDigest(["tts.ts"]),
    alignmentVersion: implementationDigest(["align.ts", "timing.ts", "forced-align.ts", "forced-align.py", "alignment-requirements.txt"]),
    speechReviewVersion: implementationDigest(["speech-fidelity.ts", "timing.ts"]),
  };
  if (objectDigest(manifest.checkerVersions) !== objectDigest(currentVersions)) throw new Error("Generation/checker implementations changed. Re-prepare using valid cached stages before rendering.");
  const checksums = bundleChecksums(directory);
  for (const file of BUNDLE_FILES) if (manifest.files?.[file] !== checksums[file]) throw new Error(`Review bundle integrity failed: ${file}`);
  const props = readJson("props.json") as DirectedVideoProps;
  const timing = readJson("timing.json") as DirectedTiming;
  assertReliableTiming(timing);
  const directionIssues = validateDirection(props.direction, content, timing);
  if (directionIssues.length) throw new Error(`Storyboard validation failed: ${directionIssues.join("; ")}`);
  if (objectDigest(props.direction) !== objectDigest(readJson("storyboard.json"))) throw new Error("Storyboard and render props disagree.");
  if (readFileSync(path.join(directory, "narration.txt"), "utf8").replace(/\s+/g, " ").trim() !== timing.script) throw new Error("Written narration and timing script disagree.");
  const reviews = readJson("speech-review.json");
  const reviewVersion = implementationDigest(["speech-fidelity.ts", "timing.ts"]);
  const acousticReviews = readJson("acoustic-review.json");
  if (!Array.isArray(reviews) || reviews.length !== manifest.sections.length ||
    reviews.some((r: any, i: number) => r.sectionId !== manifest.sections[i] || r.version !== reviewVersion ||
      r.audioDigest !== acousticReviews[i]?.audioDigest || !speechReviewPassed(r.report, r.script)) ||
    reviews.map((r: any) => r.script).join(" ") !== timing.script) throw new Error("Speech-fidelity evidence is incomplete, stale or contradictory.");
  if (props.direction.shots.length !== timing.entries.length || props.direction.shots.some((shot, i) => {
    const entry = timing.entries[i]!;
    const expectedStart = i === 0 ? 0 : entry.startSeconds;
    const expectedEnd = timing.entries[i + 1]?.startSeconds ?? timing.audioDurationSeconds;
    return shot.entryId !== entry.entryId || Math.abs(shot.startSeconds - expectedStart) > .001 || Math.abs(shot.endSeconds - expectedEnd) > .001;
  })) throw new Error("Storyboard and narration entry boundaries disagree.");
  const captions = buildDirectedCaptionTrack(timing);
  if (!captions.diagnostics.valid || objectDigest(captions.captions) !== objectDigest(props.captions)) throw new Error("Captions no longer match verified speech timing.");
  if (props.audioSrc !== "narration.wav" || !props.captionsEnabled || props.qaMode || props.musicSrc) throw new Error("Candidate contains unreviewed render overrides.");
  if (Math.abs(props.direction.totalSeconds - timing.audioDurationSeconds) > .001) throw new Error("Visual and speech duration disagree.");
  const audioBuffer = readFileSync(path.join(directory, "narration.wav"));
  if (digest(audioBuffer) !== manifest.audioDigest) throw new Error("Narration audio does not match its review manifest.");
  const rate = reviews[0].sampleRateHertz;
  const pcm = readLinear16Wav(audioBuffer, rate);
  let cursor = 0;
  for (const [index, review] of reviews.entries()) {
    if (review.sampleRateHertz !== rate || !Number.isSafeInteger(review.pcmBytes) || review.pcmBytes <= 0 ||
      digest(pcm.subarray(cursor, cursor + review.pcmBytes)) !== review.pcmDigest) throw new Error(`Section speech review is not bound to rendered audio: ${review.sectionId}`);
    if (review.segments !== undefined) validateSegmentEvidence(pcm.subarray(cursor, cursor + review.pcmBytes), review.script, rate, review.segments);
    cursor += review.pcmBytes;
    if (index < reviews.length - 1) {
      const padBytes = Math.round(SECTION_JOIN_SILENCE_MS / 1000 * rate) * 2;
      if (pcm.subarray(cursor, cursor + padBytes).some((value) => value !== 0)) throw new Error("Unexpected speech in section join padding.");
      cursor += padBytes;
    }
  }
  if (cursor !== pcm.length) throw new Error("Audio contains unreviewed material outside section evidence.");
  return { directory, props, audioBuffer, manifest, timing };
}
