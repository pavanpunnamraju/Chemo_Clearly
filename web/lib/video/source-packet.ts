import type { ContentEntry } from "../content/types";
import { cleanForSpeechAndDisplay } from "./narration";

export const SOURCE_PACKET_VERSION = "complete-source-detail-instructions-v2";

type AuthoredSourceField = "plain" | "detail" | "selfCare" | "callTeamIf" | "call911" | "callTeam";
export type SourceField = AuthoredSourceField | "detailInstruction";
export interface SourcePassage {
  sourceRef: string;
  field: SourceField;
  text: string;
}
export interface SourcePacket {
  entryId: string;
  sectionId: string;
  name?: string;
  tier?: ContentEntry["tier"];
  /** Technical fidelity checking does not establish clinical approval. */
  sourceStatus: "approval-not-established";
  passages: SourcePassage[];
  /** Full detail disambiguates instruction excerpts even in short narration.
   * It is context, not permission to replace the requested depth with full detail. */
  detailContext?: { sourceRef: string; text: string };
}

/** Conservative source-exact sentence extraction, not generated medical advice.
 * False positives cost a little narration; implicit instructions still need the
 * semantic review, which receives the complete detail context at every depth. */
export function detailInstructionPassages(entry: ContentEntry): SourcePassage[] {
  if (!entry.detail) return [];
  const sentences = cleanForSpeechAndDisplay(entry.detail).split(/(?<=[.!?])\s+/);
  const actionLanguage = /\b(?:ask|tell|call|contact|report(?:ing)?|disclos(?:e|ing|ure)|avoid|monitor|check|take|stop|seek|inform|wash|drink|hydrate|rinse|use|wear|protect|keep|do not|don['’]t|must|should)\b|\bneed(?:s)?\s+(?:same[- ]day|immediate|urgent|emergency)\b|\bstaying\s+well[- ]hydrated\b/i;
  return sentences.flatMap((text, index) => actionLanguage.test(text)
    ? [{ sourceRef: `${entry.id}:detail:sentence-${index + 1}`, field: "detailInstruction" as const, text }]
    : []);
}

/** All authored fields, with fixed keys, for source/cache identity. Preserve entry order in callers. */
export function canonicalSourceEntry(entry: ContentEntry) {
  return {
    id: entry.id, sectionId: entry.sectionId, name: entry.name ?? null,
    tags: [...entry.tags], tier: entry.tier ?? null,
    plain: entry.plain, detail: entry.detail ?? null,
    selfCare: entry.selfCare ?? null, callTeamIf: entry.callTeamIf ?? null,
    call911: entry.call911 ?? null, callTeam: entry.callTeam ?? null,
    onScreen: entry.onScreen ?? null, source: entry.source ?? null,
    anecdotal: entry.anecdotal, drugNames: entry.drugNames ?? null,
    cycleCount: entry.cycleCount ?? null, weeksApart: entry.weeksApart ?? null,
    weeksTotal: entry.weeksTotal ?? null,
  };
}

export function buildSourcePacket(entry: ContentEntry, includeDetail: boolean): SourcePacket {
  const fields: AuthoredSourceField[] = ["plain", "selfCare", "callTeamIf", "call911", "callTeam"];
  if (includeDetail) fields.push("detail");
  return {
    entryId: entry.id, sectionId: entry.sectionId, name: entry.name, tier: entry.tier,
    sourceStatus: "approval-not-established",
    detailContext: entry.detail ? { sourceRef: `${entry.id}:detail`, text: cleanForSpeechAndDisplay(entry.detail) } : undefined,
    passages: [...fields.flatMap((field) => {
      const raw = entry[field];
      if (!raw?.trim()) return [];
      // Ordered-list markers are formatting, not clinical quantities. Strip
      // before flattening lines so actual numbers inside each item survive.
      const text = cleanForSpeechAndDisplay(raw.replace(/^\s*\d+[.)]\s+/gm, ""));
      return [{ sourceRef: `${entry.id}:${field}`, field, text }];
    }), ...(!includeDetail ? detailInstructionPassages(entry) : [])],
  };
}

export function sourcePacketText(packet: SourcePacket): string {
  return [packet.name ?? "", ...packet.passages.map((passage) => passage.text)].filter(Boolean).join(" ");
}
