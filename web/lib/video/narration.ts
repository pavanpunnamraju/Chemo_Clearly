import type { ContentEntry, RegimenContent, Tier } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";

export interface SlideBeat {
  entryId: string;
  /** The entry's section (e.g. "side_effects", "overview") — used to pick
   * which curated illustration folder a slide draws from. Threaded from
   * `ContentEntry.sectionId` at construction time rather than re-derived
   * from `entryId` string-parsing (entryId's shape is an implementation
   * detail, not a contract). */
  sectionId: string;
  startSeconds: number;
  headline: string;
  body: string;
  /** The entry's own tags (`ContentEntry.tags`) — used by the Scene archetype's
   * tag-driven `side_effects` subject rule (video-composition/SlideVideo.tsx),
   * not derived from narration text like the old keyword-trigger mechanism was. */
  tags: string[];
  /** The entry's own `tier` (video_visual_system.md's Alert archetype) — which
   * `emergency`-section entries get a fixed-slot card vs. the section's plain
   * framing/closing beats. Threaded from `ContentEntry.tier`, same pattern as `tags`. */
  tier?: Tier;
  /** Alert archetype closing split-card text — only set on the `emergency`
   * section's closing entry. Threaded from `ContentEntry.call911`/`callTeam`. */
  call911?: string;
  callTeam?: string;
  /** Quote archetype (video_visual_system.md) pull-quote — threaded from
   * `ContentEntry.onScreen`, `patient_voices` quote entries only. */
  onScreen?: string;
  /** `overview`'s headline-reveal beat (video_visual_system.md's Scene
   * archetype, round 2 reorder): the real timestamp of "R-CHOP"'s first
   * spoken mention, guard-checked by `applyTimepoints` — undefined when no
   * confident early match was found, in which case the headline renders
   * immediately (its original, pre-reorder behavior) instead of risking a
   * mistimed reveal. */
  headlineRevealSeconds?: number;
  /** `overview`'s per-drug tag beat (round 4): the entry's own `drugNames`
   * (`ContentEntry.drugNames`), threaded the same way `tags`/`tier` are.
   * Undefined until content authoring backfills the field. */
  drugNames?: string[];
  /** One real (or interpolated-fallback) reveal timestamp per `drugNames`
   * entry, same order — computed by `applyTimepoints`. Undefined until
   * `drugNames` is set and timepoints have been applied. */
  drugTagReveals?: number[];
}

export interface NarrationPlan {
  /** Full narration text sent to TTS, verbatim canonical text joined + citation markers stripped. */
  script: string;
  slides: SlideBeat[];
  totalSeconds: number;
}

// Narration speaking-rate assumption for slide-cue timing, in words/second.
// Matches typical unhurried narrated-slide pacing (~150 wpm). This only
// affects when a slide *changes on screen* relative to the narration audio,
// not the audio itself (which comes from the real TTS call) — approximate
// timing is acceptable for v1's narrated-slides format.
const WORDS_PER_SECOND = 2.5;

// Phase 2a goal #10a: threshold for the illustration-timing check in
// applyTimepoints below (~1s, per human sign-off — a visible mistime, not
// normal alignment jitter).
const ILLUSTRATION_TIMING_THRESHOLD_SECONDS = 1;

export function cleanForSpeechAndDisplay(text: string): string {
  // Display/narration cleanup only — never changes a claim or its phrasing,
  // just the raw-markdown formatting from docs/content/*.md that isn't
  // meaningful spoken/rendered as literal characters (neither the TTS voice
  // nor the plain-<p> slide component interprets markdown).
  return text
    .replace(/^\s*-\s+/gm, "") // leading bullet markers
    .replace(/^\s*>\s?/gm, "") // leading blockquote markers (patient_voices quote entries)
    .replace(/\s*\n+\s*/g, " ") // newlines -> single space (do this before **/` stripping below, since those spans can be hard-wrapped across lines in the source markdown)
    .replace(/\s*\[[A-Za-z0-9,\s]+\]/g, "") // citation markers like "[S1, S2]"
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1") // **bold**
    .replace(/`([^`]*)`/g, "$1") // `code`
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface RewrittenChunk {
  entryId: string;
  text: string;
}

/**
 * Builds narration script + slide cues from the LLM-rewritten chunks
 * (lib/video/rewrite.ts, #3c) instead of verbatim source text — same shape
 * as buildNarrationPlan (used by the deterministic no-rewrite path), just a
 * different text source. Headline still comes from the canonical entry
 * (rewrite.ts doesn't invent entry names), one slide per chunk, same order.
 */
export function buildNarrationPlanFromChunks(
  chunks: RewrittenChunk[],
  entries: ContentEntry[],
): NarrationPlan {
  const byId = new Map(entries.map((e) => [e.id, e]));

  const scriptParts: string[] = [];
  const slides: SlideBeat[] = [];
  let cumulativeSeconds = 0;

  for (const chunk of chunks) {
    const entry = byId.get(chunk.entryId);
    if (!entry || !chunk.text.trim()) continue;

    slides.push({
      entryId: chunk.entryId,
      sectionId: entry.sectionId,
      startSeconds: cumulativeSeconds,
      headline: entryHeadline(entry),
      body: chunk.text,
      tags: entry.tags,
      drugNames: entry.drugNames,
      tier: entry.tier,
      call911: entry.call911,
      callTeam: entry.callTeam,
      onScreen: entryOnScreen(entry),
    });

    scriptParts.push(chunk.text);
    const wordCount = chunk.text.split(/\s+/).filter(Boolean).length;
    cumulativeSeconds += wordCount / WORDS_PER_SECOND;
  }

  return {
    script: scriptParts.join(" "),
    slides,
    totalSeconds: cumulativeSeconds,
  };
}

function entryHeadline(entry: ContentEntry): string {
  if (entry.name) return entry.name;
  return entry.sectionId
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

// A section-level entry (no `name` — e.g. `timeline`/`side_effects`'s
// pre-first-`###` intro) has nothing authored in its own `**on-screen:**`
// field today, but its `**plain:**` is already the one short display
// sentence the Title Card archetype (video_visual_system.md) needs verbatim
// — not the LLM-rewritten narration `body`, same reasoning `onScreen` exists
// for at all (patient_voices quotes, timeline sub-entries). Falls back to it
// only when nothing was explicitly authored, so every other entry's
// (possibly-undefined) `onScreen` is untouched.
function entryOnScreen(entry: ContentEntry): string | undefined {
  if (entry.onScreen) return entry.onScreen;
  return entry.name ? undefined : cleanForSpeechAndDisplay(entry.plain);
}

function entryNarrationText(entry: ContentEntry, includeDetail: boolean): string {
  const parts = [cleanForSpeechAndDisplay(entry.plain)];
  if (includeDetail && entry.detail) parts.push(cleanForSpeechAndDisplay(entry.detail));
  return parts.join(" ");
}

/**
 * Builds narration script + slide cues by concatenating the canonical `plain`
 * (+ `detail`, if requested) text for each selected entry, in the order given.
 * Deterministic — no LLM involved here, so the guardrail holds regardless of
 * how `entryIds` was produced.
 */
export function buildNarrationPlan(
  content: RegimenContent,
  entryIds: string[],
  filter: PersonalizationFilter,
): NarrationPlan {
  const byId = new Map(content.entries.map((e) => [e.id, e]));

  const scriptParts: string[] = [];
  const slides: SlideBeat[] = [];
  let cumulativeSeconds = 0;

  for (const id of entryIds) {
    const entry = byId.get(id);
    if (!entry) continue;

    const text = entryNarrationText(entry, filter.includeDetail);
    if (!text) continue;

    slides.push({
      entryId: entry.id,
      sectionId: entry.sectionId,
      startSeconds: cumulativeSeconds,
      headline: entryHeadline(entry),
      body: text,
      tags: entry.tags,
      drugNames: entry.drugNames,
      tier: entry.tier,
      call911: entry.call911,
      callTeam: entry.callTeam,
      onScreen: entryOnScreen(entry),
    });

    scriptParts.push(text);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    cumulativeSeconds += wordCount / WORDS_PER_SECOND;
  }

  return {
    script: scriptParts.join(" "),
    slides,
    totalSeconds: cumulativeSeconds,
  };
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Cloud Speech-to-Text normalizes every spoken number to digits in its
// transcript ("seven" -> "7", "eleven" -> "11", even a compound like
// "twenty-one" collapses to the single token "21") regardless of how the
// script spelled it — verified against real aligned output (see round 6's
// investigation, docs/references/handoff.md). matchTimestamps searches the
// script's own words against that transcript, so any anchor phrase that
// happens to spell a number out in words rather than digits (the LLM
// rewriter isn't told which form to use, and picks one or the other
// per-call) never matches at all, silently falling back to the word-count
// *estimate* for that slide — a real, no-warning position error, not a rare
// edge case (this round's rewrite spelled every timeline day number as
// words and 3 of 4 timeline nodes fell back). Spelling every number word
// out to its digit string before matching, so both sides compare in the
// same (digit) form STT actually produces, fixes it regardless of which
// style a given rewrite happens to use. Scoped to 0-99 (everyday
// day/cycle/week counts in this content) — a token beyond that range is
// left as-is and just won't match, same as before this fix.
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const TENS_WORDS = "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
const ONES_WORDS =
  "one|two|three|four|five|six|seven|eight|nine";

function spelledNumbersToDigits(text: string): string {
  return text
    .replace(new RegExp(`\\b(${TENS_WORDS})[\\s-](${ONES_WORDS})\\b`, "gi"), (_, tens, ones) =>
      String(NUMBER_WORDS[tens.toLowerCase()]! + NUMBER_WORDS[ones.toLowerCase()]!),
    )
    .replace(/\b[a-z]+\b/gi, (word) => {
      const n = NUMBER_WORDS[word.toLowerCase()];
      return n === undefined ? word : String(n);
    });
}

/** First index in `[from, to)` where `haystack` contains `needle` as a contiguous run, or -1. */
function findPhrase(haystack: string[], needle: string[], from: number, to: number = haystack.length): number {
  if (needle.length === 0) return -1;
  const limit = Math.min(to, haystack.length) - needle.length;
  for (let i = from; i <= limit; i++) {
    let matches = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return i;
  }
  return -1;
}

/**
 * Replaces the word-count-estimated slide timing with real per-word
 * timestamps from Speech-to-Text alignment (see lib/video/align.ts) and the
 * actual rendered audio duration — this is what keeps narration and
 * on-screen text in sync instead of drifting apart as script length grows.
 *
 * Matches by word *content*, not position: for each slide, scans forward
 * (never backward, so slide order is preserved) from the previous match for
 * a run of the slide's first 3 words appearing consecutively in the aligned
 * word list — falling back to 2 words, then 1, only if a 3-word run isn't
 * found. Content-based because raw word-count position drifts — Speech-to-Text
 * expands things like "100.4°F" into several spoken words ("one hundred
 * point four degrees fahrenheit"), while our script is one whitespace token,
 * so index position and STT position diverge more with every number/symbol
 * in the text.
 *
 * Requires a multi-word run, not just any single matching word: a single
 * common word (e.g. "days", "your") recurs throughout the whole script, so
 * matching on it alone can find a false hit inside an *earlier* slide's
 * still-playing audio — collapsing that earlier slide's on-screen duration
 * and making the next slide appear to jump in early/skip content. A 3-word
 * run repeating by chance is far less likely.
 */
// `overview`'s headline is meant to appear at "R-CHOP"'s *first* spoken
// mention (round 2 reorder). Cloud Speech-to-Text always splits "R-CHOP"
// into two separate words ("r", "chop") regardless of the script's hyphen,
// and a garbled first mention ("our chop" — verified live against a real
// R-CHOP render) makes a normal forward-scanning anchor match silently skip
// past it and lock onto a later, correctly-heard occurrence instead — a real
// mistiming, not a hypothetical. Deliberately not routed through
// matchTiered/matchTimestamps' shared cursor: this is a one-off, tightly
// scoped search for one literal two-word pair near the section's own start,
// not a general anchor. Bounded to a short window after the section starts
// (comfortably past where "R-CHOP" is actually spoken in every observed
// render) so a garbled/missing first mention falls back to the slide's
// default (immediate) headline timing rather than anchoring to the wrong
// occurrence.
const HEADLINE_GUARD_SECONDS = 10;

function findOverviewHeadlineReveal(
  alignedWords: { word: string; startSeconds: number }[],
  sectionStartSeconds: number,
): number | undefined {
  const windowEnd = sectionStartSeconds + HEADLINE_GUARD_SECONDS;
  for (let i = 0; i < alignedWords.length - 1; i++) {
    const w = alignedWords[i]!;
    if (w.startSeconds < sectionStartSeconds) continue;
    if (w.startSeconds > windowEnd) break;
    if (normalizeWord(w.word) === "r" && normalizeWord(alignedWords[i + 1]!.word) === "chop") {
      return w.startSeconds;
    }
  }
  return undefined;
}

// Round 2's approved candidate 2 for `overview`'s per-drug tag beat: reuse
// the existing neighbor-context/corroboration matching (`matchTiered`, via
// `matchTimestamps`) rather than any per-drug lookup/alias table — evidence
// (docs/references/handoff-overview-timing.md) showed context words already
// recover most drug names even when the name itself is mis-transcribed, and
// a bare single-word anchor fails structurally regardless of transcription
// quality. Anchor text is pulled from the slide's own actual narration prose
// (the drug name's own real position in `slide.body`, plus a couple of
// *trailing* words), not hand-written per regimen, so this works on any
// regimen's drug names without per-regimen code.
//
// Deliberately trailing-only, never leading: the anchor's word 0 is always
// the drug name's own first word, so a clean match lands exactly on the
// drug's own utterance. Leading context was tried and rejected — it made
// `matchTiered` return the *context* word's earlier position instead
// (verified live: an anchor of "comes from Rituximab" resolved to "comes",
// two words before Rituximab actually plays). When the drug name itself is
// what's garbled, `matchTimestamps`' own existing skip-lead-word retry
// (drops the anchor's own first word, tries the trailing words alone)
// already recovers it — same mechanism round 1 observed rescue "Oncovin" via
// "and Prednisone" right after it, with no extra code needed here.
const DRUG_ANCHOR_CONTEXT_WORDS = 3;

// Drug names are typically narrated back-to-back in a comma list ("Rituximab,
// Cyclophosphamide, doxorubicin, ..."), so a trailing context window can
// easily reach into the *next* drug's own name — verified live: an
// unresolvable drug's anchor then skip-lead-retries onto trailing words that
// turn out to be the next drug's name, landing both tags on the same
// timestamp. `stopIndex` (the next drug's own body position, precomputed by
// the caller) caps the window so that never happens, regardless of how
// tightly a regimen's drug list is packed.
function buildDrugAnchor(bodyWords: string[], bodyNormalized: string[], drugName: string, stopIndex: number): string {
  const drugWords = drugName.split(/\s+/).filter(Boolean).map(normalizeWord).filter(Boolean);
  const index = findPhrase(bodyNormalized, drugWords, 0);
  // Drug name not found verbatim in this render's (possibly LLM-rewritten)
  // prose — fall back to the bare name; still handled by matchTiered's own
  // weak tiers, just without the extra context boost.
  if (index === -1) return drugName;
  const wordsEnd = index + drugWords.length;
  const to = Math.max(wordsEnd, Math.min(bodyWords.length, stopIndex, wordsEnd + DRUG_ANCHOR_CONTEXT_WORDS));
  return bodyWords.slice(index, to).join(" ");
}

/**
 * Per-drug tag reveal timestamps for `overview`'s beat 3 (round 4) — one per
 * `slide.drugNames` entry, same order. Whatever doesn't resolve confidently
 * is interpolated evenly between its nearest resolved neighbors (or the
 * slide's own start/end) instead of being left unplaced — same
 * tolerance-for-imprecision fallback shape this file already uses for
 * slide-level timing (the word-count estimate) and captions.ts uses for
 * caption chunks (starting at the predecessor's end).
 */
function computeDrugTagReveals(
  slide: SlideBeat,
  sectionEndSeconds: number,
  alignedWords: { word: string; startSeconds: number }[],
): number[] {
  const drugNames = slide.drugNames!;
  const scoped = alignedWords.filter(
    (w) => w.startSeconds >= slide.startSeconds && w.startSeconds < sectionEndSeconds,
  );

  const bodyWords = slide.body.split(/\s+/).filter(Boolean);
  const bodyNormalized = bodyWords.map(normalizeWord);
  // Each drug's own body position, in narration order — used both to build
  // its anchor and to cap the *next* drug's trailing-context window so it
  // can never swallow this one's name (see buildDrugAnchor).
  const drugBodyIndexes = drugNames.map((name) => {
    const words = name.split(/\s+/).filter(Boolean).map(normalizeWord).filter(Boolean);
    return findPhrase(bodyNormalized, words, 0);
  });
  const anchors = drugNames.map((name, i) => {
    const next = drugBodyIndexes[i + 1];
    const stopIndex = next != null && next !== -1 ? next : bodyWords.length;
    return buildDrugAnchor(bodyWords, bodyNormalized, name, stopIndex);
  });

  // `overview` is one long slide (no per-drug sub-beats), so the first drug
  // name commonly sits well past the 1-word fallback tier's bounded
  // lookahead from a fresh cursor — verified live: real R-CHOP narration
  // puts "Rituximab" ~50 words in, past MAX_1WORD_LOOKAHEAD (40). A comma-
  // packed drug list ("Rituximab, Cyclophosphamide, ...") also often leaves
  // *no* safe trailing word before the next drug's own name, so the first
  // anchor can be as short as the bare drug name. A throwaway lead-in
  // anchor — real body prose right before the first drug name, using the
  // same 3-8 word ambiguity-checked tier every other anchor in this file
  // already relies on — advances the shared cursor close enough that every
  // real per-drug anchor after it is comfortably inside the lookahead
  // window. Its own match is discarded; only reveal timing for `drugNames`
  // matters.
  const LEAD_IN_WORDS = 8;
  const firstDrugIndex = drugBodyIndexes[0];
  const hasLeadIn = firstDrugIndex != null && firstDrugIndex > 0;
  const leadInAnchor = hasLeadIn
    ? bodyWords.slice(Math.max(0, firstDrugIndex! - LEAD_IN_WORDS), firstDrugIndex!).join(" ")
    : null;

  const rawMatches = matchTimestamps(
    leadInAnchor ? [leadInAnchor, ...anchors] : anchors,
    scoped.length > 0 ? scoped : alignedWords,
  );
  const matches = leadInAnchor ? rawMatches.slice(1) : rawMatches;

  const reveals: (number | null)[] = [...matches];
  // Fill every null by interpolating between its nearest resolved
  // neighbors (or the slide's own start/end bounds), one contiguous run at
  // a time, so an unresolved run spaces out evenly instead of collapsing
  // onto a single bound.
  let i = 0;
  while (i < reveals.length) {
    if (reveals[i] != null) {
      i++;
      continue;
    }
    let j = i;
    while (j < reveals.length && reveals[j] == null) j++;
    const lowerBound = i === 0 ? slide.startSeconds : reveals[i - 1]!;
    const upperBound = j === reveals.length ? sectionEndSeconds : reveals[j]!;
    const runLength = j - i;
    for (let k = 0; k < runLength; k++) {
      const t = (k + 1) / (runLength + 1);
      reveals[i + k] = lowerBound + (upperBound - lowerBound) * t;
    }
    i = j;
  }

  return reveals as number[];
}

export function applyTimepoints(
  plan: NarrationPlan,
  alignedWords: { word: string; startSeconds: number }[],
  audioDurationSeconds: number,
): NarrationPlan {
  const matches = matchTimestamps(
    plan.slides.map((s) => s.body),
    alignedWords,
  );

  // Narration is spoken in a fixed, strictly sequential order, so a later
  // slide's real start can never precede an earlier slide's. Without this
  // guard, a slide whose own text failed to find a real word-alignment match
  // (short/generic bodies are the common case — see matchTimestamps' docs on
  // the 1/2-word fallback's limited lookahead) keeps its word-count
  // *estimate* instead, which is scaled to the estimated total duration, not
  // the real one — mixing that estimate in among neighbors that DID get real
  // (differently-scaled) matches can put it out of order. On screen that
  // shows up as the affected slide flashing for ~1 frame while its
  // predecessor holds far too long (SlideVideo.tsx derives each slide's
  // duration from the next slide's startSeconds). Clamping forward instead
  // of trusting the raw value can't undo a wrong estimate, but it guarantees
  // the sequence never runs backward.
  let previousStart = -Infinity;
  const slides = plan.slides.map((slide, i) => {
    const matched = matches[i];
    const candidate = matched == null ? slide.startSeconds : matched;
    const startSeconds = Math.max(candidate, previousStart);
    previousStart = startSeconds;
    // Phase 2a goal #10a: illustration-timing check — hard failure, not a
    // warning (a badly-mistimed render must not exit 0 and get published).
    // A few ms of drift is normal; only a clamp large enough to visibly show
    // the wrong slide's illustration while the wrong narration is playing
    // trips this.
    if (matched != null && Math.abs(startSeconds - matched) > ILLUSTRATION_TIMING_THRESHOLD_SECONDS) {
      throw new Error(
        `Illustration timing check: slide "${slide.entryId}" clamped from its matched cue ${matched.toFixed(2)}s to ${startSeconds.toFixed(2)}s (drift ${(startSeconds - matched).toFixed(2)}s) — its illustration may show during the wrong narration content.`,
      );
    }
    if (slide.sectionId === "overview") {
      return { ...slide, startSeconds, headlineRevealSeconds: findOverviewHeadlineReveal(alignedWords, startSeconds) };
    }
    return { ...slide, startSeconds };
  });

  const slidesWithDrugTags = slides.map((slide, i) => {
    if (slide.sectionId !== "overview" || !slide.drugNames || slide.drugNames.length === 0) return slide;
    const sectionEnd = slides[i + 1]?.startSeconds ?? audioDurationSeconds;
    return { ...slide, drugTagReveals: computeDrugTagReveals(slide, sectionEnd, alignedWords) };
  });

  return { ...plan, slides: slidesWithDrugTags, totalSeconds: audioDurationSeconds };
}

/**
 * Content-based text-to-timestamp matching, shared by applyTimepoints
 * (slide cues) and components.ts (icon placement) — same 3/2/1-word
 * forward-scanning strategy documented above, generalized to any ordered
 * list of anchor texts instead of just slide bodies. Returns one result per
 * anchor, in order; `null` where no match was found (caller decides the
 * fallback — a slide keeps its word-count estimate, a component is simply
 * not placed).
 */
// 1-word and 2-word fallback matches are weak signals — ordinary words and
// short phrases recur throughout a script, so unbounded, either can
// spuriously match far ahead of where the anchor is actually spoken.
// Because the cursor only moves forward and never backtracks, one bad jump
// strands every later anchor behind it with no way to recover (verified
// live: a chain of unbounded 1- and 2-word matches dragged the cursor to
// word ~1300-1384 of 1386 while still describing content from well earlier
// in the narration, leaving nothing left to match against for the rest of
// the script). Cap how far ahead a weak fallback may look; beyond that,
// treat it as no match (existing null handling — caller keeps its estimate)
// rather than accepting a far-flung guess. Legitimate adjacent-anchor jumps
// in this codebase's real narration data are consistently under ~15 words;
// these caps are generous multiples of that, tight enough to reject the
// observed false jumps (jumps of 50-500+ words) without rejecting real
// matches after a short run of consecutive failures. The 3-word match isn't
// bounded — an exact 3-word run repeating by chance is far less likely.
const MAX_1WORD_LOOKAHEAD = 40;
const MAX_2WORD_LOOKAHEAD = 60;

// Being the *only* occurrence in the lookahead window (the ambiguity guard
// above) isn't proof a weak candidate is actually this anchor's word — it
// only rules out a second copy of that same word nearby. Verified live
// (round 8): when Speech-to-Text drops an entire run of an anchor's real
// words outright (documented above — not just mis-hearing one), the weak
// tier can still land on a *different*, nearby anchor's word that happens to
// be the only copy of itself in the window, and wrongly accept it — visible
// as several captions collapsing to the same timestamp and then jumping
// ("freeze-then-catch-up"). Requiring at least one of the anchor's own next
// few words to also turn up shortly after the candidate confirms it's really
// sitting inside this anchor's speech, not a coincidence, while still
// allowing the single-mis-heard-leading-word recovery this tier exists for
// (the anchor's later words still corroborate even when its first token
// didn't survive Speech-to-Text — see round 6's "vincristine" case above).
const WEAK_MATCH_CONFIRM_WORDS = 4;
const WEAK_MATCH_CONFIRM_WINDOW = 8;

function weakMatchCorroborated(
  normalizedAligned: string[],
  anchorWords: string[],
  phraseLength: number,
  candidateIndex: number,
): boolean {
  // Nothing left of the anchor to check against — accept as before.
  if (anchorWords.length <= phraseLength) return true;
  const confirmWords = anchorWords.slice(phraseLength, phraseLength + WEAK_MATCH_CONFIRM_WORDS);
  const from = candidateIndex + phraseLength;
  const to = from + WEAK_MATCH_CONFIRM_WINDOW;
  return confirmWords.some((word) => findPhrase(normalizedAligned, [word], from, to) !== -1);
}

// Longest phrase the ambiguity-aware tier below will try before giving up
// and falling back to the bounded 2-/1-word tiers.
const MAX_PHRASE_LENGTH = 8;

// Tries the 3+/2/1-word tiers (documented above) against `anchorWords`
// starting at `from`. Factored out so it can run twice per anchor — once
// against the anchor's own leading words, once (see matchTimestamps) against
// the same anchor with its first word dropped.
function matchTiered(
  normalizedAligned: string[],
  anchorWords: string[],
  from: number,
): { index: number; phraseLength: number } | null {
  // A 3-word match repeating by chance is rare, but this content
  // deliberately repeats some safety lines verbatim (e.g. "call your care
  // team"), so trusting the first 3-word hit unconditionally can grab the
  // wrong occurrence and strand every later anchor behind it (shared
  // forward-only cursor). Instead, grow the phrase (3, 4, 5, ... up to
  // MAX_PHRASE_LENGTH) until one is found that occurs exactly once from
  // `from` onward; only that unambiguous hit is trusted.
  const maxLen = Math.min(MAX_PHRASE_LENGTH, anchorWords.length);
  for (let phraseLength = 3; phraseLength <= maxLen; phraseLength++) {
    const needle = anchorWords.slice(0, phraseLength);
    const firstHit = findPhrase(normalizedAligned, needle, from);
    if (firstHit === -1) continue;
    const secondHit = findPhrase(normalizedAligned, needle, firstHit + phraseLength);
    if (secondHit === -1) return { index: firstHit, phraseLength };
    // Ambiguous (occurs again later) — try one word longer instead of
    // trusting this occurrence.
  }
  for (const phraseLength of [2, 1]) {
    if (anchorWords.length < phraseLength) continue;
    const to = phraseLength === 1 ? from + MAX_1WORD_LOOKAHEAD : from + MAX_2WORD_LOOKAHEAD;
    const needle = anchorWords.slice(0, phraseLength);
    const index = findPhrase(normalizedAligned, needle, from, to);
    if (index === -1) continue;
    // Same ambiguity guard as the 3+ word tier above, extended down here:
    // verified live that Speech-to-Text can drop a whole run of words from
    // its transcript outright (not just mis-hear one), so the anchor's real
    // occurrence simply isn't in `normalizedAligned` at all — yet a common
    // short word (e.g. "a") is almost always still findable somewhere in the
    // bounded lookahead window by coincidence. Without this check that
    // coincidence gets accepted as if it were the real position, which
    // permanently strands the forward-only cursor ahead of every anchor
    // still waiting behind it (freeze-then-catch-up in captions/slides).
    // Requiring the fallback word/bigram to be the *only* one in the window
    // rejects exactly that false-positive case while still allowing a
    // genuinely distinctive skip-lead recovery (e.g. "vincristine" mis-heard
    // but "one" right after it unique nearby) to succeed.
    if (findPhrase(normalizedAligned, needle, index + phraseLength, to) !== -1) continue;
    if (!weakMatchCorroborated(normalizedAligned, anchorWords, phraseLength, index)) continue;
    return { index, phraseLength };
  }
  return null;
}

export function matchTimestamps(
  anchorTexts: string[],
  alignedWords: { word: string; startSeconds: number }[],
): (number | null)[] {
  const normalizedAligned = alignedWords.map((w) => normalizeWord(w.word));
  let cursor = 0;

  return anchorTexts.map((text, anchorIndex) => {
    const words = spelledNumbersToDigits(text)
      .split(/\s+/)
      .filter(Boolean)
      .map(normalizeWord)
      .filter(Boolean);

    let result = matchTiered(normalizedAligned, words, cursor);
    // Every tier above is anchored at the anchor's own word 0, so none of
    // them can recover when STT mishears/drops that specific word — verified
    // live: Speech-to-Text transcribed "Vincristine" (an uncommon drug name)
    // as "Christine", so "vincristine"/"vincristine one"/"vincristine one of"
    // all failed to appear anywhere in the transcript even though "one of
    // the medications..." right after it matched perfectly. Retrying once
    // with the anchor's first word dropped catches exactly that case.
    // Bounded to a single skipped word (not open-ended) — same
    // weak-match-drifts-forward risk as the 1/2-word tiers themselves, so
    // this isn't a general "search anywhere" fallback, just enough to
    // survive one bad leading word.
    let skippedLeadWord = false;
    if (!result && words.length > 1) {
      result = matchTiered(normalizedAligned, words.slice(1), cursor);
      skippedLeadWord = result !== null;
    }
    if (process.env.MATCH_DEBUG) {
      console.error(
        `MATCH_DEBUG anchor[${anchorIndex}] "${words.slice(0, 3).join(" ")}" -> ${
          result === null
            ? "NO MATCH"
            : `${skippedLeadWord ? "skip-lead+" : ""}${result.phraseLength}-word match @ word ${result.index}`
        }`,
      );
    }
    if (result === null) return null;

    cursor = result.index;
    return alignedWords[result.index]!.startSeconds;
  });
}
