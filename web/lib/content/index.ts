import path from "node:path";
import { parseRegimenContent } from "./parse";
import type { RegimenContent } from "./types";

// docs/content/*.md lives at the repo root, one level up from web/.
const CONTENT_DIR = path.join(process.cwd(), "..", "docs", "content");

export const REGIMENS: Record<string, string> = {
  rchop: "rchop.md",
  "ac-t": "act.md",
};

const cache = new Map<string, RegimenContent>();

export function loadRegimenContent(regimenId: string): RegimenContent {
  const cached = cache.get(regimenId);
  if (cached) return cached;

  const filename = REGIMENS[regimenId];
  if (!filename) {
    throw new Error(
      `Unknown regimenId "${regimenId}". Known: ${Object.keys(REGIMENS).join(", ")}`,
    );
  }

  const content = parseRegimenContent(regimenId, path.join(CONTENT_DIR, filename));
  cache.set(regimenId, content);
  return content;
}

export function listRegimens(): { id: string; title: string }[] {
  return Object.keys(REGIMENS).map((id) => ({ id, title: loadRegimenContent(id).title }));
}
