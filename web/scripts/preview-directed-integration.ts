import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadRegimenContent } from "../lib/content";
import { toPersonalizationFilter } from "../lib/intake/schema";
import { authoredDecisions, compileDirection, displayMessages, eligibleAssets, validateDirection, type DirectorInput } from "../lib/video/director";
import type { DirectedVideoProps } from "../lib/video/direction-types";
import type { TimedCaption } from "../lib/video/captions";
import { buildSourcePacket, sourcePacketText } from "../lib/video/source-packet";
import { bundleDirectedVideo } from "../lib/video/render-directed";
import { directedRendererDigest } from "../lib/video/review-bundle";
import { digest, writeJson } from "../lib/video/stage-cache";

// This is deliberately a local, silent preview, not a verified speech bundle.
// The standalone approved study directories are never written by this script.
const loopPreview = process.argv.includes("--loop-preview");
const directory = path.resolve(loopPreview ? "out/directed-loop-preview" : "out/directed-integration-preview");
const file = (name: string) => path.join(directory, name);
const fps = 30;
const shotSeconds = loopPreview ? 24 : 12;

function previewCaptions(text: string, startSeconds: number): TimedCaption[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (!lines.length || lines.at(-1)!.length + word.length + 1 > 38) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2).join("\n"));
  return pages.map((text, i) => ({ text, startSeconds: startSeconds + i * shotSeconds / pages.length,
    endSeconds: startSeconds + (i + 1) * shotSeconds / pages.length }));
}

function prepare() {
  const content = loadRegimenContent("rchop");
  const targetIds = ["side_effects.bladder-irritation", "side_effects.nerve-tingling-numbness", "emergency.when-to-call-911-vs-your-care-team"];
  const entries = targetIds.map((id) => {
    const entry = content.entries.find((candidate) => candidate.id === id);
    assert.ok(entry, `Preview source missing: ${id}`);
    return entry;
  });
  const packets = entries.map((entry) => buildSourcePacket(entry, false));
  const passage = (i: number, field: string) => {
    const found = packets[i]!.passages.find((candidate) => candidate.field === field);
    assert.ok(found, `Preview passage missing: ${targetIds[i]}:${field}`);
    return found;
  };
  const hydration = passage(0, "selfCare");
  const ordinaryCall = passage(1, "callTeamIf");
  const emergency = passage(2, "plain");
  // Keep the whole 911 instruction and its complete symptom list. The following
  // care-team sentence refers to "above" and is not a standalone preview excerpt.
  const emergencySentence = emergency.text.match(/^Call 911 or go to the ER for:[\s\S]+?life-threatening\./)?.[0];
  assert.ok(emergencySentence, "Emergency source wording changed; recheck excerpt context");
  const excerpts = [
    { entryId: targetIds[0], sourceRef: hydration.sourceRef, sourceText: hydration.text, displayText: hydration.text, kind: "complete-source-field" },
    { entryId: targetIds[1], sourceRef: ordinaryCall.sourceRef, sourceText: ordinaryCall.text,
      displayText: `Call your care team if: ${ordinaryCall.text}`, kind: "complete-source-field-with-callTeamIf-label" },
    { entryId: targetIds[2], sourceRef: emergency.sourceRef, sourceText: emergencySentence, displayText: emergencySentence, kind: "complete-source-sentence" },
  ];
  const input: DirectorInput = { content: { ...content, entries },
    filter: toPersonalizationFilter({ regimenId: "rchop", voiceTone: "friendly", educationLevel: "some_college", depthPreference: "short" }),
    chunks: packets.map((packet) => ({ entryId: packet.entryId, text: sourcePacketText(packet) })),
    entries: entries.map((entry, i) => ({ entryId: entry.id, startSeconds: i * shotSeconds, endSeconds: (i + 1) * shotSeconds })),
    words: [], totalSeconds: shotSeconds * entries.length };
  const decisions = authoredDecisions(input).map((decision, i) => ({ ...decision,
    assetId: i === 0 ? "patient-hydration" : "patient-contact", action: i === 0 ? "drink" : "call",
    camera: i === 0 ? "detail" as const : "push-in" as const,
    staging: i === 1 ? "right" as const : "left" as const,
    transition: i === 0 ? "zoom-through" as const : i === 1 ? "match-cut" as const : "settle" as const,
    messageIndex: 0, cue: "", rationale: `Local integration preview: ${excerpts[i]!.sourceRef}; full source packet retained. Synthetic silent timing only.` }));
  const direction = compileDirection(input, decisions, "authored");
  assert.deepEqual(validateDirection(direction, input.content, input), []);
  const infusion = content.entries.find((entry) => entry.id === "emergency.infusion-reaction");
  assert.ok(infusion);
  assert.ok(!eligibleAssets(infusion).some((choice) => choice.actions.includes("call")), "Infusion reactions must alert nearby staff, not route to calling");
  const fever = content.entries.find((entry) => entry.id === "emergency.fever-during-your-low-blood-cell-window");
  assert.ok(fever);
  const feverInput: DirectorInput = { ...input, content: { ...content, entries: [fever] },
    chunks: [{ entryId: fever.id, text: sourcePacketText(buildSourcePacket(fever, false)) }],
    entries: [{ entryId: fever.id, startSeconds: 0, endSeconds: shotSeconds }], totalSeconds: shotSeconds };
  const feverDirection = compileDirection(feverInput, authoredDecisions(feverInput), "authored");
  assert.equal(feverDirection.shots[0]!.safetyCard?.criteria.length, 2);
  assert.equal(feverDirection.shots[0]!.action, "temperature");
  const props: DirectedVideoProps = { direction, audioSrc: "", captions: excerpts.flatMap((excerpt, i) => previewCaptions(excerpt.displayText, i * shotSeconds)), captionsEnabled: true };
  const feverProps: DirectedVideoProps = { direction: feverDirection, audioSrc: "", captions: [], captionsEnabled: false, reducedMotion: true };
  const messageEntry = content.entries.find((entry) => entry.id === "emergency.serious-allergic-or-skin-reaction");
  assert.ok(messageEntry);
  const messageInput: DirectorInput = { ...feverInput, content: { ...content, entries: [messageEntry] },
    chunks: [{ entryId: messageEntry.id, text: sourcePacketText(buildSourcePacket(messageEntry, false)) }],
    entries: [{ entryId: messageEntry.id, startSeconds: 0, endSeconds: shotSeconds }] };
  const messageIndex = displayMessages(messageEntry).findIndex((message) => message.length > 80 && message !== messageEntry.name);
  assert.ok(messageIndex > 0, "Expected a complete source-bound message body for layout regression");
  const messageDirection = compileDirection(messageInput, authoredDecisions(messageInput).map((decision) => ({ ...decision, messageIndex })), "authored");
  const messageProps: DirectedVideoProps = { direction: messageDirection, audioSrc: "", reducedMotion: true,
    captions: previewCaptions(messageDirection.shots[0]!.message, 0), captionsEnabled: true };
  mkdirSync(directory, { recursive: true });
  writeJson(file("props.json"), props);
  writeJson(file("fever-props.json"), feverProps);
  writeJson(file("message-props.json"), messageProps);
  writeJson(file("source-evidence.json"), { preview: true, completeCandidate: false, sourceStatus: "approval-not-established", packets, excerpts,
    excerptScope: "Selected source passages for artwork integration only. This does not replace complete source-packet narration or omit instructions from a candidate.",
    checks: { sourceActionEligibility: true, directionValidation: true, infusionReactionCallExcluded: true, feverAlternativesPreserved: true },
    approvedReferences: [
      { name: "Calling", videoSha256: "c7d375cceb315e737add215cc867b860cdafb5aaa785290b2cf48d68b9a603df" },
      { name: "Drinking blue 1.15x", videoSha256: "e340f810d68cc82e669c12936a80b10b21aa7f2c14dc9342117c6c66012e23b3" },
    ] });
  return { props, feverProps, messageProps };
}

interface LayoutReport {
  frame: number; error?: string;
  texts: { overflowX: boolean; overflowY: boolean; outsideViewport: boolean }[];
  overlaps: unknown[];
}

async function main() {
  const { props, feverProps, messageProps } = prepare();
  if (process.argv.includes("--prepare-only")) { console.log(`Prepared and source-validated silent integration preview: ${directory}`); return; }
  const { renderStill, renderMedia, selectComposition } = await import("@remotion/renderer");
  const prepared = await bundleDirectedVideo(props, Buffer.alloc(0));
  const rendererDigest = directedRendererDigest();
  const keyframes = [...new Set(props.direction.shots.flatMap((shot, index) => {
    const start = Math.round(shot.startSeconds * fps);
    const end = Math.round(shot.endSeconds * fps) - 1;
    const local = index === 0 ? [0, 45, 90, 104, 130, 150, 182, 248, 300, 345, 359] : [0, 1, 15, 45, 105, 138, 150, 180, 255, 300, 359];
    // The second action and its resting seam must be visible as well as the
    // original first-cycle contact frames. Sampling remains on the shot clock.
    const repeats = loopPreview ? (index === 0 ? [285, 293, 294, 295, 375, 405, 450, 510, 690] : [315, 329, 330, 331, 435, 468, 510, 585, 690]) : [];
    return [...local, ...repeats].map((frame) => start + frame).concat(end);
  }))].sort((a, b) => a - b);
  const layoutReports: (LayoutReport & { failed: boolean; mode: string })[] = [];
  const captureLayout = async (inputProps: DirectedVideoProps, frame: number, mode: string, output?: string) => {
    const captured: LayoutReport[] = [];
    // Remotion renders composition.props as resolved props. QA must be present
    // during composition selection, not only in renderStill's inputProps.
    const qaProps = { ...inputProps, qaMode: true };
    const composition = await selectComposition({ serveUrl: prepared.serveUrl,
      id: "DirectedPatientVideo", inputProps: qaProps, puppeteerInstance: prepared.browser });
    await renderStill({ ...prepared, composition, inputProps: qaProps, puppeteerInstance: prepared.browser,
      frame, output, logLevel: "error", onBrowserLog: (log) => {
        const marker = "DIRECTED_LAYOUT_QA ";
        const index = log.text.indexOf(marker);
        if (index >= 0) captured.push(JSON.parse(log.text.slice(index + marker.length)) as LayoutReport);
      } });
    const report = [...captured].reverse().find((candidate) => candidate.frame === frame);
    assert.ok(report && !report.error, `Missing layout telemetry at ${mode} frame ${frame}: ${report?.error}`);
    layoutReports.push({ ...report, mode, failed: report.texts.some((text) => text.overflowX || text.overflowY || text.outsideViewport) || report.overlaps.length > 0 });
  };
  try {
    const propsDigest = digest(readFileSync(file("props.json")));
    const checkpoint = existsSync(file("stills-evidence.json")) ? JSON.parse(readFileSync(file("stills-evidence.json"), "utf8")) : undefined;
    const canReuseStills = process.argv.includes("--reuse-stills") && checkpoint?.rendererDigest === rendererDigest && checkpoint?.propsDigest === propsDigest &&
      keyframes.every((frame) => existsSync(file(`frame-${frame}.png`)) && checkpoint.files?.[`frame-${frame}.png`] === digest(readFileSync(file(`frame-${frame}.png`))));
    if (canReuseStills) console.log("Reusing checksum-verified keyframes from the same renderer and props.");
    else {
      for (const frame of keyframes) {
        await renderStill({ ...prepared, inputProps: props, puppeteerInstance: prepared.browser, frame, output: file(`frame-${frame}.png`) });
      }
      writeJson(file("stills-evidence.json"), { rendererDigest, propsDigest,
        files: Object.fromEntries(keyframes.map((frame) => [`frame-${frame}.png`, digest(readFileSync(file(`frame-${frame}.png`)))])) });
    }
    const layoutFrames = [...new Set(props.captions.map((caption) => Math.floor((caption.startSeconds + caption.endSeconds) * fps / 2)))];
    for (const frame of layoutFrames) await captureLayout({ ...props, reducedMotion: true }, frame, "stationary-rendered-DOM");
    const holdFrames = props.direction.shots.map((shot) => Math.round(shot.startSeconds * fps) + 150);
    for (const frame of holdFrames) {
      await captureLayout(props, frame, "full-motion-hold-rendered-DOM");
      await captureLayout({ ...props, reducedMotion: true }, frame, "reduced-motion", file(`reduced-${frame}.png`));
    }
    if (loopPreview) for (const shot of props.direction.shots) {
      await captureLayout(props, Math.round((shot.startSeconds + 15) * fps), "repeated-motion-hold-rendered-DOM");
    }
    await captureLayout(feverProps, 150, "fever-regression", file("fever-card.png"));
    await captureLayout(messageProps, 150, "source-message-layout-control", file("source-message-layout.png"));
    if (!process.argv.includes("--stills-only")) {
      let lastProgress = -1;
      await renderMedia({ ...prepared, inputProps: props, puppeteerInstance: prepared.browser, codec: "h264", muted: true,
        enforceAudioTrack: false, crf: 18, concurrency: 3, outputLocation: file("integration-preview.mp4"),
        onProgress: ({ progress }) => {
          const percent = Math.floor(progress * 10) * 10;
          if (percent > lastProgress) { console.log(`Integration render: ${percent}%`); lastProgress = percent; }
        } });
      console.log();
    }
  } finally { await prepared.browser.close({ silent: true }); }
  const failures = layoutReports.filter((report) => report.failed);
  writeJson(file("layout-qa.json"), { preview: true, rendererDigest, valid: failures.length === 0, failures: failures.length, reports: layoutReports });
  const stillsOnly = process.argv.includes("--stills-only");
  writeJson(file("render-evidence.json"), { preview: true, silent: true, timing: "synthetic preview clock; no speech synthesis, acoustic validation or speech synchronization evidence",
    fps, totalFrames: fps * props.direction.totalSeconds, durationSeconds: props.direction.totalSeconds, rendererDigest, loopPreview,
    propsDigest: digest(readFileSync(file("props.json"))), keyframes, layoutValid: failures.length === 0,
    videoDigest: stillsOnly ? null : digest(readFileSync(file("integration-preview.mp4"))), humanVisualApproval: "pending", clinicalApproval: "not-established" });
  writeFileSync(file("REVIEW.md"), `# Directed ${loopPreview ? "loop" : "integration"} preview\n\n${props.direction.totalSeconds} seconds, silent. Caption intervals are synthetic preview timing; they do not establish speech synchronization.\n\nThe actual DirectedPatientVideo renderer shows drinking (0–${shotSeconds} s), ordinary care-team calling (${shotSeconds}–${shotSeconds * 2} s), and emergency calling (${shotSeconds * 2}–${shotSeconds * 3} s). Source excerpts and complete source packets are recorded in source-evidence.json. The fever card is a separate regression still.\n\n${loopPreview ? "This longer preview checks repeated complete actions at the approved motion speed, with calm pauses between cycles. The source text remains a selected excerpt and does not represent the eventual narration length.\n\n" : ""}The two original motion studies remain approved references. This new integrated rendering has human visual review pending. Clinical approval is not established.\n\nInspect action/contact continuity, ${loopPreview ? "cycle seams and pauses, " : ""}transitions, captions, credit placement, and phone landscape framing. The layout report contains stationary and motion-hold DOM checks; transition readability and natural motion require watching the MP4.\n\nArtwork: [Calling, Storyset / Freepik](https://storyset.com/illustration/calling/pana) and [Drinking water, Storyset / Freepik](https://storyset.com/illustration/drinking-water/pana).\n`);
  if (!stillsOnly) {
    const { inspectDirectedIntegration } = await import("./inspect-directed-integration");
    await inspectDirectedIntegration(directory);
  }
  console.log(`Integration preview: ${directory}; ${failures.length} layout failures.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
