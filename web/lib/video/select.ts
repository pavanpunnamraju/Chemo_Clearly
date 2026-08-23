import { SECTION_IDS, type ContentEntry, type RegimenContent } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";
import { getGenAIClient } from "../gemini/client";

// Phase 1 goal 3's agentic layer. GUARDRAIL: this step only ever returns a
// list of entry ids drawn from the ids it was given — it never generates or
// rewrites narration text. Narration assembly (narration.ts) pulls the actual
// `plain`/`detail` text verbatim from the parsed, human-approved content.
// That makes it structurally impossible for this step to introduce a fact,
// claim, or phrasing outside the canonical content, regardless of what the
// model outputs — we validate its output is a subset of the known id set and
// otherwise ignore/reject it.

export interface SelectionResult {
  entryIds: string[];
  /** "gemini" if the LLM call ran, "fallback" if it was skipped/failed and the deterministic filter was used. */
  method: "gemini" | "fallback";
}

// Phase 2a goal 1: sections spoken in the narrated video. `practical_life`
// and `big_picture` stay in the .md content for reading but are dropped from
// narration — reference prose, not something read aloud end-to-end. This
// replaces the old tag-matching filter, which went dead once
// `PersonalizationFilter.tags` became the full taxonomy for every patient
// (2026-08-10 topics-removal amendment).
export const NARRATED_SECTIONS = new Set<string>([
  "overview",
  "timeline",
  "daily_life",
  "side_effects",
  "fertility_intimacy",
  "emergency",
  "patient_voices",
]);

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
    "You are ordering which pre-approved patient-education content entries appear",
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

  const knownIds = new Set(entries.map((e) => e.id));
  const validated = parsed.filter((id): id is string => knownIds.has(id));
  return validated.length > 0 ? validated : null;
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
  try {
    const geminiIds = await geminiSelect(entries);
    // Video must always cover every entry in the narrated scope — if Gemini
    // dropped any (despite being told not to), fall back to the
    // deterministic path, which always includes everything.
    if (geminiIds && geminiIds.length === entries.length) {
      return { entryIds: geminiIds, method: "gemini" };
    }
  } catch (err) {
    console.warn("Gemini selection call failed, falling back to deterministic filter:", err);
  }
  return { entryIds: deterministicSelect(entries), method: "fallback" };
}
