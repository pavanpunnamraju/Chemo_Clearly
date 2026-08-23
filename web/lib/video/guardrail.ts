import type { ContentEntry } from "../content/types";
import { cleanForSpeechAndDisplay } from "./narration";

// Entity-diff guardrail for the narration rewrite step (#3c). Pure and
// deterministic — no LLM/network involved, so it's testable on its own
// before rewrite.ts (the LLM caller) exists.
//
// Scope, per the design doc: catches a rewrite introducing a number or
// proper-noun (drug name, etc.) that isn't anywhere in the source entries'
// union. It does NOT catch a fact borrowed from the wrong entry and
// misattributed elsewhere in the rewrite — accepted trade-off, not solved
// here.

function extractNumbers(text: string): Set<string> {
  const matches = text.match(/\d[\d.,]*\s?%?/g) ?? [];
  return new Set(matches.map((m) => m.replace(/\s+/g, "").replace(/[,.]$/, "")));
}

// Candidate proper-noun phrases: capitalized-word runs, kept as phrases (not
// single normalized tokens) so a multi-word name like "R CHOP" is judged as
// a whole. Sentence-initial words are excluded entirely — English capitalizes
// the first word of every sentence regardless of what it is (an LLM saying
// "Regarding your next cycle..." isn't inventing a fact by capitalizing
// "Regarding"), so that position carries no signal about whether a word is a
// genuine name. Mid-sentence capitalization is the actual signal.
function extractProperNounPhrases(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const phrases: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    const rest = words.slice(1).join(" ");
    const matches = rest.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) ?? [];
    for (const m of matches) phrases.push(m.toLowerCase());
  }
  return phrases;
}

// A spoken-safe rewrite spells out unit symbols the source writes as
// symbols (e.g. "100.4°F" -> "100.4 degrees Fahrenheit") since a TTS voice
// can't read "°F" literally — expand them before word-matching so the
// source word set includes the words a valid rewrite is expected to use.
function expandUnitSymbols(text: string): string {
  return text.replace(/°F/gi, " fahrenheit ").replace(/°C/gi, " celsius ").replace(/°/g, " degrees ");
}

// Every lowercase word in the source text, regardless of casing there — a
// capitalized word in the rewrite (e.g. a sentence-initial "Cycles") isn't
// an invented fact just because it wasn't capitalized in the source too.
function extractWordSet(text: string): Set<string> {
  const matches = expandUnitSymbols(text)
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
  return new Set(matches);
}

export interface GuardrailResult {
  ok: boolean;
  /** Facts present in the rewrite but absent from the source union — empty when ok. */
  introduced: string[];
}

/**
 * Checks that `rewrittenText` introduces no number or proper-noun phrase
 * absent from the union of `sourceEntries`' plain+detail text. Whole-pool
 * scope (not per-entry 1:1) per the design doc. A proper-noun phrase counts
 * as "introduced" only if at least one of its words doesn't appear anywhere
 * in the source (word-level, case-insensitive) — this is what a rewrite
 * inventing a new drug/person name looks like, as opposed to just
 * re-casing/re-ordering source vocabulary.
 */
export function checkEntityDiff(rewrittenText: string, sourceEntries: ContentEntry[]): GuardrailResult {
  const sourceText = sourceEntries
    .map((e) => cleanForSpeechAndDisplay(`${e.plain} ${e.detail ?? ""}`))
    .join(" ");
  const sourceNumbers = extractNumbers(sourceText);
  const sourceWords = extractWordSet(sourceText);

  const rewriteNumbers = extractNumbers(rewrittenText);
  const rewriteNounPhrases = extractProperNounPhrases(rewrittenText);

  const introduced: string[] = [];
  for (const n of rewriteNumbers) if (!sourceNumbers.has(n)) introduced.push(n);
  for (const phrase of rewriteNounPhrases) {
    const words = phrase.split(/\s+/);
    if (words.some((w) => !sourceWords.has(w))) introduced.push(phrase);
  }

  return { ok: introduced.length === 0, introduced };
}

export interface TtsSafetyResult {
  ok: boolean;
  issues: string[];
}

/**
 * Rejects text that would be read aloud literally or break TTS synthesis:
 * markdown syntax and asterisk/bracket-wrapped stage directions (e.g.
 * "*pauses*", "[whispers]"). Deterministic, no LLM — runs before the paid
 * critic call so a cheap failure never wastes one.
 */
export function checkTtsSafety(text: string): TtsSafetyResult {
  const issues: string[] = [];
  if (/\*\*|__|`|^#{1,6}\s/m.test(text)) issues.push("markdown syntax");
  if (/\*[^*\n]{1,40}\*|\[[^\]\n]{1,40}\]/.test(text)) issues.push("stage direction (asterisk/bracket phrase)");
  return { ok: issues.length === 0, issues };
}

export interface ReadingLevelResult {
  ok: boolean;
  avgWordsPerSentence: number;
}

/**
 * Deterministic proxy for "short sentences, everyday words" (the "basic"
 * education-level prompt instruction) — average words per sentence, no LLM
 * judgment needed for something a formula already estimates reasonably.
 */
export function checkReadingLevel(text: string, maxAvgWordsPerSentence = 20): ReadingLevelResult {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const totalWords = text.trim().split(/\s+/).filter(Boolean).length;
  const avgWordsPerSentence = sentences.length ? totalWords / sentences.length : 0;
  return { ok: avgWordsPerSentence <= maxAvgWordsPerSentence, avgWordsPerSentence };
}
