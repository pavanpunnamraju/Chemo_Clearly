import { readFileSync } from "node:fs";
import { SECTION_IDS, type ContentEntry, type RegimenContent, type SectionId, type Tier } from "./types";

export function extractField(block: string, prefix: string): string | undefined {
  // (?![A-Za-z0-9_]) after the prefix stops "call_team" from matching a
  // "**call_team_if:**" label (prefix is a literal substring of it) — real
  // trailing slack like "plain — AC phase:" / "plain framing for the app:"
  // always starts with a non-word char (space/dash) right after the prefix,
  // so this doesn't affect those.
  // The lookahead also stops at a trailing `---` section-separator line, not
  // just the next `**label:**` or end of block — without it, a section's
  // *last* entry's *last* field picks up the markdown horizontal rule that
  // separates it from the next `## section` header (verified: pre-existing
  // in `source`, unnoticed there since nothing displayed it verbatim; would
  // otherwise leak "---" onto the Alert archetype's split card, which does).
  const re = new RegExp(
    "\\*\\*" + prefix + "(?![A-Za-z0-9_])[^*:]*:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[A-Za-z][^*:]*:\\*\\*|\\n\\s*---\\s*(?:\\n|$)|$)",
    "i",
  );
  const match = re.exec(block);
  const text = match?.[1]?.trim();
  return text && text.length > 0 ? text : undefined;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseTags(block: string): string[] {
  const raw = extractField(block, "tags");
  if (!raw) return [];
  return [...raw.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]!);
}

export function parseTier(block: string): Tier | undefined {
  const raw = extractField(block, "tier");
  if (!raw) return undefined;
  const cleaned = raw.replace(/[`*]/g, "").trim() as Tier;
  return (["emergency", "call_team", "self_care"] as const).includes(cleaned) ? cleaned : undefined;
}

function parseEntry(
  block: string,
  sectionId: SectionId,
  name: string | undefined,
): ContentEntry | null {
  const plain = extractField(block, "plain");
  if (!plain) return null;

  const id = name ? `${sectionId}.${slugify(name)}` : sectionId;

  return {
    id,
    sectionId,
    name,
    tags: parseTags(block),
    tier: parseTier(block),
    plain,
    detail: extractField(block, "detail"),
    selfCare: extractField(block, "self_care"),
    callTeamIf: extractField(block, "call_team_if"),
    call911: extractField(block, "call_911"),
    callTeam: extractField(block, "call_team"),
    onScreen: extractField(block, "on-screen"),
    source: extractField(block, "source"),
    anecdotal: sectionId === "patient_voices",
  };
}

export function parseRegimenContent(regimenId: string, filePath: string): RegimenContent {
  const raw = readFileSync(filePath, "utf-8");

  const titleMatch = /^#\s+(.+)$/m.exec(raw);
  const title = titleMatch?.[1]?.trim() ?? regimenId;

  const headerRe = /^##\s+`([a-z_]+)`.*$/gm;
  const headers: { id: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(raw)) !== null) {
    headers.push({ id: m[1]!, index: m.index, end: headerRe.lastIndex });
  }

  const entries: ContentEntry[] = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]!;
    if (!SECTION_IDS.includes(header.id as SectionId)) continue;
    const sectionId = header.id as SectionId;
    const sectionEnd = headers[i + 1]?.index ?? raw.length;
    const sectionBody = raw.slice(header.end, sectionEnd);

    const subHeaderRe = /^###\s+(.+)$/gm;
    const subHeaders: { name: string; index: number; end: number }[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = subHeaderRe.exec(sectionBody)) !== null) {
      subHeaders.push({ name: sm[1]!.trim(), index: sm.index, end: subHeaderRe.lastIndex });
    }

    if (subHeaders.length === 0) {
      const entry = parseEntry(sectionBody, sectionId, undefined);
      if (entry) entries.push(entry);
      continue;
    }

    // Text before the first `###` (e.g. a section-level `**plain:**` intro
    // sentence) was previously discarded entirely once a section had any
    // sub-headers — `sectionBody.slice(sub.end, ...)` below only ever looked
    // *after* each `###`. Parse it the same way a no-sub-header section's
    // whole body is parsed, as its own entry (id: sectionId, no name).
    const introBody = sectionBody.slice(0, subHeaders[0]!.index);
    const introEntry = parseEntry(introBody, sectionId, undefined);
    if (introEntry) entries.push(introEntry);

    for (let j = 0; j < subHeaders.length; j++) {
      const sub = subHeaders[j]!;
      const end = subHeaders[j + 1]?.index ?? sectionBody.length;
      const entryBlock = sectionBody.slice(sub.end, end);
      const entry = parseEntry(entryBlock, sectionId, sub.name);
      if (entry) entries.push(entry);
    }
  }

  return { regimenId, title, entries };
}
