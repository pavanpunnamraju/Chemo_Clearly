// Structural validator for docs/content/*.md against what web/lib/content/parse.ts
// actually parses. Catches the bug classes that motivated this (goal #11): entries
// silently dropped for missing a `plain` field, and unknown section ids silently
// skipped. Rules and error/warning split per docs/references/handoff-goal11.md.
// Run: npm run validate:content [path/to/one-file.md]

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SECTION_IDS, type SectionId } from "../lib/content/types";
import { extractField, parseTags, parseTier, slugify } from "../lib/content/parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, "..", "..", "docs", "content");

interface Issue {
  level: "error" | "warning";
  message: string;
}

function validateFile(raw: string): Issue[] {
  const issues: Issue[] = [];
  const seenIds = new Set<string>();
  const seenSections = new Set<string>();

  // Same header/sub-header regexes as parseRegimenContent — kept in sync so the
  // validator sees exactly what the real parser sees.
  const headerRe = /^##\s+`([a-z_]+)`.*$/gm;
  const headers: { id: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(raw)) !== null) {
    headers.push({ id: m[1]!, index: m.index, end: headerRe.lastIndex });
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]!;
    if (!SECTION_IDS.includes(header.id as SectionId)) {
      issues.push({
        level: "error",
        message: `unknown section id \`${header.id}\` — silently dropped by parse.ts, check for a typo`,
      });
      continue;
    }
    const sectionId = header.id as SectionId;
    seenSections.add(sectionId);
    const sectionEnd = headers[i + 1]?.index ?? raw.length;
    const sectionBody = raw.slice(header.end, sectionEnd);

    const subHeaderRe = /^###\s+(.+)$/gm;
    const subHeaders: { name: string; index: number; end: number }[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = subHeaderRe.exec(sectionBody)) !== null) {
      subHeaders.push({ name: sm[1]!.trim(), index: sm.index, end: subHeaderRe.lastIndex });
    }

    const blocks: { name: string | undefined; block: string }[] =
      subHeaders.length === 0
        ? [{ name: undefined, block: sectionBody }]
        : [
            { name: undefined, block: sectionBody.slice(0, subHeaders[0]!.index) },
            ...subHeaders.map((sub, j) => ({
              name: sub.name,
              block: sectionBody.slice(sub.end, subHeaders[j + 1]?.index ?? sectionBody.length),
            })),
          ];

    for (const { name, block } of blocks) {
      const label = name ? `${sectionId} / "${name}"` : sectionId;
      const plain = extractField(block, "plain");
      if (!plain) {
        // Matches parseEntry: no `plain` means parse.ts drops this block
        // entirely (not an error there — silence is the bug this catches).
        if (name === undefined && block.trim().length === 0) continue; // no intro text before first sub-header, nothing lost
        issues.push({ level: "error", message: `${label}: no \`plain\` field found — entry silently dropped by parse.ts` });
        continue;
      }

      const id = name ? `${sectionId}.${slugify(name)}` : sectionId;
      if (seenIds.has(id)) {
        issues.push({ level: "warning", message: `${label}: duplicate entry id "${id}" — collides with another entry` });
      }
      seenIds.add(id);

      const tagsRaw = extractField(block, "tags");
      if (tagsRaw && parseTags(block).length === 0) {
        issues.push({ level: "warning", message: `${label}: \`tags:\` present but no backtick-wrapped tags found — will parse as empty` });
      }

      const tierRaw = extractField(block, "tier");
      if (tierRaw && !parseTier(block)) {
        issues.push({ level: "error", message: `${label}: invalid \`tier:\` value "${tierRaw}" — must be emergency, call_team, or self_care` });
      }
      if ((sectionId === "side_effects" || sectionId === "emergency") && name && !tierRaw) {
        issues.push({ level: "warning", message: `${label}: missing \`tier:\` — expected for side_effects/emergency entries` });
      }
    }
  }

  for (const sectionId of SECTION_IDS) {
    if (!seenSections.has(sectionId)) {
      issues.push({ level: "warning", message: `missing section \`${sectionId}\`` });
    }
  }

  return issues;
}

const arg = process.argv[2];
const files = arg
  ? [path.resolve(arg)]
  : readdirSync(CONTENT_DIR)
      .filter((f) => f.endsWith(".md") && f !== "schema.md")
      .map((f) => path.join(CONTENT_DIR, f));

let hasErrors = false;
for (const file of files) {
  const issues = validateFile(readFileSync(file, "utf-8"));
  const rel = path.relative(process.cwd(), file);
  if (issues.length === 0) {
    console.log(`${rel}: ok`);
    continue;
  }
  for (const issue of issues) {
    if (issue.level === "error") hasErrors = true;
    console.log(`${rel}: [${issue.level}] ${issue.message}`);
  }
}

if (hasErrors) {
  console.error("\nvalidate-content: errors found");
  process.exit(1);
}
console.log("\nvalidate-content: ok");
