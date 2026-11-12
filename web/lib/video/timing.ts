import type { WordOffset } from "./align";

export const DIRECTED_TIMING_VERSION = "canonical-sequence-v1";

export interface TimingChunk { entryId: string; text: string }
export interface TimedScriptWord {
  /** Exact script text, including punctuation. No recognized spelling is displayed. */
  text: string;
  entryId: string;
  sourceTokenIndex: number;
  startSeconds: number;
  endSeconds: number;
  confidence: number | null;
  /** True when spelling/number normalization spans recognition tokens. */
  normalized: boolean;
}
export interface TimedNarrationEntry {
  entryId: string;
  startSeconds: number;
  endSeconds: number;
  /** Inclusive index into DirectedTiming.words. */
  wordStartIndex: number;
  /** Exclusive index into DirectedTiming.words. */
  wordEndIndex: number;
}
export interface TimingIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  tokenIndex?: number;
}
export interface TimingDiagnostics {
  valid: boolean;
  coverage: number;
  recognitionCoverage: number;
  sourceTokenCount: number;
  matchedTokenCount: number;
  unmatchedTokens: { index: number; text: string; entryId: string }[];
  unexpectedWords: { index: number; text: string }[];
  lowConfidenceTokens: { index: number; text: string; confidence: number }[];
  issues: TimingIssue[];
}
export interface DirectedTiming {
  version: typeof DIRECTED_TIMING_VERSION;
  script: string;
  audioDurationSeconds: number;
  words: TimedScriptWord[];
  entries: TimedNarrationEntry[];
  diagnostics: TimingDiagnostics;
}

type SourceToken = { text: string; entryId: string };
type Atom = { key: string; indexes: number[] };
const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const CONTRACTIONS: Record<string, string[]> = {
  "don't": ["do", "not"], "doesn't": ["does", "not"], "didn't": ["did", "not"],
  "can't": ["can", "not"], "cannot": ["can", "not"], "won't": ["will", "not"],
  "shouldn't": ["should", "not"], "isn't": ["is", "not"], "aren't": ["are", "not"],
  "you'll": ["you", "will"], "you've": ["you", "have"], "you're": ["you", "are"],
  "we're": ["we", "are"], "we'll": ["we", "will"], "we've": ["we", "have"],
  "they're": ["they", "are"], "they'll": ["they", "will"], "they've": ["they", "have"],
  "it's": ["it", "is"], "that's": ["that", "is"], "there's": ["there", "is"],
  "let's": ["let", "us"], "i'm": ["i", "am"],
};

function smallNumber(atoms: Atom[], start: number): { value: number; end: number } | null {
  const key = atoms[start]?.key;
  if (key === undefined) return null;
  if (key in TENS) {
    const unit = UNITS[atoms[start + 1]?.key ?? ""];
    return unit !== undefined && unit > 0 && unit < 10
      ? { value: TENS[key]! + unit, end: start + 2 }
      : { value: TENS[key]!, end: start + 1 };
  }
  return key in UNITS ? { value: UNITS[key]!, end: start + 1 } : null;
}

/** Only spelling equivalents are folded. No fuzzy matching of drug names/claims. */
function canonicalAtoms(tokens: string[]): Atom[] {
  const raw: Atom[] = [];
  tokens.forEach((text, index) => {
    const normalized = text.toLowerCase().normalize("NFKC").replace(/[’‘]/g, "'")
      .replace(/>=|≥/g, " greater than or equal to ").replace(/<=|≤/g, " less than or equal to ")
      .replace(/>/g, " greater than ").replace(/</g, " less than ")
      .replace(/=/g, " equals ").replace(/\+/g, " plus ")
      .replace(/^-(?=\d)/g, "minus ")
      .replace(/(\d)[–—-](?=\d)/g, "$1 to ")
      .replace(/°\s*f\b/g, " degrees fahrenheit").replace(/°\s*c\b/g, " degrees celsius");
    for (const match of normalized.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?|[a-z]+(?:'[a-z]+)?|[°%]/g)) {
      let key = match[0].replace(/,/g, "");
      // Common regimen typography can join letters that speech recognizes apart.
      const expanded = CONTRACTIONS[key] ?? (key === "rchop" ? ["r", "chop"] : key === "ac" ? ["a", "c"] : key === "%" ? ["percent"] : key === "°" ? ["degrees"] : [key]);
      for (key of expanded) raw.push({ key: key.replace(/'/g, ""), indexes: [index] });
    }
  });
  const result: Atom[] = [];
  for (let i = 0; i < raw.length;) {
    // Emergency number is often spoken as separate digits.
    if (raw.slice(i, i + 3).map((a) => a.key).join(" ") === "nine one one") {
      result.push({ key: "911", indexes: [...new Set(raw.slice(i, i + 3).flatMap((a) => a.indexes))] });
      i += 3;
      continue;
    }
    const first = smallNumber(raw, i);
    if (!first) {
      result.push(raw[i]!);
      i++;
      continue;
    }
    let { value, end } = first;
    if (value > 0 && value < 10 && raw[end]?.key === "hundred") {
      value *= 100;
      end++;
      const tailStart = raw[end]?.key === "and" ? end + 1 : end;
      const tail = smallNumber(raw, tailStart);
      if (tail) { value += tail.value; end = tail.end; }
    }
    if (raw[end]?.key === "thousand") {
      value *= 1000;
      end++;
      const tail = smallNumber(raw, end);
      if (tail) { value += tail.value; end = tail.end; }
    }
    let key = String(value);
    if (raw[end]?.key === "point" && UNITS[raw[end + 1]?.key ?? ""] !== undefined) {
      let decimals = "";
      let cursor = end + 1;
      while (UNITS[raw[cursor]?.key ?? ""] !== undefined && UNITS[raw[cursor]!.key]! < 10) {
        decimals += UNITS[raw[cursor]!.key];
        cursor++;
      }
      if (decimals) { key += `.${decimals}`; end = cursor; }
    }
    result.push({ key, indexes: [...new Set(raw.slice(i, end).flatMap((a) => a.indexes))] });
    i = end;
  }
  return result;
}

/** Exact speech spelling equivalence for independent transcript comparisons. */
export function canonicalSpeechTokens(text: string): string[] {
  return canonicalAtoms(text.split(/\s+/).filter(Boolean)).map((atom) => atom.key);
}

/** Global monotonic sequence reconciliation, so repeated phrases retain order. */
function sequenceMatches(source: Atom[], recognized: Atom[]): Map<number, number> {
  const width = recognized.length + 1;
  if ((source.length + 1) * width > 36_000_000) {
    throw new Error("Timing reconciliation is too large; align individual narration sections.");
  }
  const scores = new Uint32Array((source.length + 1) * width);
  for (let i = source.length - 1; i >= 0; i--) {
    for (let j = recognized.length - 1; j >= 0; j--) {
      scores[i * width + j] = source[i]!.key === recognized[j]!.key
        ? 1 + scores[(i + 1) * width + j + 1]!
        : Math.max(scores[(i + 1) * width + j]!, scores[i * width + j + 1]!);
    }
  }
  const matches = new Map<number, number>();
  for (let i = 0, j = 0; i < source.length && j < recognized.length;) {
    if (source[i]!.key === recognized[j]!.key) { matches.set(i++, j++); }
    else if (scores[(i + 1) * width + j]! >= scores[i * width + j + 1]!) i++;
    else j++;
  }
  return matches;
}

/**
 * Timing comes only from actual recognition starts AND ends. Gaps, extra spoken
 * words and low confidence remain explicit failures; no proportional interpolation
 * or start-at-previous-end fallback can turn an uncertain candidate into valid one.
 */
export function reconcileNarrationTiming(
  chunks: TimingChunk[],
  recognizedWords: WordOffset[],
  audioDurationSeconds: number,
): DirectedTiming {
  const issues: TimingIssue[] = [];
  const error = (code: string, message: string, tokenIndex?: number) => issues.push({ code, message, severity: "error", tokenIndex });
  const source: SourceToken[] = [];
  const ids = new Set<string>();
  for (const chunk of chunks) {
    if (ids.has(chunk.entryId)) error("duplicate-entry", `Entry ${chunk.entryId} appears more than once.`);
    ids.add(chunk.entryId);
    const tokens = chunk.text.split(/\s+/).filter(Boolean);
    if (!tokens.length) error("empty-entry", `Entry ${chunk.entryId} has no narration.`);
    source.push(...tokens.map((text) => ({ text, entryId: chunk.entryId })));
  }
  if (!source.length) error("empty-script", "The narration contains no words.");
  if (!recognizedWords.length) error("empty-alignment", "Recognition returned no timed words; re-align the audio.");
  if (!Number.isFinite(audioDurationSeconds) || audioDurationSeconds <= 0) error("invalid-duration", "Audio duration must be finite and positive.");

  const invalidOffsets = new Set<number>();
  recognizedWords.forEach((word, index) => {
    if (word.endSeconds === undefined) {
      error("missing-word-end", `Word ${index} lacks an end time; invalidate the legacy alignment cache.`, index);
      invalidOffsets.add(index);
    } else if (!Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds) || word.startSeconds < 0 ||
      word.endSeconds <= word.startSeconds || word.endSeconds > audioDurationSeconds + 0.05 ||
      (index > 0 && word.startSeconds < recognizedWords[index - 1]!.startSeconds)) {
      error("invalid-word-time", `Word ${index} has invalid, reversed or out-of-audio timing.`, index);
      invalidOffsets.add(index);
    }
    if (word.confidence !== undefined && word.confidence !== null && (!Number.isFinite(word.confidence) || word.confidence < 0 || word.confidence > 1)) {
      error("invalid-confidence", `Word ${index} has invalid confidence.`, index);
    }
  });

  // Never combine numeric phrases across source entry boundaries.
  const sourceAtoms: Atom[] = [];
  let sourceOffset = 0;
  for (const chunk of chunks) {
    const tokens = chunk.text.split(/\s+/).filter(Boolean);
    sourceAtoms.push(...canonicalAtoms(tokens).map((a) => ({ ...a, indexes: a.indexes.map((i) => i + sourceOffset) })));
    sourceOffset += tokens.length;
  }
  const recognizedAtoms = canonicalAtoms(recognizedWords.map((w) => w.word));
  const matches = sequenceMatches(sourceAtoms, recognizedAtoms);
  const sourceAtomMembership = source.map(() => [] as number[]);
  sourceAtoms.forEach((atom, index) => atom.indexes.forEach((i) => sourceAtomMembership[i]!.push(index)));
  // A standalone dash/quotation mark is displayed but has no acoustic event.
  // Attach its timing to an adjacent token within the same entry, explicitly.
  source.forEach((token, index) => {
    if (!sourceAtomMembership[index]!.length && /^[\p{P}\p{S}]+$/u.test(token.text)) {
      const neighbor = index > 0 && source[index - 1]!.entryId === token.entryId ? index - 1 : index + 1;
      if (source[neighbor]?.entryId === token.entryId) sourceAtomMembership[index] = [...sourceAtomMembership[neighbor]!];
    }
  });
  const matchedRecognition = new Set<number>();
  const matchedAtoms = new Set(matches.values());
  const recognitionMembership = recognizedWords.map(() => [] as number[]);
  recognizedAtoms.forEach((atom, index) => atom.indexes.forEach((i) => recognitionMembership[i]!.push(index)));
  recognitionMembership.forEach((atoms, index) => {
    if (atoms.length && atoms.every((atom) => matchedAtoms.has(atom))) matchedRecognition.add(index);
  });
  const unmatchedTokens: TimingDiagnostics["unmatchedTokens"] = [];
  const lowConfidenceTokens: TimingDiagnostics["lowConfidenceTokens"] = [];
  const words: TimedScriptWord[] = [];
  source.forEach((token, index) => {
    const atoms = sourceAtomMembership[index]!;
    if (!atoms.length || atoms.some((a) => !matches.has(a))) {
      unmatchedTokens.push({ index, text: token.text, entryId: token.entryId });
      return;
    }
    const recognitionIndexes = [...new Set(atoms.flatMap((a) => recognizedAtoms[matches.get(a)!]!.indexes))].sort((a, b) => a - b);
    if (recognitionIndexes.some((i) => invalidOffsets.has(i))) {
      unmatchedTokens.push({ index, text: token.text, entryId: token.entryId });
      return;
    }
    const offsets = recognitionIndexes.map((i) => recognizedWords[i]!);
    const confidenceValues = offsets.map((w) => w.confidence).filter((c): c is number => c !== undefined && c !== null);
    const confidence = confidenceValues.length ? Math.min(...confidenceValues) : null;
    if (confidence !== null && confidence < 0.65) lowConfidenceTokens.push({ index, text: token.text, confidence });
    words.push({ ...token, sourceTokenIndex: index, startSeconds: offsets[0]!.startSeconds,
      endSeconds: Math.max(...offsets.map((w) => w.endSeconds!)), confidence,
      normalized: offsets.length !== 1 || offsets[0]!.word.toLowerCase() !== token.text.toLowerCase() });
  });
  const unexpectedWords = recognizedWords.flatMap((w, index) => matchedRecognition.has(index) ? [] : [{ index, text: w.word }]);
  if (unmatchedTokens.length) error("unmatched-script", `${unmatchedTokens.length} script words lack reliable timing: ${unmatchedTokens.slice(0, 12).map((w) => w.text).join(" ")}`);
  if (unexpectedWords.length) error("unexpected-speech", `${unexpectedWords.length} recognized words are absent from the narration: ${unexpectedWords.slice(0, 12).map((w) => w.text).join(" ")}`);
  if (lowConfidenceTokens.length) error("low-confidence", `${lowConfidenceTokens.length} script words have recognition confidence below 0.65.`);
  if (words.some((w) => w.confidence === null)) issues.push({ code: "unknown-confidence", message: "Some recognition words have no provider confidence; exact lexical coverage is established, acoustic confidence is unavailable.", severity: "warning" });
  const entries: TimedNarrationEntry[] = [];
  for (const chunk of chunks) {
    const wordStartIndex = words.findIndex((w) => w.entryId === chunk.entryId);
    const count = words.filter((w) => w.entryId === chunk.entryId).length;
    if (wordStartIndex < 0 || unmatchedTokens.some((w) => w.entryId === chunk.entryId)) continue;
    const wordEndIndex = wordStartIndex + count;
    const startSeconds = words[wordStartIndex]!.startSeconds;
    const endSeconds = words[wordEndIndex - 1]!.endSeconds;
    if (entries.length && startSeconds < entries[entries.length - 1]!.endSeconds - 0.05) error("overlapping-entries", `Entry ${chunk.entryId} begins before the previous entry ends.`);
    entries.push({ entryId: chunk.entryId, startSeconds, endSeconds, wordStartIndex, wordEndIndex });
  }
  return {
    version: DIRECTED_TIMING_VERSION, script: chunks.map((c) => c.text.trim()).join(" "), audioDurationSeconds, words, entries,
    diagnostics: { valid: !issues.some((i) => i.severity === "error"), coverage: source.length ? words.length / source.length : 0,
      recognitionCoverage: recognizedWords.length ? matchedRecognition.size / recognizedWords.length : 0,
      sourceTokenCount: source.length, matchedTokenCount: words.length, unmatchedTokens, unexpectedWords, lowConfidenceTokens, issues },
  };
}

export function assertReliableTiming(timing: DirectedTiming): void {
  if (timing.version !== DIRECTED_TIMING_VERSION || !timing.diagnostics.valid || !timing.words.length ||
    timing.diagnostics.coverage !== 1 || timing.diagnostics.recognitionCoverage !== 1 ||
    timing.words.length !== timing.diagnostics.sourceTokenCount) {
    throw new Error(`Directed timing requires re-alignment or audio review: ${timing.diagnostics.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ") || "Incomplete or stale alignment."}`);
  }
  if (timing.words.map((word) => word.text).join(" ") !== timing.script.replace(/\s+/g, " ").trim() ||
    timing.words.some((word, index) => word.sourceTokenIndex !== index || !Number.isFinite(word.startSeconds) ||
      !Number.isFinite(word.endSeconds) || word.startSeconds < 0 || word.endSeconds <= word.startSeconds ||
      word.endSeconds > timing.audioDurationSeconds + 0.05 || (word.confidence !== null && word.confidence < 0.65))) {
    throw new Error("Directed timing requires re-alignment or audio review: cached word evidence does not match the narration or audio.");
  }
  let cursor = 0;
  for (const entry of timing.entries) {
    if (entry.wordStartIndex !== cursor || entry.wordEndIndex <= cursor || entry.wordEndIndex > timing.words.length ||
      timing.words.slice(cursor, entry.wordEndIndex).some((word) => word.entryId !== entry.entryId) ||
      entry.startSeconds !== timing.words[cursor]!.startSeconds || entry.endSeconds !== timing.words[entry.wordEndIndex - 1]!.endSeconds) {
      throw new Error("Directed timing requires re-alignment or audio review: entry boundaries do not match word evidence.");
    }
    cursor = entry.wordEndIndex;
  }
  if (cursor !== timing.words.length) throw new Error("Directed timing requires re-alignment or audio review: incomplete entry coverage.");
}
