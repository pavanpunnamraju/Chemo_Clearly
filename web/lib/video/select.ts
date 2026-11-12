import { SECTION_IDS, type ContentEntry, type RegimenContent } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";
import { getGenAIClient } from "../gemini/client";

// Selection can order source IDs; it cannot generate text or reduce coverage.
// This protects entry coverage only. Narration fidelity is checked separately.

export interface SelectionResult {
  entryIds: string[];
  /** "gemini" if the LLM call ran, "fallback" if it was skipped/failed and the deterministic filter was used. */
  method: "gemini" | "fallback";
}

// Approved directed-video scope: every source section is mandatory.
export const NARRATED_SECTIONS = new Set<string>(SECTION_IDS);

export function hasExactEntryCoverage(ids: string[], entries: ContentEntry[]): boolean {
  const expected = new Set(entries.map((entry) => entry.id));
  return expected.size === entries.length && ids.length === expected.size &&
    new Set(ids).size === ids.length && ids.every((id) => expected.has(id));
}

export function deterministicSourceSelection(content: RegimenContent): SelectionResult {
  const sections = new Set(content.entries.map((entry) => entry.sectionId));
  const missing = SECTION_IDS.filter((id) => !sections.has(id));
  if (missing.length) throw new Error(`Source content is missing required sections: ${missing.join(", ")}`);
  const ids = deterministicSelect(content.entries);
  if (!hasExactEntryCoverage(ids, content.entries)) throw new Error("Source content has duplicate IDs or unsupported sections.");
  return { entryIds: ids, method: "fallback" };
}

function narratedEntries(content: RegimenContent): ContentEntry[] {
  return content.entries.filter((e) => NARRATED_SECTIONS.has(e.sectionId));
}

function deterministicSelect(entries: ContentEntry[]): string[] {
  const bySection = new Map<string, ContentEntry[]>();
  for (const entry of entries) {
    if (!bySection.has(entry.sectionId)) bySection.set(entry.sectionId, []);
    bySection.get(entry.sectionId)!.push(entry);
  }

  const selected: string[] = [];
  for (const sectionId of SECTION_IDS) {
    const sectionEntries = bySection.get(sectionId) ?? [];
    for (const entry of sectionEntries) selected.push(entry.id);
  }
  return selected;
}

function buildGeminiPrompt(entries: ContentEntry[]): string {
  const catalog = entries.map((e) => ({
    id: e.id,
    section: e.sectionId,
    name: e.name,
    tags: e.tags,
    tier: e.tier,
  }));

  return [
    "You are ordering supplied patient-education source entries",
    "in a narrated video. The catalog below is already scoped to what's meant to",
    "be narrated — you must cover everything in it, in full — you are NOT",
    "filtering or trimming content, only choosing the order. You are NOT writing",
    "any text — you only choose ids from the catalog below and order them.",
    "",
    "Rules:",
    "- Include every id in the catalog below. Never invent an id, never omit one.",
    "- Order roughly: overview, timeline, daily_life, side_effects, emergency, then the rest.",
    "",
    "Catalog (JSON):",
    JSON.stringify(catalog, null, 2),
    "",
    'Respond with ONLY a JSON array of id strings, e.g. ["overview", "timeline", "side_effects.nausea-and-vomiting"]. No prose, no markdown fences.',
  ].join("\n");
}

async function geminiSelect(entries: ContentEntry[]): Promise<string[] | null> {
  const ai = await getGenAIClient();
  if (!ai) return null;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: buildGeminiPrompt(entries) }] }],
  });

  const text = response.text?.trim() ?? "";
  const jsonText = text.replace(/^```json\s*|```$/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) return null;

  return hasExactEntryCoverage(parsed, entries) ? parsed : null;
}

export async function selectContent(
  content: RegimenContent,
  // Unused now that tags are always the full taxonomy (2026-08-10
  // topics-removal amendment) — kept in the signature so callers don't need
  // to change; narration scope is decided by NARRATED_SECTIONS above, not by
  // this filter.
  _filter: PersonalizationFilter,
): Promise<SelectionResult> {
  const entries = narratedEntries(content);
  const fallback = deterministicSourceSelection(content);
  try {
    const geminiIds = await geminiSelect(entries);
    // Video must always cover every entry in the narrated scope — if Gemini
    // dropped any (despite being told not to), fall back to the
    // deterministic path, which always includes everything.
    if (geminiIds && hasExactEntryCoverage(geminiIds, entries)) {
      return { entryIds: geminiIds, method: "gemini" };
    }
  } catch (err) {
    console.warn("Gemini selection call failed, falling back to deterministic filter:", err);
  }
  return fallback;
}
