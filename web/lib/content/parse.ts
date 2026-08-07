import { readFileSync } from "node:fs";
import { SECTION_IDS, type ContentEntry, type RegimenContent, type SectionId, type Tier } from "./types";

function extractField(block: string, prefix: string): string | undefined {
  const re = new RegExp(
    "\\*\\*" + prefix + "[^*:]*:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[A-Za-z][^*:]*:\\*\\*|$)",
    "i",
  );
  const match = re.exec(block);
  const text = match?.[1]?.trim();
  return text && text.length > 0 ? text : undefined;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseTags(block: string): string[] {
  const raw = extractField(block, "tags");
  if (!raw) return [];
  return [...raw.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]!);
}

function parseTier(block: string): Tier | undefined {
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
