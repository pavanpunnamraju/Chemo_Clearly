import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadRegimenContent } from "../lib/content";
import { toPersonalizationFilter } from "../lib/intake/schema";
import { authoredDecisions, compileDirection, type DirectorInput } from "../lib/video/director";
import { bundleDirectedVideo } from "../lib/video/render-directed";
import { writeJson } from "../lib/video/stage-cache";
import type { DirectedVideoProps } from "../lib/video/direction-types";

async function main() {
  const content = loadRegimenContent("rchop");
  const targets = ["overview", "daily_life.exercise", "side_effects.bladder-irritation", "emergency.fever-during-your-low-blood-cell-window", "fertility_intimacy"];
  const entries = targets.map((id) => content.entries.find((e) => e.id === id)).filter((e) => e !== undefined);
  if (entries.length !== targets.length) throw new Error(`Preview source IDs missing. Available: ${content.entries.map((e) => e.id).join(", ")}`);
  const totalSeconds = entries.length * 12;
  const input: DirectorInput = { content: { ...content, entries },
    filter: toPersonalizationFilter({ regimenId: "rchop", voiceTone: "friendly", educationLevel: "some_college", depthPreference: "short" }),
    chunks: entries.map((e) => ({ entryId: e.id, text: e.plain })),
    entries: entries.map((e, i) => ({ entryId: e.id, startSeconds: i * 12, endSeconds: (i + 1) * 12 })), words: [], totalSeconds };
  const direction = compileDirection(input, authoredDecisions(input), "authored");
  const props: DirectedVideoProps = { direction, audioSrc: "", captions: [
    { text: "Motion preview — sample staging, without narration.", startSeconds: 0, endSeconds: totalSeconds },
  ], captionsEnabled: true };
  const directory = path.resolve("out", "directed-motion-preview");
  mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, "props.json"), props);
  const { renderStill, renderMedia } = await import("@remotion/renderer");
  const prepared = await bundleDirectedVideo(props, Buffer.alloc(0));
  try {
    for (const seconds of [2, 7, 11.6, 12.2, 17, 26, 31, 38, 43, 52]) {
      await renderStill({ ...prepared, inputProps: props, puppeteerInstance: prepared.browser,
        output: path.join(directory, `frame-${seconds}.png`), frame: Math.round(seconds * 30) });
    }
    await renderMedia({ ...prepared, inputProps: props, puppeteerInstance: prepared.browser, codec: "h264",
      outputLocation: path.join(directory, "motion-preview.mp4"), crf: 18, concurrency: 3 });
  } finally { await prepared.browser.close({ silent: true }); }
  console.log(directory);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
