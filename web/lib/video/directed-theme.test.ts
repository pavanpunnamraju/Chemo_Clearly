import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FRAME_BG, NAVY, TEAL, CORAL, FONT_FAMILY } from "../../video-composition/directed/DirectedTheme";
import { SCENE_COLORS } from "../../video-composition/directed/DirectedScene";

const legacy = readFileSync(new URL("../../video-composition/SlideVideo.tsx", import.meta.url), "utf8");
for (const [name, value] of Object.entries({ FRAME_BG, NAVY, TEAL, CORAL })) {
  assert(legacy.includes(`const ${name} = "${value}";`), `${name} must match the existing demo identity`);
}
assert(FONT_FAMILY.includes("Figtree"));
assert(Object.values(SCENE_COLORS).every((color) => color === FRAME_BG), "No section-specific theme replacement");
console.log("Directed theme matches the original demo palette and Figtree family.");
