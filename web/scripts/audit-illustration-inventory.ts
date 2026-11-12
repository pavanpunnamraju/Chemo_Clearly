import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadRegimenContent } from "../lib/content";
import { SECTION_IDS } from "../lib/content/types";

const root = path.resolve("public/illustrations");
const output = path.resolve("../docs/references/visual-inventory");
const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const files = walk(root).filter((file) => file.endsWith(".svg")).sort();
mkdirSync(output, { recursive: true });
const metadata = files.map((file, index) => {
  const source = readFileSync(file, "utf8");
  return { index: index + 1, file: path.relative(root, file), paths: (source.match(/<path\b/g) ?? []).length,
    groups: [...source.matchAll(/<g[^>]*id="([^"]+)"/g)].map((match) => match[1]) };
});
writeFileSync(path.join(output, "local-assets.json"), JSON.stringify(metadata, null, 2));
for (let page = 0; page * 12 < files.length; page++) {
  const batch = files.slice(page * 12, (page + 1) * 12);
  const tiles = await Promise.all(batch.map(async (file, i) => {
    const index = page * 12 + i + 1;
    const label = `${index}. ${path.basename(file).replace(/.*__/, "").replace(/\.svg$/, "")}`;
    const artwork = await sharp(file).resize(300, 280, { fit: "contain", background: "#f4f7f6" }).png().toBuffer();
    const caption = Buffer.from(`<svg width="300" height="40"><rect width="300" height="40" fill="#fff"/><text x="10" y="25" font-family="Arial" font-size="14" fill="#1c2b45">${label}</text></svg>`);
    return sharp({ create: { width: 300, height: 320, channels: 4, background: "#f4f7f6" } })
      .composite([{ input: artwork, left: 0, top: 0 }, { input: caption, left: 0, top: 280 }]).png().toBuffer();
  }));
  await sharp({ create: { width: 900, height: Math.ceil(batch.length / 3) * 320, channels: 4, background: "#f4f7f6" } })
    .composite(tiles.map((input, i) => ({ input, left: i % 3 * 300, top: Math.floor(i / 3) * 320 })))
    .png().toFile(path.join(output, `local-assets-${page + 1}.png`));
}
console.log(`Inventoried ${files.length} SVGs: ${output}`);
const bindings = JSON.parse(readFileSync(path.resolve("../docs/design/visual-entry-map.json"), "utf8")) as Record<string, string>;
const used = new Set<string>();
const coverage = ["rchop", "ac-t"].map((regimenId) => {
  const content = loadRegimenContent(regimenId);
  const entries = content.entries.map((entry) => {
    if (!bindings[entry.id]) throw new Error(`Visual inventory missing source entry: ${regimenId}/${entry.id}`);
    used.add(entry.id);
    return { entryId: entry.id, sectionId: entry.sectionId, concept: bindings[entry.id], tier: entry.tier,
      status: "planned-not-renderer-capability", sourceApproved: false };
  });
  for (const section of SECTION_IDS) if (!entries.some((entry) => entry.sectionId === section)) throw new Error(`Missing section: ${regimenId}/${section}`);
  return { regimenId, entryCount: entries.length, sectionCount: SECTION_IDS.length, entries };
});
for (const id of Object.keys(bindings)) if (!used.has(id)) throw new Error(`Stale visual inventory entry: ${id}`);
writeFileSync(path.join(output, "source-coverage.json"), JSON.stringify(coverage, null, 2));
console.log(`Verified ${coverage.map((item) => `${item.regimenId}: ${item.entryCount} entries / ${item.sectionCount} sections`).join("; ")}. No missing or stale bindings.`);
