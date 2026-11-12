import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SECTION_IDS, type RegimenContent } from "../content/types";
import { loadRegimenContent } from "../content";
import { IntakeSchema, toPersonalizationFilter, type Intake } from "../intake/schema";
import { rewriteNarration, validateRewrittenNarration, type RewriteResult } from "./rewrite";
import { synthesizeNarration, type SynthesizeResult } from "./tts";
import { forceAlignNarration, type ForcedAlignmentResult } from "./forced-align";
import { readLinear16Wav } from "./align";
import { groupEntriesBySection, stitchSections, type SectionPipelineOutput } from "./pipeline";
import { reconcileNarrationTiming, assertReliableTiming } from "./timing";
import { buildDirectedCaptionTrack } from "./captions";
import { directVideo, directionCacheKey, validateDirection, type DirectorInput } from "./director";
import type { DirectedVideoProps, VisualDirection } from "./direction-types";
import { digest, objectDigest, implementationDigest, audioCachePath, readStage, saveStage, writeJson } from "./stage-cache";
import { bundleChecksums, reusableRender } from "./review-bundle";
import { safetyDisplayWarning } from "./safety-display";
import { reviewSpokenNarration, speechReviewPassed, type SpeechReview } from "./speech-fidelity";
import { speechReviewFailure } from "./speech-diagnostics";
import { synthesizeReviewedSegments, type SegmentedSpeechEvidence } from "./segmented-speech";
import { validateSegmentEvidence } from "./speech-evidence";

export interface GenerationOptions {
  cacheRoot?: string;
  outputRoot?: string;
  onProgress?: (message: string) => void;
}

export function validateSourceCoverage(content: RegimenContent): void {
  const sections = new Set(content.entries.map((e) => e.sectionId));
  const missing = SECTION_IDS.filter((s) => !sections.has(s));
  if (missing.length) throw new Error(`Required source sections are missing: ${missing.join(", ")}`);
  if (new Set(content.entries.map((e) => e.id)).size !== content.entries.length) throw new Error("Duplicate source entry ids.");
  const empty = content.entries.filter((e) => !e.plain.trim());
  if (empty.length) throw new Error(`Source entries lack narratable plain text: ${empty.map((e) => e.id).join(", ")}`);
}

export interface PreparedVideo {
  directory: string;
  props: DirectedVideoProps;
  audioBuffer: Buffer;
  manifest: Record<string, unknown>;
}

/** Canonical workflow shared by CLI and future delivery integrations. No patient/app state writes. */
export async function prepareDirectedVideo(rawIntake: Intake, options: GenerationOptions = {}): Promise<PreparedVideo> {
  const intake = IntakeSchema.parse(rawIntake);
  const filter = toPersonalizationFilter(intake);
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const cacheRoot = options.cacheRoot ?? path.join(webRoot, ".video-cache");
  const outputRoot = options.outputRoot ?? path.join(webRoot, "out", "directed");
  const progress = options.onProgress ?? (() => {});
  const content = loadRegimenContent(intake.regimenId);
  validateSourceCoverage(content);
  // Canonical source order preserves time sequences and avoids a redundant ordering model call.
  const groups = groupEntriesBySection(content.entries);
  const rewriteVersion = implementationDigest(["rewrite.ts", "guardrail.ts", "source-packet.ts", "narration.ts", "select.ts", "../intake/schema.ts"]);
  const voiceVersion = implementationDigest(["tts.ts"]);
  const alignmentVersion = implementationDigest(["align.ts", "timing.ts", "forced-align.ts", "forced-align.py", "alignment-requirements.txt"]);
  const speechReviewVersion = implementationDigest(["speech-fidelity.ts", "timing.ts"]);
  const outputs: SectionPipelineOutput[] = [];
  const stageKeys: Record<string, unknown>[] = [];
  const acousticDiagnostics: Record<string, unknown>[] = [];
  const speechReviews: Record<string, unknown>[] = [];
  for (const group of groups) {
    const candidateKey = objectDigest({ source: group.entries, filter });
    const narrationKey = objectDigest({ source: group.entries, filter, rewriteVersion });
    let rewrite = readStage<RewriteResult>(cacheRoot, "narration", narrationKey);
    if (!rewrite) {
      const candidate = readStage<RewriteResult>(cacheRoot, "narration-candidate", candidateKey);
      if (candidate) {
        progress(`${group.sectionId}: rechecking the saved script with current source validators`);
        const checked = await validateRewrittenNarration(group.entries, filter, candidate.chunks);
        if (checked.pass) rewrite = { chunks: candidate.chunks, script: candidate.chunks.map((c) => c.text).join(" ") };
      }
      if (!rewrite) {
        progress(`${group.sectionId}: rewriting and checking every source instruction`);
        rewrite = await rewriteNarration(group.entries, filter);
      }
      saveStage(cacheRoot, "narration", narrationKey, rewrite);
    } else progress(`${group.sectionId}: checked narration cache hit`);
    saveStage(cacheRoot, "narration-candidate", candidateKey, rewrite);

    const expectedIds = group.entries.map((e) => e.id);
    if (rewrite.chunks.length !== expectedIds.length || rewrite.chunks.some((c, i) => c.entryId !== expectedIds[i] || !c.text.trim())) throw new Error(`Invalid checked narration cache: ${group.sectionId}`);
    const script = rewrite.chunks.map((c) => c.text).join(" ");
    const audioKey = objectDigest({ script, voiceTone: intake.voiceTone, voiceVersion });
    type AudioMeta = Omit<SynthesizeResult, "audioBuffer"> & { sha256: string; segments?: SegmentedSpeechEvidence[] };
    let audioMeta = readStage<AudioMeta>(cacheRoot, "audio", audioKey);
    const audioFile = audioCachePath(cacheRoot, audioKey);
    let audioBuffer: Buffer | undefined;
    if (audioMeta && existsSync(audioFile)) {
      audioBuffer = readFileSync(audioFile);
      if (digest(audioBuffer) !== audioMeta.sha256) { audioBuffer = undefined; audioMeta = null; }
    }
    const uncheckedAudioBuffer = audioBuffer;
    const uncheckedAudioMeta = audioMeta;
    if (audioBuffer && audioMeta) {
      const priorReview = readStage<SpeechReview>(cacheRoot, "speech-review", objectDigest({ audio: audioMeta.sha256, script, speechReviewVersion }));
      if (!priorReview || !speechReviewPassed(priorReview, script)) { audioBuffer = undefined; audioMeta = null; }
    }
    if (!audioBuffer || !audioMeta) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const attemptKey = objectDigest({ audioKey, attempt });
        const attemptFile = audioCachePath(cacheRoot, attemptKey);
        let candidateMeta = readStage<AudioMeta>(cacheRoot, "audio-attempt", attemptKey) ?? (attempt === 0 ? uncheckedAudioMeta : null);
        let candidateBuffer: Buffer | undefined = candidateMeta && existsSync(attemptFile) ? readFileSync(attemptFile) :
          attempt === 0 ? uncheckedAudioBuffer : undefined;
        if (!candidateBuffer || digest(candidateBuffer) !== candidateMeta?.sha256) {
          progress(`${group.sectionId}: synthesizing ${intake.voiceTone} narration (attempt ${attempt + 1})`);
          const audio = await synthesizeNarration(script, intake.voiceTone);
          candidateBuffer = audio.audioBuffer;
          const { audioBuffer: _, ...metadata } = audio;
          candidateMeta = { ...metadata, sha256: digest(candidateBuffer) };
          mkdirSync(path.dirname(attemptFile), { recursive: true });
          writeFileSync(attemptFile, candidateBuffer);
          saveStage(cacheRoot, "audio-attempt", attemptKey, candidateMeta);
        }
        const reviewKey = objectDigest({ audio: candidateMeta!.sha256, script, speechReviewVersion });
        let speechReview = readStage<SpeechReview>(cacheRoot, "speech-review", reviewKey);
        if (!speechReview) {
          progress(`${group.sectionId}: checking actual spoken drug names, quantities and instructions`);
          speechReview = await reviewSpokenNarration(candidateBuffer, script);
          saveStage(cacheRoot, "speech-review", reviewKey, speechReview);
        }
        if (!speechReviewPassed(speechReview, script)) {
          progress(`${group.sectionId}: speech rejected: ${speechReviewFailure(speechReview, script)}`);
          continue;
        }
        audioBuffer = candidateBuffer;
        audioMeta = candidateMeta;
        writeFileSync(audioFile, audioBuffer);
        saveStage(cacheRoot, "audio", audioKey, audioMeta);
        break;
      }
      if (!audioBuffer || !audioMeta) {
        progress(`${group.sectionId}: whole-section attempts rejected; retrying smaller, independently reviewed passages`);
        const segmented = await synthesizeReviewedSegments(rewrite.chunks, intake.voiceTone, {
          cacheRoot, onProgress: (message) => progress(`${group.sectionId}: ${message}`),
        });
        audioBuffer = segmented.audio.audioBuffer;
        const { audioBuffer: _, ...metadata } = segmented.audio;
        audioMeta = { ...metadata, sha256: digest(audioBuffer), segments: segmented.segments };
        if (!speechReviewPassed(segmented.review, script)) throw new Error(`Segmented speech does not match the complete section: ${group.sectionId}`);
        writeFileSync(audioFile, audioBuffer);
        saveStage(cacheRoot, "audio", audioKey, audioMeta);
        saveStage(cacheRoot, "speech-review", objectDigest({ audio: audioMeta.sha256, script, speechReviewVersion }), segmented.review);
      }
    } else progress(`${group.sectionId}: speech-checked audio cache hit`);
    const sectionPcm = readLinear16Wav(audioBuffer, audioMeta.sampleRateHertz);
    if (audioMeta.segments) validateSegmentEvidence(sectionPcm, script, audioMeta.sampleRateHertz, audioMeta.segments);
    speechReviews.push({ sectionId: group.sectionId, audioDigest: audioMeta.sha256, pcmDigest: digest(sectionPcm), pcmBytes: sectionPcm.length,
      sampleRateHertz: audioMeta.sampleRateHertz, script, segments: audioMeta.segments,
      version: speechReviewVersion, report: readStage<SpeechReview>(cacheRoot, "speech-review", objectDigest({ audio: audioMeta.sha256, script, speechReviewVersion })) });

    const alignmentKey = objectDigest({ audio: audioMeta.sha256, script, alignmentVersion });
    let alignment = readStage<ForcedAlignmentResult>(cacheRoot, "forced-alignment", alignmentKey);
    if (!alignment) {
      progress(`${group.sectionId}: measuring script timing against the speech waveform locally`);
      alignment = (await forceAlignNarration(audioBuffer, rewrite.chunks, audioMeta.sampleRateHertz)).alignment;
      saveStage(cacheRoot, "forced-alignment", alignmentKey, alignment);
    } else progress(`${group.sectionId}: alignment cache hit`);
    const timing = reconcileNarrationTiming(rewrite.chunks, alignment.words, audioMeta.durationSeconds);
    saveStage(cacheRoot, "timing-diagnostics", alignmentKey, timing.diagnostics);
    assertReliableTiming(timing);
    acousticDiagnostics.push({ sectionId: group.sectionId, audioDigest: audioMeta.sha256, ...alignment.diagnostics });
    outputs.push({ sectionId: group.sectionId, hash: narrationKey, chunks: rewrite.chunks,
      tts: audioMeta, audioBuffer, words: alignment.words, durationSeconds: audioMeta.durationSeconds });
    stageKeys.push({ sectionId: group.sectionId, narrationKey, audioKey, alignmentKey, speechReviewVersion });
    progress(`${group.sectionId}: source, speech and timing ready (${audioMeta.durationSeconds.toFixed(1)}s)`);
  }

  const stitched = stitchSections(outputs);
  const timing = reconcileNarrationTiming(stitched.chunks, stitched.words, stitched.durationSeconds);
  assertReliableTiming(timing);
  const captionTrack = buildDirectedCaptionTrack(timing);
  if (!captionTrack.diagnostics.valid) {
    saveStage(cacheRoot, "caption-diagnostics", objectDigest(stageKeys), captionTrack.diagnostics);
    throw new Error(`Caption readability failed: ${captionTrack.diagnostics.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; ")}`);
  }
  const input: DirectorInput = { content, filter, chunks: stitched.chunks, entries: timing.entries, words: timing.words, totalSeconds: stitched.durationSeconds };
  const directionKey = directionCacheKey(input);
  let direction = readStage<VisualDirection>(cacheRoot, "direction", directionKey);
  if (!direction || !direction.transitionPlan || validateDirection(direction, content, input).length > 0) {
    progress("Creative direction: planning scenes, actions, close-ups and transitions");
    direction = await directVideo(input);
    saveStage(cacheRoot, "direction", directionKey, direction);
  } else progress("Creative direction: validated storyboard cache hit");

  const variantKey = objectDigest({ intake, stageKeys, directionKey });
  const directory = path.join(outputRoot, `${intake.regimenId}-${intake.voiceTone}-${intake.educationLevel}-${intake.depthPreference}`, variantKey.slice(0, 12));
  mkdirSync(directory, { recursive: true });
  let priorManifest: Record<string, any> | undefined;
  try { priorManifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")); } catch { /* First generation, or invalid manifest: regenerate review state. */ }
  writeFileSync(path.join(directory, "narration.wav"), stitched.audioBuffer);
  writeFileSync(path.join(directory, "narration.txt"), stitched.chunks.map((c) => c.text).join("\n\n"));
  writeFileSync(path.join(directory, "captions.vtt"), captionTrack.vtt);
  writeJson(path.join(directory, "captions.json"), captionTrack.captionJson);
  writeJson(path.join(directory, "storyboard.json"), direction);
  writeJson(path.join(directory, "timing.json"), timing);
  writeJson(path.join(directory, "acoustic-review.json"), acousticDiagnostics);
  writeJson(path.join(directory, "speech-review.json"), speechReviews);
  const props: DirectedVideoProps = { direction, audioSrc: "narration.wav", captions: captionTrack.captions, captionsEnabled: true, reducedMotion: false };
  writeJson(path.join(directory, "props.json"), props);
  const manifest: Record<string, any> = {
    version: 1, variantKey, intake, sourceDigest: objectDigest(content), audioDigest: digest(stitched.audioBuffer), files: bundleChecksums(directory),
    stageKeys, directionKey, durationSeconds: stitched.durationSeconds,
    checkerVersions: { rewriteVersion, voiceVersion, alignmentVersion, speechReviewVersion },
    sections: SECTION_IDS, entryIds: stitched.chunks.map((c) => c.entryId),
    sourceReview: "AI-drafted source; clinical approval not established",
    status: "prepared", visualReview: "pending", generatedAt: new Date().toISOString(),
    checks: { sourceSections: true, narrationStructure: true, narrationSafety: true,
      speechFidelity: "automated audio review passed; human listening review pending",
      visualWarnings: content.entries.map(safetyDisplayWarning).filter(Boolean),
      timing: timing.diagnostics, captions: captionTrack.diagnostics, direction: validateDirection(direction, content, input) },
  };
  if (priorManifest && objectDigest(priorManifest.files) === objectDigest(manifest.files) && reusableRender(directory, priorManifest)) {
    for (const field of ["status", "visualReview", "video", "videoDigest", "rendererDigest", "review", "generatedAt"]) {
      if (priorManifest[field] !== undefined) manifest[field] = priorManifest[field];
    }
  }
  writeJson(path.join(directory, "manifest.json"), manifest);
  progress(`Review bundle prepared: ${directory}`);
  return { directory, props, audioBuffer: stitched.audioBuffer, manifest };
}
