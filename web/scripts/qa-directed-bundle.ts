import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { bundleDirectedVideo } from "../lib/video/render-directed";
import { loadVerifiedBundle, directedRendererDigest, bundleChecksums } from "../lib/video/review-bundle";
import { digest, writeJson } from "../lib/video/stage-cache";
import type { DirectedShot, DirectedVideoProps } from "../lib/video/direction-types";
import { activeArtworkBeat, libraryDiversity } from "../lib/video/library-direction";
import { approvedArtworkForShot } from "../lib/video/approved-artwork-motion";
import { messagePages } from "../video-composition/directed/DirectedScene";

const FPS = 30;
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
const comparable = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const pagesFor = (shot: DirectedShot) => shot.safetyCard || comparable(shot.message) === comparable(shot.headline) ? [] :
  messagePages(shot.message, shot.headline.length > 50 ? 100 : shot.headline.length > 22 ? 115 : 140);

interface LayoutText { role: string; text: string; overflowX: boolean; overflowY: boolean; outsideViewport: boolean }
interface LayoutReport {
  frame: number; error?: string; texts: LayoutText[]; overlaps: unknown[];
  artworkBeats?: (string | null)[]; libraryArtwork?: (string | null)[];
  approvedArtwork?: (string | null)[]; genericRigCount?: number;
}
interface AuditedFrame {
  frame: number; entryId?: string; sampleReasons: string[]; expectedArtwork?: string;
  issues: string[]; failed: boolean; report?: LayoutReport; still?: string; phoneStill?: string;
}

/** Screen pages use Sequence-local frames, whereas captions use the global
 * audio clock. Preserve that rounding distinction at every boundary sample.
 */
function samplingPlan(props: DirectedVideoProps) {
  const lastFrame = Math.ceil(props.direction.totalSeconds * FPS) - 1;
  const samples = new Map<number, Set<string>>();
  const keep = new Map<number, { entryId: string; sectionId: string; index: number }>();
  const addFrame = (frame: number, reason: string) => {
    const clamped = Math.min(lastFrame, Math.max(0, frame));
    const reasons = samples.get(clamped) ?? new Set<string>();
    reasons.add(reason); samples.set(clamped, reasons);
    return clamped;
  };
  const addTime = (time: number, reason: string) => addFrame(Math.round(time * FPS), reason);
  for (const [index, shot] of props.direction.shots.entries()) {
    const from = Math.round(shot.startSeconds * FPS), until = Math.round(shot.endSeconds * FPS);
    const bounded = (frame: number) => Math.max(from, Math.min(until - 1, frame));
    const duration = shot.endSeconds - shot.startSeconds;
    const quarter = addFrame(bounded(Math.round((shot.startSeconds + duration * .25) * FPS)), "shot-quarter");
    keep.set(quarter, { entryId: shot.entryId, sectionId: shot.sectionId, index });
    addFrame(bounded(Math.round((shot.startSeconds + duration * .8) * FPS)), "shot-late-hold");
    for (const beat of shot.artworkBeats ?? []) {
      // These offsets stay inside even a short beat instead of sampling its neighbor.
      const length = beat.endSeconds - beat.startSeconds;
      addTime(beat.startSeconds + Math.min(.4, length / 3), `artwork-start:${beat.artworkId}`);
      addTime(beat.endSeconds - Math.min(.15, length / 3), `artwork-end:${beat.artworkId}`);
    }
    const pages = pagesFor(shot);
    const pageTime = Math.max(.1, duration - .7) / Math.max(1, pages.length);
    for (let page = 1; page < pages.length; page++) {
      const boundary = from + Math.ceil((.35 + page * pageTime) * FPS);
      addFrame(bounded(boundary - 1), `message-page-${page}-before`);
      addFrame(bounded(boundary), `message-page-${page}-after`);
    }
    // Labels are separate from body pages and may appear only briefly at an
    // observed narration word. Check both their appearance and disappearance.
    for (const cue of shot.labelCues ?? []) {
      for (const [name, time] of [["start", cue.startSeconds], ["end", cue.endSeconds]] as const) {
        const boundary = from + Math.ceil((time - shot.startSeconds) * FPS);
        addFrame(bounded(boundary - 1), `source-label-${name}-before`);
        addFrame(bounded(boundary), `source-label-${name}-after`);
      }
    }
  }
  for (const caption of props.captions) addTime((caption.startSeconds + caption.endSeconds) / 2, "caption-midpoint");
  return { samples, keep, frames: [...samples.keys()].sort((a, b) => a - b) };
}

async function main() {
  const directory = process.argv[2];
  if (!directory) throw new Error("Usage: qa-directed-bundle.ts <bundle directory> [--preview] [--plan-only]");
  const preview = process.argv.includes("--preview");
  const verified = preview ? undefined : loadVerifiedBundle(directory);
  const source = verified ?? { props: JSON.parse(readFileSync(path.join(directory, "props.json"), "utf8")) as DirectedVideoProps, audioBuffer: Buffer.alloc(0) };
  const sourceChecksums = preview ? { "props.json": digest(readFileSync(path.join(directory, "props.json"))) } : bundleChecksums(directory);
  // Stationary layout audit: camera boundary crops are intentional. Motion is
  // reviewed separately on the unchanged full-motion output.
  const props: DirectedVideoProps = { ...source.props, reducedMotion: true, qaMode: true };
  const { samples, keep, frames } = samplingPlan(props);
  const primaryArtwork = props.direction.shots.map((shot) => ({ entryId: shot.entryId, artworkId: shot.artworkBeats?.[0]?.artworkId ?? null }));
  const diversity = { ...libraryDiversity(props.direction.shots), primaryArtwork,
    uniqueSourceEntries: new Set(primaryArtwork.map((item) => item.entryId)).size,
    uniquePrimaryArtwork: new Set(primaryArtwork.map((item) => item.artworkId).filter(Boolean)).size,
    allPrimaryArtworkUnique: primaryArtwork.every((item) => !!item.artworkId) && new Set(primaryArtwork.map((item) => item.artworkId)).size === primaryArtwork.length };
  const libraryPlan = props.direction.shots.some((shot) => !!shot.artworkBeats?.length);
  const output = path.join(directory, "layout-qa");
  mkdirSync(output, { recursive: true });
  const rendererDigest = directedRendererDigest();
  const metadata = { version: 2, rendererDigest, sourceChecksums, mode: "stationary-rendered-DOM", preview,
    timing: preview ? "Preview props; no speech synchronization claim." : "Verified bundle captions and narration timing; stationary layout only.",
    diversity, sampleCoverage: { sourceEntries: props.direction.shots.length, captions: props.captions.length,
      artworkBeats: props.direction.shots.reduce((sum, shot) => sum + (shot.artworkBeats?.length ?? 0), 0), frames: frames.length },
    humanVisualApproval: "not-assessed", clinicalApproval: "not-established" };
  writeJson(path.join(output, "sampling-plan.json"), { ...metadata,
    frames: frames.map((frame) => ({ frame, reasons: [...samples.get(frame)!], keepStill: keep.has(frame) })) });
  if (process.argv.includes("--plan-only")) {
    console.log(`Layout sampling planned: ${frames.length} frames, ${props.captions.length} caption intervals, ${props.direction.shots.length} source entries. No browser launched.`);
    return;
  }
  const { renderStill } = await import("@remotion/renderer");
  const prepared = await bundleDirectedVideo(props, source.audioBuffer);
  const reports: AuditedFrame[] = [];
  let savedFailures = 0, lastProgress = Date.now();
  writeJson(path.join(output, "report.json"), { ...metadata, status: "running", valid: false, sampledFrames: 0, reports });
  console.log(`Layout audit starting: ${frames.length} frames; verified=${!preview}; ${diversity.uniquePrimaryArtwork} primary illustrations.`);
  try {
    for (const [i, frame] of frames.entries()) {
      const captured: LayoutReport[] = [];
      const representative = keep.get(frame);
      const filename = representative ? `entry-${String(representative.index + 1).padStart(2, "0")}-${representative.entryId.replace(/[^a-zA-Z0-9_-]/g, "-")}.png` : undefined;
      await renderStill({ ...prepared, inputProps: props, puppeteerInstance: prepared.browser, frame,
        logLevel: "error", output: filename ? path.join(output, filename) : undefined,
        onBrowserLog: (log) => {
          const marker = "DIRECTED_LAYOUT_QA ";
          const start = log.text.indexOf(marker);
          if (start >= 0) captured.push(JSON.parse(log.text.slice(start + marker.length)) as LayoutReport);
        } });
      const report = [...captured].reverse().find((candidate) => candidate.frame === frame);
      if (!report || report.error) throw new Error(`Layout telemetry missing/failed at frame ${frame}: ${report?.error ?? "no report"}`);
      const shot = props.direction.shots.find((candidate) => frame >= Math.round(candidate.startSeconds * FPS) && frame < Math.round(candidate.endSeconds * FPS));
      const issues = report.texts.filter((text) => text.overflowX || text.overflowY || text.outsideViewport).map((text) => `Text overflow/outside viewport: ${text.role}`);
      if (report.overlaps.length) issues.push(`${report.overlaps.length} text overlaps`);
      if (libraryPlan && report.genericRigCount !== 0) issues.push(`Expected no generic patient rig; telemetry=${report.genericRigCount}`);
      let expectedArtwork: string | undefined;
      if (!shot) issues.push("No shot on the rendered narration clock");
      else {
        const localSeconds = (frame - Math.round(shot.startSeconds * FPS)) / FPS;
        const absoluteSeconds = shot.startSeconds + localSeconds;
        expectedArtwork = activeArtworkBeat(shot, absoluteSeconds)?.artworkId;
        if (!shot.safetyCard) {
          const approved = approvedArtworkForShot(shot);
          expectedArtwork ??= approved ? `approved-${approved}` : undefined;
          if (shot.artworkBeats?.length && !expectedArtwork) issues.push("Library beat gap on the narration clock");
          if (expectedArtwork) {
            const actual = [...(report.artworkBeats ?? []), ...(report.libraryArtwork ?? []),
              ...(report.approvedArtwork ?? []).filter(Boolean).map((id) => `approved-${id}`)];
            if (!actual.includes(expectedArtwork)) issues.push(`Artwork route mismatch: expected ${expectedArtwork}; got ${actual.join(",")}`);
            if (!report.texts.some((text) => text.role === "artwork-credit")) issues.push("Missing artwork credit");
          }
          const pages = pagesFor(shot);
          if (pages.length) {
            const pageTime = Math.max(.1, shot.endSeconds - shot.startSeconds - .7) / pages.length;
            const page = Math.min(pages.length - 1, Math.max(0, Math.floor((localSeconds - .35) / pageTime)));
            if (!report.texts.some((text) => text.role === "message" && normalized(text.text) === normalized(pages[page]!))) issues.push(`Source message page ${page + 1} mismatch`);
          }
        }
      }
      const expectedCaption = props.captions.find((caption) => frame / FPS >= caption.startSeconds && frame / FPS < caption.endSeconds);
      const actualCaption = report.texts.find((text) => text.role === "caption");
      if (props.captionsEnabled && expectedCaption && normalized(actualCaption?.text ?? "") !== normalized(expectedCaption.text)) issues.push("Actual timed caption text mismatch");
      if (!expectedCaption && actualCaption) issues.push("Caption shown outside its audio-clock interval");
      const audited: AuditedFrame = { frame, entryId: shot?.entryId, sampleReasons: [...samples.get(frame)!], expectedArtwork,
        issues, failed: issues.length > 0, report, still: filename };
      if (issues.length && !filename && savedFailures < 20) {
        audited.still = `failure-frame-${frame}.png`;
        await renderStill({ ...prepared, inputProps: props, puppeteerInstance: prepared.browser, frame, logLevel: "error", output: path.join(output, audited.still) });
        savedFailures++;
      }
      if (audited.still) {
        audited.phoneStill = audited.still.replace(/\.png$/, "-phone.png");
        await sharp(path.join(output, audited.still)).resize(640, 360).png().toFile(path.join(output, audited.phoneStill));
      }
      reports.push(audited);
      if (issues.length && reports.filter((item) => item.failed).length <= 12) console.log(`Layout failure ${shot?.entryId ?? "unknown"} frame ${frame}: ${issues.join("; ")}`);
      if (i === 0 || (i + 1) % 50 === 0 || Date.now() - lastProgress > 30000) {
        console.log(`Layout audit: ${i + 1}/${frames.length} frames; ${reports.filter((item) => item.failed).length} failures; entry=${shot?.entryId}`);
        lastProgress = Date.now();
        writeJson(path.join(output, "checkpoint.json"), { ...metadata, status: "running", sampledFrames: reports.length, reports });
      }
    }
  } finally { await prepared.browser.close({ silent: true }); }
  // Recheck immutable inputs after browser work. A changed source/checker/audio
  // bundle or renderer cannot inherit a passing audit from older bytes.
  if (!preview) loadVerifiedBundle(directory);
  const endingChecksums = preview ? { "props.json": digest(readFileSync(path.join(directory, "props.json"))) } : bundleChecksums(directory);
  const sourceUnchanged = JSON.stringify(endingChecksums) === JSON.stringify(sourceChecksums);
  const rendererUnchanged = directedRendererDigest() === rendererDigest;
  const failed = reports.filter((report) => report.failed);
  const valid = failed.length === 0 && sourceUnchanged && rendererUnchanged;
  writeJson(path.join(output, "report.json"), { ...metadata, status: "complete", sourceUnchanged, rendererUnchanged,
    valid, sampledFrames: reports.length, failures: failed.length, reports });
  console.log(`Measured stationary layout: ${reports.length} frames, ${failed.length} failures, unchanged inputs=${sourceUnchanged && rendererUnchanged}. Full-motion and human review remain separate.`);
  if (!valid) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
