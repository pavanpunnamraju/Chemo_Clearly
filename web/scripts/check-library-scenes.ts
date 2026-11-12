import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadRegimenContent } from "../lib/content";
import { toPersonalizationFilter } from "../lib/intake/schema";
import { authoredDecisions, compileDirection, validateDirection, type DirectorInput } from "../lib/video/director";
import type { DirectedShot, DirectedVideoProps } from "../lib/video/direction-types";
import type { TimedCaption } from "../lib/video/captions";
import { buildSourcePacket, sourcePacketText } from "../lib/video/source-packet";
import { activeArtworkBeat, libraryDiversity, planLibraryArtwork } from "../lib/video/library-direction";
import { contextArtworkRecipe } from "../lib/video/library-context-motion";
import { bundleDirectedVideo } from "../lib/video/render-directed";
import { directedRendererDigest } from "../lib/video/review-bundle";
import { digest } from "../lib/video/stage-cache";

const output = path.resolve("out/library-scenes-preview");
const fps = 30, secondsPerEntry = 12;
const argument = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const save = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

/** Exact source words, paginated only for this silent 12-second layout fixture.
 * These intervals are synthetic and must never become audio alignment evidence.
 */
function captionsFor(text: string, start: number): TimedCaption[] {
  const lines: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    if (!lines.length || lines.at(-1)!.length + word.length + 1 > 33) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += 2) pages.push(lines.slice(index, index + 2).join("\n"));
  return pages.map((text, index) => ({ text, startSeconds: start + index * secondsPerEntry / pages.length,
    endSeconds: start + (index + 1) * secondsPerEntry / pages.length }));
}

function prepare(regimenId: "rchop" | "ac-t") {
  const content = loadRegimenContent(regimenId);
  const selectedEntry = argument("--entry");
  const entries = selectedEntry ? content.entries.filter((entry) => entry.id === selectedEntry) : content.entries;
  assert.ok(entries.length, `No source entries for ${regimenId}/${selectedEntry}`);
  const packets = entries.map((entry) => buildSourcePacket(entry, false));
  const input: DirectorInput = { content: { ...content, entries },
    filter: toPersonalizationFilter({ regimenId, voiceTone: regimenId === "rchop" ? "friendly" : "hopeful",
      educationLevel: regimenId === "rchop" ? "some_college" : "basic", depthPreference: regimenId === "rchop" ? "short" : "detailed" }),
    chunks: packets.map((packet) => ({ entryId: packet.entryId, text: sourcePacketText(packet) })),
    entries: entries.map((entry, index) => ({ entryId: entry.id, startSeconds: index * secondsPerEntry, endSeconds: (index + 1) * secondsPerEntry })),
    words: [], totalSeconds: entries.length * secondsPerEntry };
  const direction = compileDirection(input, authoredDecisions(input), "authored");
  assert.deepEqual(validateDirection(direction, input.content, input), []);
  assert.equal(new Set(direction.shots.map((shot) => shot.entryId)).size, entries.length);
  const excerpts = packets.map((packet) => {
    const passage = packet.passages.find((candidate) => candidate.field === "plain") ?? packet.passages[0];
    assert.ok(passage, `Source packet has no excerpt: ${packet.entryId}`);
    return { entryId: packet.entryId, sourceRef: passage.sourceRef, text: passage.text };
  });
  const props: DirectedVideoProps = { direction, audioSrc: "", captionsEnabled: true, qaMode: true,
    captions: excerpts.flatMap((excerpt, index) => captionsFor(excerpt.text, index * secondsPerEntry)) };
  const diversity = libraryDiversity(direction.shots);
  const primaryArtwork = direction.shots.map((shot) => ({ entryId: shot.entryId, artworkId: shot.artworkBeats?.[0]?.artworkId }));
  return { regimenId, input, props, packets, excerpts, diversity, primaryArtwork };
}

type LayoutText = { role: string; text: string; overflowX: boolean; overflowY: boolean; outsideViewport: boolean };
interface LayoutReport {
  frame: number; error?: string; texts: LayoutText[]; overlaps: unknown[];
  artworkBeats?: string[]; libraryArtwork?: string[]; approvedArtwork?: string[]; genericRigCount?: number;
}
interface Capture { entryId: string; mode: string; frame: number; expectedArtwork?: string; output: string; errors: string[]; report?: LayoutReport }

async function main() {
  const onlyRegimen = argument("--regimen");
  const fixtures = (["rchop", "ac-t"] as const).filter((id) => !onlyRegimen || onlyRegimen === id).map(prepare);
  assert.ok(fixtures.length, "Expected --regimen rchop or ac-t");
  mkdirSync(output, { recursive: true });
  for (const fixture of fixtures) {
    const directory = path.join(output, fixture.regimenId);
    mkdirSync(path.join(directory, "stills"), { recursive: true });
    save(path.join(directory, "props.json"), fixture.props);
    save(path.join(directory, "source-evidence.json"), { preview: true, silent: true, timing: "Synthetic 12 seconds per source entry; no measured audio or speech synchronization evidence.",
      completeCandidate: false, clinicalApproval: "not-established", packets: fixture.packets, excerpts: fixture.excerpts,
      sourceEntries: fixture.input.content.entries.length, sections: [...new Set(fixture.input.content.entries.map((entry) => entry.sectionId))],
      diversity: fixture.diversity, primaryArtwork: fixture.primaryArtwork,
      uniquePrimaryArtwork: new Set(fixture.primaryArtwork.map((item) => item.artworkId)).size === fixture.primaryArtwork.length });
  }
  if (process.argv.includes("--prepare-only")) {
    console.log(JSON.stringify(fixtures.map(({ regimenId, diversity }) => ({ regimenId, diversity })), null, 2));
    return;
  }
  assert.ok(contextArtworkRecipe("context-community"), "Wait for context-community before bundling library-scene checks");
  const { renderStill, selectComposition } = await import("@remotion/renderer");
  const rendererDigest = directedRendererDigest();
  const prepared = await bundleDirectedVideo(fixtures[0]!.props, Buffer.alloc(0));
  const captures: Capture[] = [];
  const sampledAssets = new Set<string>();
  try {
    for (const fixture of fixtures) {
      const directory = path.join(output, fixture.regimenId);
      const compositionCache = new Map<string, Awaited<ReturnType<typeof selectComposition>>>();
      const capture = async (props: DirectedVideoProps, shot: DirectedShot, frame: number, mode: string) => {
        const qaProps = { ...props, qaMode: true };
        const key = digest(JSON.stringify(qaProps));
        let composition = compositionCache.get(key);
        if (!composition) {
          composition = await selectComposition({ serveUrl: prepared.serveUrl, id: "DirectedPatientVideo", inputProps: qaProps, puppeteerInstance: prepared.browser });
          compositionCache.set(key, composition);
        }
        const filename = path.join(directory, "stills", `${safe(shot.entryId)}-${mode}-${frame}.png`);
        const expectedArtwork = activeArtworkBeat(shot, frame / fps)?.artworkId;
        const result: Capture = { entryId: shot.entryId, mode, frame, expectedArtwork, output: filename, errors: [] };
        const reports: LayoutReport[] = [];
        try {
          await renderStill({ serveUrl: prepared.serveUrl, composition, puppeteerInstance: prepared.browser, inputProps: qaProps, frame,
            output: filename, logLevel: "error", onBrowserLog: (log) => {
              const prefix = "DIRECTED_LAYOUT_QA "; const start = log.text.indexOf(prefix);
              if (start >= 0) reports.push(JSON.parse(log.text.slice(start + prefix.length)) as LayoutReport);
            } });
          const report = [...reports].reverse().find((candidate) => candidate.frame === frame);
          result.report = report;
          if (!report || report.error) result.errors.push(`Missing valid layout telemetry: ${report?.error ?? "no event"}`);
          else {
            const overflow = report.texts.filter((text) => text.overflowX || text.overflowY || text.outsideViewport);
            if (overflow.length) result.errors.push(`Text outside/overflow: ${overflow.map((text) => text.role).join(", ")}`);
            if (report.overlaps.length) result.errors.push(`${report.overlaps.length} text overlaps`);
            if (report.genericRigCount === undefined) result.errors.push("Missing generic-rig browser telemetry");
            else if (report.genericRigCount !== 0) result.errors.push(`Unapproved generic patient rig rendered: ${report.genericRigCount}`);
            if (!shot.safetyCard && expectedArtwork) {
              const actual = [...(report.artworkBeats ?? []), ...(report.libraryArtwork ?? []), ...(report.approvedArtwork ?? []).map((id) => `approved-${id}`)];
              if (!actual.includes(expectedArtwork)) result.errors.push(`Artwork route mismatch: expected ${expectedArtwork}; rendered ${actual.join(", ") || "none"}`);
              if (!report.texts.some((text) => text.role === "artwork-credit")) result.errors.push("Missing artwork attribution");
            }
            if (!report.texts.some((text) => text.role === "caption")) result.errors.push("Missing synthetic source-excerpt caption");
          }
        } catch (error) { result.errors.push(String(error)); }
        captures.push(result);
        if (result.errors.length) console.log(`FAIL ${fixture.regimenId} ${shot.entryId} ${mode}: ${result.errors.join("; ")}`);
        save(path.join(directory, "layout-checkpoint.json"), { rendererDigest, captures: captures.filter((item) => item.output.startsWith(directory)) });
        return result;
      };
      for (const [index, shot] of fixture.props.direction.shots.entries()) {
        const frame = Math.round(shot.startSeconds * fps) + 115;
        await capture(fixture.props, shot, frame, "hold");
        await capture({ ...fixture.props, reducedMotion: true }, shot, frame, "reduced");
        const asset = shot.artworkBeats?.[0]?.artworkId;
        if (asset && !sampledAssets.has(asset)) {
          sampledAssets.add(asset);
          await capture(fixture.props, shot, Math.round(shot.startSeconds * fps) + 21, "motion-start");
        }
        const captions = fixture.props.captions.filter((caption) => caption.startSeconds >= shot.startSeconds && caption.endSeconds <= shot.endSeconds);
        const longest = [...captions].sort((a, b) => b.text.length - a.text.length)[0];
        if (longest) {
          const captionFrame = Math.floor((longest.startSeconds + longest.endSeconds) * fps / 2);
          if (Math.abs(captionFrame - frame) > 15) await capture({ ...fixture.props, reducedMotion: true }, shot, captionFrame, "longest-caption");
        }
        if ((index + 1) % 5 === 0) console.log(`${fixture.regimenId}: ${index + 1}/${fixture.props.direction.shots.length} entries inspected`);
      }
      // Discover each source-authorized detail without invented words. Assign its
      // actual source phrase a clearly synthetic 6-second cue in an isolated shot.
      const detailAssets = new Set<string>();
      for (const entry of fixture.input.content.entries) {
        const phrases = [entry.plain, entry.selfCare].filter((text): text is string => !!text).flatMap((text) => {
          const tokens = text.split(/\s+/);
          return tokens.map((_, index) => tokens.slice(index, index + 6));
        });
        for (const phrase of phrases) {
          const words = phrase.map((text, index) => ({ text, startSeconds: 6 + index * .3, endSeconds: 6.3 + index * .3 }));
          const beats = planLibraryArtwork(entry, { startSeconds: 0, endSeconds: secondsPerEntry }, words);
          const detail = beats[1];
          if (!detail || detailAssets.has(detail.artworkId)) continue;
          detailAssets.add(detail.artworkId);
          const packet = buildSourcePacket(entry, false);
          const detailInput: DirectorInput = { ...fixture.input, content: { ...fixture.input.content, entries: [entry] },
            chunks: [{ entryId: entry.id, text: sourcePacketText(packet) }], entries: [{ entryId: entry.id, startSeconds: 0, endSeconds: secondsPerEntry }], words, totalSeconds: secondsPerEntry };
          const direction = compileDirection(detailInput, authoredDecisions(detailInput), "authored");
          const props: DirectedVideoProps = { direction, audioSrc: "", qaMode: true, captionsEnabled: true,
            captions: captionsFor(entry.selfCare || entry.plain, 0) };
          save(path.join(directory, `${safe(detail.artworkId)}-synthetic-cue.json`), { timing: "Synthetic source-phrase timing for route/layout checks only.", sourcePhrase: phrase.join(" "), props });
          await capture(props, direction.shots[0]!, 255, `detail-${detail.artworkId}`);
        }
      }
      const holds = captures.filter((capture) => capture.output.startsWith(directory) && capture.mode === "hold" && existsSync(capture.output));
      const columns = 4, tileWidth = 320, tileHeight = 180;
      const tiles = await Promise.all(holds.map(async (hold, index) => ({ input: await sharp(hold.output).resize(tileWidth, tileHeight).png().toBuffer(),
        left: index % columns * tileWidth, top: Math.floor(index / columns) * tileHeight })));
      await sharp({ create: { width: tileWidth * columns, height: tileHeight * Math.ceil(holds.length / columns), channels: 4, background: "#F4F7F6" } }).composite(tiles).png().toFile(path.join(directory, "contact-sheet.png"));
      const own = captures.filter((item) => item.output.startsWith(directory));
      save(path.join(directory, "layout-evidence.json"), { preview: true, syntheticTiming: true, rendererDigest,
        propsDigest: digest(JSON.stringify(fixture.props)), valid: own.every((item) => !item.errors.length), captures: own,
        diversity: fixture.diversity, detailArtworkChecked: [...detailAssets], humanVisualApproval: "pending", clinicalApproval: "not-established" });
    }
  } finally { await prepared.browser.close({ silent: true }); }
  const failures = captures.filter((capture) => capture.errors.length);
  const rendererUnchanged = directedRendererDigest() === rendererDigest;
  save(path.join(output, "evidence.json"), { preview: true, silent: true, syntheticTiming: true, rendererDigest, rendererUnchanged,
    sampledFrames: captures.length, sourceEntries: fixtures.reduce((sum, fixture) => sum + fixture.props.direction.shots.length, 0),
    uniquePrimaryArtworkSampled: sampledAssets.size, valid: failures.length === 0 && rendererUnchanged, failures });
  console.log(`Library scenes: ${captures.length} frames; ${failures.length} failing frames; renderer unchanged=${rendererUnchanged}. ${output}`);
  if (failures.length || !rendererUnchanged) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
