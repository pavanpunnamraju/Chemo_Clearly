import { SECTION_IDS, type ContentEntry, type RegimenContent } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";

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

function deterministicSelect(
  content: RegimenContent,
  filter: PersonalizationFilter,
): string[] {
  const tagSet = new Set(filter.tags);
  const bySection = new Map<string, ContentEntry[]>();
  for (const entry of content.entries) {
    if (!bySection.has(entry.sectionId)) bySection.set(entry.sectionId, []);
    bySection.get(entry.sectionId)!.push(entry);
  }

  const ALWAYS_INCLUDE_SECTIONS = new Set(["overview", "emergency"]);

  const selected: string[] = [];
  for (const sectionId of SECTION_IDS) {
    const entries = bySection.get(sectionId) ?? [];
    for (const entry of entries) {
      const always = ALWAYS_INCLUDE_SECTIONS.has(sectionId) || entry.tier === "emergency";
      const matches = entry.tags.some((t) => tagSet.has(t));
      if (always || matches) selected.push(entry.id);
    }
  }
  return selected;
}

function buildGeminiPrompt(content: RegimenContent, filter: PersonalizationFilter): string {
  const catalog = content.entries.map((e) => ({
    id: e.id,
    section: e.sectionId,
    name: e.name,
    tags: e.tags,
    tier: e.tier,
  }));

  return [
    "You are selecting which pre-approved patient-education content entries to include",
    "in a narrated video, based on a patient's stated topics of interest. You are NOT",
    "writing any text — you only choose ids from the catalog below and order them.",
    "",
    "Rules:",
    "- Only return ids that appear in the catalog. Never invent an id.",
    '- Always include every entry with section "emergency" or tier "emergency".',
    '- Always include every entry with section "overview" (context patients need first).',
    `- Prefer entries whose tags overlap this patient's topics of interest: ${filter.tags.join(", ")}`,
    "- Order roughly: overview, timeline, daily_life, side_effects, emergency, then the rest.",
    "- Keep the total selection focused — omit side_effects/other entries with no tag overlap",
    "  and no emergency tier.",
    "",
    "Catalog (JSON):",
    JSON.stringify(catalog, null, 2),
    "",
    'Respond with ONLY a JSON array of id strings, e.g. ["overview", "timeline", "side_effects.nausea-and-vomiting"]. No prose, no markdown fences.',
  ].join("\n");
}

async function geminiSelect(
  content: RegimenContent,
  filter: PersonalizationFilter,
): Promise<string[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: buildGeminiPrompt(content, filter),
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

  const knownIds = new Set(content.entries.map((e) => e.id));
  const validated = parsed.filter((id): id is string => knownIds.has(id));
  return validated.length > 0 ? validated : null;
}

export async function selectContent(
  content: RegimenContent,
  filter: PersonalizationFilter,
): Promise<SelectionResult> {
  try {
    const geminiIds = await geminiSelect(content, filter);
    if (geminiIds) return { entryIds: geminiIds, method: "gemini" };
  } catch (err) {
    console.warn("Gemini selection call failed, falling back to deterministic filter:", err);
  }
  return { entryIds: deterministicSelect(content, filter), method: "fallback" };
}
