import type { ContentEntry } from "../content/types";
import { requiredAnchorPhrase } from "./narration";
import { buildSourcePacket, sourcePacketText } from "./source-packet";

const SPOKEN_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Recognize ordinary spoken quantities without requiring literal source wording. */
function normalizeSpokenNumbers(text: string, allowAnecdotalAttribution = false): string {
  // An attributed single-patient anecdote can naturally begin "One patient
  // shared..." without adding a clinical count. Only explicit reporting verbs
  // at a sentence opening qualify, and only for an anecdotal source entry.
  // Quantities later in that same sentence still receive normal checking.
  const attributed = allowAnecdotalAttribution
    ? text.replace(/(^\s*|[.!?]["'”’)]*\s+)one(?=\s+(?:patient|person)\s+(?:shared|said|noted|reported|described|recalled|explained|mentioned)\b)/gi, "$1A")
    : text;
  // "From one cycle to the next" is distributive, equivalent to "cycle to
  // cycle"; it does not prescribe a one-cycle course.
  const normalizedIdioms = attributed.replace(/\bfrom one cycle to the next\b/gi, "from cycle to cycle");
  // "One" is also a pronoun or discourse marker. Those uses do not assert
  // a clinical quantity. Keep this exception narrow: one day/dose/tablet,
  // one side, one at a time, and other actual counts still normalize to 1.
  const numericText = normalizedIdioms.replace(/\bone\b/gi, (word, offset: number, input: string) => {
    const before = input.slice(0, offset);
    const after = input.slice(offset + word.length);
    const rhetorical = /^\s+(?:(?:helpful|simple|useful|easy|practical|important)\s+){0,2}(?:way|thing|idea|approach|habit|option|example|reason)\b/i.test(after);
    const pronoun = /\bno\s+$/i.test(before) || /^\s+another\b/i.test(after);
    const sentenceStart = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?")) + 1;
    const sentence = input.slice(sentenceStart).split(/(?<=[.!?])\s+/)[0] ?? "";
    const notesInOnePlace = /\bin\s+$/i.test(before) && /^\s+place\b/i.test(after) &&
      /\b(?:notes?|notebook|symptom log|logbook|journal)\b/i.test(sentence);
    return rhetorical || pronoun || notesInOnePlace ? "indefinite" : word;
  });
  const numberWords = Object.keys(SPOKEN_NUMBERS).join("|");
  const atom = `(?:${numberWords}|hundred|thousand)`;
  const run = new RegExp(`\\b${atom}(?:(?:[ -]+| and )${atom})*\\b`, "gi");
  const normalized = numericText.replace(run, (phrase) => {
    let total = 0;
    let current = 0;
    for (const word of phrase.toLowerCase().split(/[ -]+/)) {
      if (word === "and") continue;
      if (word === "hundred") current = (current || 1) * 100;
      else if (word === "thousand") { total += (current || 1) * 1000; current = 0; }
      else current += SPOKEN_NUMBERS[word] ?? 0;
    }
    return String(total + current);
  });
  return normalized.replace(/(\d+)\s+point\s+(\d+)/gi, "$1.$2");
}

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
  const matches = text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [];
  return new Set(matches.map((m) => String(Number(m.replace(/,/g, "")))));
}

// Candidate proper-noun phrases: capitalized-word runs, kept as phrases (not
// single normalized tokens) so a multi-word name like "R CHOP" is judged as
// a whole. Sentence-initial words are excluded entirely — English capitalizes
// the first word of every sentence regardless of what it is (an LLM saying
// "Regarding your next cycle..." isn't inventing a fact by capitalizing
// "Regarding"), so that position carries no signal about whether a word is a
// genuine name. Mid-sentence capitalization is the actual signal.
function spokenSentences(text: string): string[] {
  // Closing quotation marks do not join the next sentence to the quote.
  // Keep decimal points intact: a boundary still requires whitespace.
  return text.split(/[.!?]["'”’)]*\s+/).filter((sentence) => sentence.trim());
}

function extractProperNounPhrases(text: string): string[] {
  const sentences = spokenSentences(text);
  const phrases: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    const rest = words.slice(1).join(" ");
    const matches = rest.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    for (const match of matches) {
      let phrase = match[0];
      // A colon/em dash can introduce a new sentence-like clause. Exclude
      // capitalized function words there, but keep an actual following name
      // ("For Zofran", for example) available to the entity checker.
      if (/[:—–]\s*$/.test(rest.slice(0, match.index))) {
        phrase = phrase.replace(/^(?:This|That|These|Those|For|The|A|An|If|When|You|Your|It|They|We|Our)\b\s*/, "");
      }
      if (phrase) phrases.push(phrase.toLowerCase());
    }
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
 * absent from the complete source packets. The rewrite caller invokes this
 * per entry to prevent borrowing another entry's quantities. A proper-noun
 * phrase counts as "introduced" only if at least one of its words doesn't
 * appear anywhere in the source (word-level, case-insensitive) — this is
 * what a rewrite inventing a new drug/person name looks like, as opposed to
 * just re-casing/re-ordering source vocabulary.
 *
 * The heading (`entry.name`) counts as source text, not just `plain`/
 * `detail`: it's part of the same supplied source entry, so a fact that
 * only appears there (e.g. a timeline entry's day range, or a name like
 * "nadir" in "Roughly days 7-10 (the 'nadir')") isn't invented — the
 * narration is allowed to draw on it.
 */
export function checkEntityDiff(rewrittenText: string, sourceEntries: ContentEntry[], includeDetail = true): GuardrailResult {
  const sourceText = sourceEntries
    // Full detail is supplied as context at both depths; it can disambiguate
    // a mandatory instruction without legitimizing facts from another entry.
    .map((e) => sourcePacketText(buildSourcePacket(e, true)))
    .join(" ");
  const allowAnecdotalAttribution = sourceEntries.length === 1 && sourceEntries[0]!.anecdotal;
  const sourceNumbers = extractNumbers(normalizeSpokenNumbers(sourceText, allowAnecdotalAttribution));
  const sourceWords = extractWordSet(sourceText);

  const rewriteNumbers = extractNumbers(normalizeSpokenNumbers(rewrittenText, allowAnecdotalAttribution));
  const rewriteNounPhrases = extractProperNounPhrases(rewrittenText);

  const introduced: string[] = [];
  for (const n of rewriteNumbers) if (!sourceNumbers.has(n)) introduced.push(n);
  for (const phrase of rewriteNounPhrases) {
    const words = phrase.split(/\s+/);
    if (words.some((w) => !sourceWords.has(w))) introduced.push(phrase);
  }

  return { ok: introduced.length === 0, introduced };
}

export interface ProtectedNumberResult {
  ok: boolean;
  missing: { entryId: string; numbers: string[] }[];
}

/** Numeric safety backstop; units, comparisons, actions and meaning are checked by the critic. */
export function checkProtectedNumbers(
  chunks: { entryId: string; text: string }[],
  entries: ContentEntry[],
): ProtectedNumberResult {
  const byId = new Map(chunks.map((chunk) => [chunk.entryId, chunk.text]));
  const missing: ProtectedNumberResult["missing"] = [];
  for (const entry of entries) {
    // Detail statistics may be summarized. Quantities in the mandatory plain
    // and action fields must survive even for short/basic narration.
    const packet = buildSourcePacket(entry, false);
    // An extracted detail sentence may mix an instruction with optional risk
    // statistics. The semantic reviewer checks its instruction quantities;
    // do not accidentally make those contextual statistics mandatory here.
    const required = extractNumbers(sourcePacketText({ ...packet, passages: packet.passages.filter((p) => p.field !== "detailInstruction") }));
    const actual = extractNumbers(normalizeSpokenNumbers(byId.get(entry.id) ?? "", entry.anecdotal));
    const numbers = [...required].filter((number) => !actual.has(number));
    if (numbers.length) missing.push({ entryId: entry.id, numbers });
  }
  return { ok: missing.length === 0, missing };
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
  const sentences = spokenSentences(text);
  const totalWords = text.trim().split(/\s+/).filter(Boolean).length;
  const avgWordsPerSentence = sentences.length ? totalWords / sentences.length : 0;
  return { ok: avgWordsPerSentence <= maxAvgWordsPerSentence, avgWordsPerSentence };
}

export interface AnchorPhraseResult {
  ok: boolean;
  /** entryIds whose rewritten chunk dropped their required anchor phrase — empty when ok. */
  missing: string[];
}

/**
 * Checks that every entry needing a literal timing-anchor phrase
 * (`requiredAnchorPhrase`, narration.ts — currently just `overview` once it
 * carries the countdown-cards beat's `cycleCount`/`weeksApart`/`weeksTotal`
 * fields) still has that phrase, verbatim (case-insensitive, tolerant of
 * whitespace differences), in its own rewritten chunk.
 *
 * Nothing else catches this: `checkEntityDiff` only flags *introduced*
 * facts, never a *dropped* one, and a paraphrase of "A typical course is 6
 * cycles..." into "You'll typically get 6 cycles..." introduces nothing new
 * — it just silently breaks `computeAnchoredReveals`' exact-phrase search,
 * degrading that beat's cut/reveal timing to its interpolated fallback with
 * no error, no failed render, nothing a human would notice short of
 * happening to watch that exact beat closely.
 */
export function checkAnchorPhrases(
  chunks: { entryId: string; text: string }[],
  entries: ContentEntry[],
): AnchorPhraseResult {
  const textByEntry = new Map(chunks.map((c) => [c.entryId, c.text]));
  const missing: string[] = [];
  for (const entry of entries) {
    const anchor = requiredAnchorPhrase(entry);
    if (!anchor) continue;
    const text = textByEntry.get(entry.id) ?? "";
    const pattern = new RegExp(anchor.trim().split(/\s+/).join("\\s+"), "i");
    if (!pattern.test(text)) missing.push(entry.id);
  }
  return { ok: missing.length === 0, missing };
}
