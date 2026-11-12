import {directTransitions} from './transition-director';
import {transitionScenesForDirection,validateTransitionPlan} from './transition-plan';
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ContentEntry, RegimenContent, SectionId } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";
import { getGenAIClient } from "../gemini/client";
import { cleanForSpeechAndDisplay } from "./narration";
import { MOTION_ASSETS, MOTION_ACTIONS, SCENE_KINDS, type MotionAsset, type MotionAction, type SceneKind, type DirectedShot, type VisualDirection } from "./direction-types";
import { hasExactEntryCoverage } from "./select";
import { projectFeverSafetyCard } from "./safety-display";
import { planLibraryArtwork } from "./library-direction";

export const DIRECTOR_VERSION = "directed-source-library-v9-boundaries";
export const DIRECTOR_MODEL = "gemini-2.5-flash";

const SECTION_LABELS: Record<SectionId, string> = {
  overview: "Your treatment plan", timeline: "Your treatment rhythm", daily_life: "Life during treatment",
  side_effects: "What you may notice", emergency: "When to get help", fertility_intimacy: "You and the people you love",
  practical_life: "Taking care at home", patient_voices: "You are not alone", big_picture: "Looking ahead",
};
const SECTION_SCENES: Record<SectionId, SceneKind> = {
  overview: "treatment", timeline: "timeline", daily_life: "daily-life", side_effects: "symptom", emergency: "emergency",
  fertility_intimacy: "family", practical_life: "household", patient_voices: "quote", big_picture: "outlook",
};

export interface DirectorEntryTiming {
  entryId: string;
  startSeconds: number;
  endSeconds: number;
}
export interface DirectorWordTiming { text: string; startSeconds: number; endSeconds: number }
export interface DirectionTimingEvidence {
  entries: DirectorEntryTiming[];
  words: DirectorWordTiming[];
}
export interface DirectorInput {
  content: RegimenContent;
  filter: PersonalizationFilter;
  chunks: { entryId: string; text: string }[];
  entries: DirectorEntryTiming[];
  words: DirectorWordTiming[];
  totalSeconds: number;
}

function speechText(entry: ContentEntry): string {
  return cleanForSpeechAndDisplay([entry.name, entry.plain, entry.selfCare, entry.callTeamIf].filter(Boolean).join(" "));
}

function affirmativeAction(text: string, action: RegExp): boolean {
  // Deliberately conservative: symptom descriptions, negated actions and
  // restrictions cannot authorize depicting the action as patient advice.
  return cleanForSpeechAndDisplay(text).split(/;|(?<=[.!?])\s+|[,—]\s*(?=(?:avoid|don't|do not|never)\b)/i).some((clause) =>
    !/\b(?:not|never|avoid|cannot|can't|don't|do not|unable|difficulty|trouble|unless|only if|no need)\b/i.test(clause) && action.test(clause),
  );
}

/** Only source-supported actions can be selected. Listening/observing is always available. */
export function eligibleAssets(entry: ContentEntry): { asset: MotionAsset; actions: MotionAction[] }[] {
  // The complete fever-card renderer has one fixed thermometer illustration.
  // A source-supported phone instruction does not mean that scene can render
  // a phone action; expose only the action it actually depicts.
  if (projectFeverSafetyCard(entry)) return [{ asset: MOTION_ASSETS.find((asset) => asset.id === "patient-temperature")!, actions: ["temperature"] }];
  const source = speechText(entry).toLowerCase();
  const instructions = [entry.plain, entry.selfCare].filter(Boolean).join("; ");
  const allowed = new Set<MotionAction>(["observe"]);
  if (entry.sectionId === "overview") allowed.add("welcome");
  if (/infusion|intravenous|\biv\b/.test(source) && ["overview", "timeline"].includes(entry.sectionId)) allowed.add("infusion");
  if (affirmativeAction(instructions, /\b(?:(?:drink(?:ing)?|sip(?:ping)?)\s+(?:(?:plenty|more|enough|some|small\s+amounts|small\s+sips|extra)\s+(?:of\s+)?)?(?:clear\s+)?(?:water|fluids)|take\s+(?:small|frequent|regular)\s+sips\s+of\s+(?:clear\s+)?(?:water|fluids)|hydrat(?:e|ion)|stay(?:ing)?\s+(?:well[- ]?)?hydrated)\b/i)) allowed.add("drink");
  if (affirmativeAction(instructions, /\b(?:wash.{0,18}hands?|hand\s+hygiene)\b/i)) allowed.add("wash-hands");
  const infusionReaction = entry.sectionId === "emergency" && /infusion.*reaction|reaction.*infusion/i.test(entry.name ?? "");
  const feverThresholdEntry = /fever|temperature/i.test(entry.name ?? "") && /°|degrees|thermometer/i.test(entry.plain);
  if (!infusionReaction && (feverThresholdEntry || affirmativeAction(instructions, /\b(?:check|take|measure|monitor)\s+(?:your\s+)?temperature\b/i))) allowed.add("temperature");
  if (affirmativeAction(instructions, /(?:^|[—:]\s*)rest\b(?!\s+of\b)|\b(?:rest\s+when|(?:you\s+(?:can|should|may)|time\s+to)\s+rest|pace\s+activities|prioritize\s+sleep|sleep\s+routine|take\s+(?:regular\s+)?breaks)\b/i)) allowed.add("rest");
  if (affirmativeAction(instructions, /\b(?:(?:gentle|light)\s+(?:activity|movement|exercise)|gentle\s+stretch(?:es|ing)?|stretch(?:ing)?\s+(?:gently|your\s+(?:arms|legs|body)))\b|(?:^|[—:]\s*)stretch(?:\s|[.!?]|$)/i)) allowed.add("stretch");
  if (affirmativeAction(instructions, /\b(?:walk(?:s|ing)?|walking)\b/i)) allowed.add("walk");
  if (!infusionReaction && (Boolean(entry.callTeamIf?.trim()) || affirmativeAction(instructions, /\b(?:call|contact)\s+(?:your|the|911|care)/i))) allowed.add("call");
  if (["fertility_intimacy", "patient_voices", "big_picture"].includes(entry.sectionId)) allowed.add("support");
  if (entry.sectionId === "timeline" || (entry.sectionId === "overview" && /cycle|week|day/.test(source))) allowed.add("calendar");
  return MOTION_ASSETS.map((asset) => ({ asset, actions: asset.actions.filter((a) => allowed.has(a)) }))
    .filter((choice) => choice.actions.length > 0)
    // A passive action does not remove an asset's clinical props or setting.
    .filter(({ asset }) => asset.id !== "patient-temperature" || allowed.has("temperature"))
    .filter(({ asset }) => asset.id !== "patient-hydration" || allowed.has("drink"))
    .filter(({ asset }) => asset.id !== "patient-rest" || allowed.has("rest"))
    .filter(({ asset }) => asset.id !== "patient-treatment" || allowed.has("infusion"))
    .filter(({ asset }) => asset.id !== "patient-support" || allowed.has("support"));
}

/** Never split a clinical condition into a shorter, potentially misleading fragment. */
export function displayMessages(entry: ContentEntry): string[] {
  // Only explicitly authored display copy/headings, or a complete emergency
  // passage that fits. Never detach a sentence from its clinical conditions.
  const emergency = entry.sectionId === "emergency" ? cleanForSpeechAndDisplay(entry.plain) : undefined;
  const candidates = [entry.onScreen, entry.name, emergency && !/\b(?:this threshold|these|above|below|see the|see emergency)\b/i.test(emergency) ? emergency : undefined]
    .filter((s): s is string => Boolean(s)).map(cleanForSpeechAndDisplay)
    .filter((s) => s.length > 0 && s.length <= 170 && !/see\s+[`_]|\[S\d/i.test(s));
  return [...new Set(["", ...candidates])];
}

function sourceHeadline(entry: ContentEntry, content: RegimenContent): string {
  return cleanForSpeechAndDisplay(entry.sectionId === "overview" ? regimenDisplayTitle(content) : entry.name || SECTION_LABELS[entry.sectionId]);
}

export function regimenDisplayTitle(content: RegimenContent): string {
  return cleanForSpeechAndDisplay(content.title.split("—")[0] ?? content.title);
}

function sourceRefs(entry: ContentEntry): string[] {
  return [entry.id, ...(entry.source ? [entry.source] : [])];
}

const DecisionSchema = z.object({
  entryId: z.string(), assetId: z.string(), action: z.string(),
  camera: z.enum(["establish", "push-in", "detail", "drift"]),
  staging: z.enum(["left", "right"]),
  transition: z.enum(["zoom-through", "match-cut", "settle"]),
  messageIndex: z.number().int().nonnegative(), cue: z.string(), rationale: z.string().min(1),
}).strict();
export const DirectorDecisionsSchema = z.array(DecisionSchema);
type Decision = z.infer<typeof DecisionSchema>;

/** These are renderer capabilities, not aesthetic preferences. Fixed-layout
 * scenes must not accept controls whose visual effect they silently ignore. */
export function compositionCapabilities(entry: ContentEntry): { cameras: Decision["camera"][]; stagings: Decision["staging"][]; transitions: Decision["transition"][] } {
  const cameras: Decision["camera"][] = ["establish", "push-in", "detail", "drift"];
  const transitions: Decision["transition"][] = ["zoom-through", "match-cut", "settle"];
  if (entry.sectionId === "timeline") return { cameras: ["establish"], stagings: ["right"], transitions };
  if (projectFeverSafetyCard(entry)) return { cameras: ["establish"], stagings: ["left"], transitions: ["match-cut", "settle"] };
  if (entry.sectionId === "emergency") return { cameras, stagings: ["left"], transitions };
  if (entry.sectionId === "patient_voices") return { cameras, stagings: ["right"], transitions };
  return { cameras, stagings: ["left", "right"], transitions };
}

function supportsComposition(entry: ContentEntry, choice: { camera: DirectedShot["camera"]; staging: DirectedShot["staging"]; transition: DirectedShot["transition"] }): boolean {
  const capabilities = compositionCapabilities(entry);
  return capabilities.cameras.includes(choice.camera) && capabilities.stagings.some((staging) => staging === choice.staging) && capabilities.transitions.includes(choice.transition);
}

const StoredDirectionSchema = z.object({
  version: z.literal(DIRECTOR_VERSION), regimenId: z.string(), regimenTitle: z.string(),
  method: z.enum(["ai", "authored"]), totalSeconds: z.number().finite().positive(),
  shots: z.array(z.object({
    id: z.string(), entryId: z.string(), sectionId: z.string(),
    startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().positive(),
    cueSeconds: z.number().finite().nonnegative(), scene: z.enum(SCENE_KINDS),
    assetId: z.string(), action: z.enum(MOTION_ACTIONS),
    camera: DecisionSchema.shape.camera, staging: DecisionSchema.shape.staging,
    transition: DecisionSchema.shape.transition, headline: z.string(), message: z.string(),
    sourceRefs: z.array(z.string()), rationale: z.string().min(1),
    focus: z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict(),
    labels: z.array(z.string()),
    artworkBeats: z.array(z.object({ artworkId: z.string().min(1), startSeconds: z.number().finite().nonnegative(),
      endSeconds: z.number().finite().positive(), sourceRef: z.string().min(1), rationale: z.string().min(1) }).strict()).min(1),
    labelCues: z.array(z.object({ text: z.string().min(1), startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().positive() }).strict()).optional(),
    safetyCard: z.object({ criteria: z.array(z.string().min(1)).length(2), action: z.string().min(1), applicability: z.string().min(1) }).strict().optional(),
  }).strict()).min(1),
}).strict();

function normalizeWord(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }

/** Exact word-boundary matching only: punctuation can join a drug to prose,
 * but a similar-sounding drug or a substring can never stand in for it. */
export function sourceLabelCues(entry: ContentEntry, timing: DirectorEntryTiming, words: DirectorWordTiming[]): NonNullable<DirectedShot["labelCues"]> {
  if (entry.sectionId !== "overview" || !entry.drugNames?.length) return [];
  const scoped = words.filter((word) => word.startSeconds >= timing.startSeconds && word.startSeconds < timing.endSeconds && word.endSeconds <= timing.endSeconds + .001);
  const atoms = scoped.flatMap((word, index) => (word.text.toLowerCase().match(/[a-z]+/g) ?? []).map((text) => ({ text, index })));
  const mentions: { text: string; firstWord: number; lastWord: number }[] = [];
  for (const label of entry.drugNames) {
    const needle = label.toLowerCase().match(/[a-z]+/g) ?? [];
    if (!needle.length) continue;
    for (let i = 0; i <= atoms.length - needle.length; i++) {
      if (needle.every((text, j) => atoms[i + j]!.text === text)) mentions.push({ text: label, firstWord: atoms[i]!.index, lastWord: atoms[i + needle.length - 1]!.index });
    }
  }
  mentions.sort((a, b) => a.firstWord - b.firstWord || a.lastWord - b.lastWord);
  return mentions.flatMap((mention, index) => {
    const startSeconds = scoped[mention.firstWord]!.startSeconds;
    // Hold through the medicine's spoken sentence/clause, ending before a
    // subsequent medicine or a treatment-schedule phrase. Every boundary is
    // an observed word boundary; missing punctuation falls back to the actual
    // medicine utterance end rather than the overview's remaining duration.
    let endSeconds = scoped[mention.lastWord]!.endSeconds;
    for (let i = mention.lastWord; i < scoped.length; i++) {
      if (i > mention.lastWord && /\b(?:course|cycles?|weeks?|months?|schedule)\b/i.test(scoped[i]!.text)) {
        endSeconds = scoped[i - 1]!.endSeconds;
        break;
      }
      if (/[.!?;]["'”’)]*$/.test(scoped[i]!.text)) { endSeconds = scoped[i]!.endSeconds; break; }
    }
    const next = mentions[index + 1];
    if (next) endSeconds = Math.min(endSeconds, scoped[next.firstWord]!.startSeconds);
    return endSeconds > startSeconds ? [{ text: mention.text, startSeconds, endSeconds }] : [];
  });
}

function findCue(cue: string, timing: DirectorEntryTiming, words: DirectorWordTiming[]): number {
  const tokens = cue.split(/\s+/).map(normalizeWord).filter(Boolean);
  if (!tokens.length) return timing.startSeconds;
  if (tokens.length > 4) throw new Error(`Director cue must contain at most four words: ${timing.entryId}`);
  const within = words.filter((w) => w.startSeconds >= timing.startSeconds - 0.05 && w.startSeconds < timing.endSeconds);
  const matches: number[] = [];
  for (let i = 0; i <= within.length - tokens.length; i++) {
    if (tokens.every((word, j) => normalizeWord(within[i + j]!.text) === word)) matches.push(within[i]!.startSeconds);
  }
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new Error(`Director cue is ambiguous in ${timing.entryId}: ${cue}`);
  throw new Error(`Director cue cannot be timed in ${timing.entryId}: ${cue}`);
}

export function compileDirection(input: DirectorInput, raw: unknown, method: "ai" | "authored"): VisualDirection {
  const decisions = DirectorDecisionsSchema.parse(raw);
  const expected = input.chunks.map((c) => c.entryId);
  if (!hasExactEntryCoverage(expected, input.content.entries) ||
    !hasExactEntryCoverage(input.entries.map((entry) => entry.entryId), input.content.entries)) throw new Error("Director input must cover every source entry exactly once.");
  if (!Number.isFinite(input.totalSeconds) || input.totalSeconds <= 0 || input.filter.regimenId !== input.content.regimenId) throw new Error("Invalid director duration or regimen identity.");
  if (input.entries.some((entry) => !Number.isFinite(entry.startSeconds) || !Number.isFinite(entry.endSeconds) || entry.startSeconds < 0 || entry.endSeconds <= entry.startSeconds || entry.endSeconds > input.totalSeconds)) throw new Error("Invalid narration entry timing.");
  if (input.words.some((word) => !Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds) || word.startSeconds < 0 || word.endSeconds < word.startSeconds || word.endSeconds > input.totalSeconds)) throw new Error("Invalid director word timing.");
  if (decisions.length !== expected.length || new Set(decisions.map((d) => d.entryId)).size !== expected.length ||
      decisions.some((d, i) => d.entryId !== expected[i])) throw new Error("Director must cover each narration entry exactly once, in order.");
  const sources = new Map(input.content.entries.map((e) => [e.id, e]));
  const timings = new Map(input.entries.map((e) => [e.entryId, e]));
  const shots: DirectedShot[] = decisions.map((d, i) => {
    const entry = sources.get(d.entryId);
    const timing = timings.get(d.entryId);
    if (!entry || !timing) throw new Error(`Missing source/timing: ${d.entryId}`);
    if (!supportsComposition(entry, d)) throw new Error(`Unsupported scene composition for ${d.entryId}: ${d.camera}/${d.staging}/${d.transition}`);
    const choice = eligibleAssets(entry).find(({ asset }) => asset.id === d.assetId);
    if (!choice || !choice.actions.includes(d.action as MotionAction)) throw new Error(`Unsupported visual action for ${d.entryId}: ${d.assetId}/${d.action}`);
    const messages = displayMessages(entry);
    if (d.messageIndex >= messages.length) throw new Error(`Unknown source message for ${d.entryId}`);
    const endSeconds = i + 1 < expected.length ? timings.get(expected[i + 1]!)!.startSeconds : input.totalSeconds;
    if (!(endSeconds > timing.startSeconds)) throw new Error(`Invalid shot duration: ${d.entryId}`);
    return {
      id: `shot-${i + 1}`, entryId: entry.id, sectionId: entry.sectionId,
      startSeconds: i === 0 ? 0 : timing.startSeconds, endSeconds,
      cueSeconds: findCue(d.cue, timing, input.words), scene: SECTION_SCENES[entry.sectionId],
      assetId: choice.asset.id, action: d.action as MotionAction, camera: d.camera, staging: d.staging,
      transition: d.transition, headline: sourceHeadline(entry, input.content), message: messages[d.messageIndex]!,
      sourceRefs: sourceRefs(entry), rationale: d.rationale,
      focus: choice.asset.focus,
      labels: entry.sectionId === "overview" ? entry.drugNames ?? [] : [],
      labelCues: sourceLabelCues(entry, timing, input.words),
      artworkBeats: planLibraryArtwork(entry, { startSeconds: i === 0 ? 0 : timing.startSeconds, endSeconds }, input.words),
      safetyCard: projectFeverSafetyCard(entry),
    };
  });
  const direction: VisualDirection = { version: DIRECTOR_VERSION, regimenId: input.content.regimenId, regimenTitle: regimenDisplayTitle(input.content), method, totalSeconds: input.totalSeconds, shots };
  const issues = validateDirection(direction, input.content, input);
  if (issues.length) throw new Error(issues.join("\n"));
  return direction;
}

export function validateDirection(direction: VisualDirection, content: RegimenContent, evidence?: DirectionTimingEvidence): string[] {
  const issues: string[] = [];
  const shape = StoredDirectionSchema.safeParse(direction);
  if (!shape.success) return [`Invalid stored direction: ${shape.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`];
  if (direction.regimenId !== content.regimenId || direction.regimenTitle !== regimenDisplayTitle(content)) issues.push("Unbound regimen identity/title.");
  const byId = new Map(content.entries.map((e) => [e.id, e]));
  if (!hasExactEntryCoverage(direction.shots.map((s) => s.entryId), content.entries)) issues.push("Visual source coverage is incomplete or duplicated.");
  for (const [i, shot] of direction.shots.entries()) {
    const entry = byId.get(shot.entryId);
    if (!entry || entry.sectionId !== shot.sectionId) { issues.push(`Unknown source: ${shot.entryId}`); continue; }
    if (!displayMessages(entry).includes(shot.message)) issues.push(`Unbound display message: ${shot.id}`);
    if (shot.id !== `shot-${i + 1}`) issues.push(`Invalid shot identity: ${shot.id}`);
    if (shot.headline !== sourceHeadline(entry, content)) issues.push(`Unbound headline: ${shot.id}`);
    if (shot.scene !== SECTION_SCENES[entry.sectionId]) issues.push(`Unsupported scene: ${shot.id}`);
    if (!supportsComposition(entry, shot)) issues.push(`Unsupported scene composition: ${shot.id}`);
    if (JSON.stringify(shot.labels) !== JSON.stringify(entry.sectionId === "overview" ? entry.drugNames ?? [] : [])) issues.push(`Unbound labels: ${shot.id}`);
    for (const [labelIndex, cue] of (shot.labelCues ?? []).entries()) {
      if (!shot.labels.includes(cue.text) || cue.startSeconds < shot.startSeconds || cue.endSeconds > shot.endSeconds || cue.endSeconds <= cue.startSeconds ||
        (labelIndex > 0 && cue.startSeconds < shot.labelCues![labelIndex - 1]!.endSeconds)) issues.push(`Invalid source label cue: ${shot.id}`);
    }
    if (direction.method === "ai" && shot.labels.length && !evidence) issues.push(`Source label timing evidence is required: ${shot.id}`);
    if (evidence) {
      const timing = evidence.entries.find((item) => item.entryId === shot.entryId);
      if (!timing || JSON.stringify(shot.labelCues ?? []) !== JSON.stringify(sourceLabelCues(entry, timing, evidence.words))) issues.push(`Unbound source label timing: ${shot.id}`);
    }
    if (JSON.stringify(shot.sourceRefs) !== JSON.stringify(sourceRefs(entry))) issues.push(`Unbound source references: ${shot.id}`);
    if (JSON.stringify(shot.safetyCard) !== JSON.stringify(projectFeverSafetyCard(entry))) issues.push(`Unbound safety card: ${shot.id}`);
    const expectedArtwork = planLibraryArtwork(entry, shot, evidence?.words ?? []);
    for (const beat of shot.artworkBeats ?? []) {
      const action = beat.artworkId === "approved-drinking" ? "drink" : beat.artworkId === "approved-calling" ? "call" :
        beat.artworkId === "patient-washing" ? "wash-hands" : undefined;
      if (action && !eligibleAssets(entry).some((candidate) => candidate.actions.includes(action))) {
        issues.push(`Unsupported library action: ${shot.id}/${action}`);
      }
    }
    if (evidence || shot.artworkBeats?.length === 1) {
      if (JSON.stringify(shot.artworkBeats) !== JSON.stringify(expectedArtwork)) issues.push(`Unbound library artwork/timing: ${shot.id}`);
    } else issues.push(`Library cutaway timing evidence is required: ${shot.id}`);
    if (!Number.isFinite(shot.startSeconds) || !Number.isFinite(shot.endSeconds) || shot.endSeconds <= shot.startSeconds) issues.push(`Invalid timing: ${shot.id}`);
    if (i && Math.abs(shot.startSeconds - direction.shots[i - 1]!.endSeconds) > 0.01) issues.push(`Visual gap/overlap: ${shot.id}`);
    if (shot.cueSeconds < shot.startSeconds - 0.05 || shot.cueSeconds >= shot.endSeconds) issues.push(`Cue outside shot: ${shot.id}`);
    const choice = eligibleAssets(entry).find(({ asset }) => asset.id === shot.assetId);
    if (!choice?.actions.includes(shot.action)) issues.push(`Unsupported action: ${shot.id}`);
    if (choice && (shot.focus.x !== choice.asset.focus.x || shot.focus.y !== choice.asset.focus.y)) issues.push(`Unsupported camera target: ${shot.id}`);
  }
  if (direction.shots[0]?.startSeconds !== 0 || Math.abs((direction.shots.at(-1)?.endSeconds ?? 0) - direction.totalSeconds) > 0.01) issues.push("Visual track does not cover the audio.");
  if(direction.transitionPlan) issues.push(...validateTransitionPlan(direction.transitionPlan,transitionScenesForDirection(direction)));
  return issues;
}

/** Explicit authored mode is for reproducible previews; production defaults to the AI director. */
export function authoredDecisions(input: DirectorInput): Decision[] {
  const byId = new Map(input.content.entries.map((e) => [e.id, e]));
  return input.chunks.map((chunk, i) => {
    const entry = byId.get(chunk.entryId)!;
    const choices = eligibleAssets(entry);
    const priorities: MotionAction[] = entry.sectionId === "timeline" ? ["calendar"] :
      entry.sectionId === "emergency" ? ["temperature", "call", "observe"] :
      entry.sectionId === "overview" ? ["infusion", "welcome"] :
      ["wash-hands", "drink", "walk", "stretch", "support", "rest", "observe"];
    const action = priorities.find((a) => choices.some((c) => c.actions.includes(a))) ?? "observe";
    const choice = choices.find((c) => c.actions.includes(action))!;
    const capabilities = compositionCapabilities(entry);
    const preferredCamera = i % 3 === 0 ? "detail" : "push-in";
    const preferredStaging = i % 2 ? "right" : "left";
    return { entryId: entry.id, assetId: choice.asset.id, action,
      camera: capabilities.cameras.includes(preferredCamera) ? preferredCamera : capabilities.cameras[0]!,
      staging: capabilities.stagings.includes(preferredStaging) ? preferredStaging : capabilities.stagings[0]!,
      transition: capabilities.transitions[0]!, messageIndex: displayMessages(entry).length > 1 ? 1 : 0,
      cue: "", rationale: "Authored preview using source-compatible actions." };
  });
}

export function directionCacheKey(input: DirectorInput): string {
  return createHash("sha256").update(JSON.stringify({ version: DIRECTOR_VERSION, model: DIRECTOR_MODEL, implementation: directorImplementationFingerprint(), input, assets: MOTION_ASSETS })).digest("hex");
}

/** CLI cache identity includes actual implementation bytes, not just a manually bumped version. */
export function directorImplementationFingerprint(): string {
  const hash = createHash("sha256");
  for (const relative of ["./director.ts", "./safety-display.ts", "./direction-types.ts", "./library-direction.ts", "./transition-plan.ts", "./transition-director.ts"]) {
    hash.update(relative).update(readFileSync(new URL(relative, import.meta.url)));
  }
  return hash.digest("hex");
}

/** Prompt choices use exact narrated words and the same strict timing matcher
 * as compilation. A repeated phrase is never offered as an action anchor. */
export function directorCueOptions(timing: DirectorEntryTiming, words: DirectorWordTiming[]): string[] {
  const within = words.filter((word) => word.startSeconds >= timing.startSeconds && word.startSeconds < timing.endSeconds);
  const candidates: string[] = [];
  for (let start = 0; start < within.length; start++) {
    const phrase: string[] = [];
    for (const word of within.slice(start, start + 4)) {
      phrase.push(word.text);
      if (/[.!?]["'’”)]*$/.test(word.text)) break;
    }
    const cue = phrase.join(" ");
    if (!phrase.some((word) => normalizeWord(word))) continue;
    try { findCue(cue, timing, words); }
    catch { continue; }
    if (!candidates.includes(cue)) candidates.push(cue);
  }
  // Cover the full entry without making the model choose among hundreds of
  // overlapping phrases. The empty opening cue remains valid for every entry.
  const selected = candidates.length <= 24 ? candidates : Array.from({ length: 24 }, (_, index) => candidates[Math.round(index * (candidates.length - 1) / 23)]!);
  return ["", ...selected];
}

interface DirectionRepairRequest {
  entryIds: string[];
  accepted: Decision[];
  feedback: Record<string, string>;
}

/** Keep independently validated AI decisions while repairing only unresolved
 * entries. Authored choices are validation scaffolding, never accepted output. */
export async function directVideoWithRepairs(input: DirectorInput, request: (repair: DirectionRepairRequest) => Promise<unknown>): Promise<VisualDirection> {
  const baseline = authoredDecisions(input);
  // Reject invalid source/timing input before making a paid planning request.
  compileDirection(input, baseline, "ai");
  const expected = input.chunks.map((chunk) => chunk.entryId);
  const accepted = new Map<string, Decision>();
  let feedback: Record<string, string> = {};
  const maxRepairs = 3;
  for (let round = 0; round <= maxRepairs; round++) {
    const pending = expected.filter((entryId) => !accepted.has(entryId));
    const raw = await request({ entryIds: pending, accepted: expected.flatMap((entryId) => accepted.has(entryId) ? [accepted.get(entryId)!] : []), feedback });
    let batch: unknown = raw;
    try { if (typeof raw === "string") batch = JSON.parse(raw.replace(/^```(?:json)?\s*|```$/g, "").trim()); }
    catch { batch = undefined; }
    feedback = Object.fromEntries(pending.map((entryId) => [entryId, "Missing decision. Return this entry with its supplied capabilities and exact cueOptions."]));
    if (Array.isArray(batch)) {
      const ids = batch.map((item) => item && typeof item === "object" && "entryId" in item ? item.entryId : undefined);
      for (const item of batch) {
        const parsed = DecisionSchema.safeParse(item);
        const entryId = item && typeof item === "object" && "entryId" in item && typeof item.entryId === "string" ? item.entryId : undefined;
        // A repair cannot replace an already accepted decision or invent an entry.
        if (!entryId || !pending.includes(entryId)) continue;
        if (ids.filter((id) => id === entryId).length !== 1) { feedback[entryId] = "Duplicate decision. Return this entry exactly once."; continue; }
        if (!parsed.success) { feedback[entryId] = parsed.error.message; continue; }
        const decision = parsed.data;
        try {
          compileDirection(input, baseline.map((choice) => choice.entryId === entryId ? decision : accepted.get(choice.entryId) ?? choice), "ai");
          accepted.set(entryId, decision);
          delete feedback[entryId];
        } catch (error) {
          feedback[entryId] = error instanceof Error ? error.message : String(error);
        }
      }
    } else {
      feedback = Object.fromEntries(pending.map((entryId) => [entryId, "Response must be a JSON array of decisions for the requested entries."]));
    }
    if (accepted.size === expected.length) return compileDirection(input, expected.map((entryId) => accepted.get(entryId)!), "ai");
    console.warn(`Creative direction: retained ${accepted.size}/${expected.length} validated AI decisions after ${round === 0 ? "initial plan" : `repair ${round}/${maxRepairs}`}; unresolved: ${JSON.stringify(feedback)}`);
  }
  throw new Error(`Creative direction failed validation after its initial plan and ${maxRepairs} repairs. Unresolved entries: ${JSON.stringify(feedback)}`);
}

export async function directVideo(input: DirectorInput): Promise<VisualDirection> {
  const client = await getGenAIClient();
  if (!client) throw new Error("Creative direction requires the configured model. Use explicit authored-preview mode only for local layout tests.");
  const entries = new Map(input.content.entries.map((e) => [e.id, e]));
  const catalog = input.chunks.map((chunk) => {
    const entry = entries.get(chunk.entryId)!;
    const timing = input.entries.find((value) => value.entryId === entry.id)!;
    return { entryId: entry.id, section: entry.sectionId, name: entry.name, narration: chunk.text,
      seconds: timing, cueOptions: directorCueOptions(timing, input.words), messages: displayMessages(entry),
      composition: compositionCapabilities(entry),
      choices: eligibleAssets(entry).map(({ asset, actions }) => ({ assetId: asset.id, label: asset.label, actions })),
    };
  });
  const prompt = [
    "You are directing a beautifully illustrated patient-education film for a person watching on a phone.",
    "Plan the visual narrative across the ENTIRE film. Consistent warm character style; vary scene staging, purposeful actions, meaningful closeups and quiet holds.",
    "Use movement to clarify the spoken idea. Inspected, source-bound library artwork and measured cutaways are assigned by the renderer; repeated motions use complete cycles with calm pauses. Vary camera/staging across neighboring entries.",
    "Choose only the supplied assets/actions and message indices. A compatible choice is a capability, NOT a recommendation: select an action only when relevant to the actual narrated passage.",
    "Prefer observing/listening over depicting an unrelated medical action. Consider the two neighboring scenes when staging and choosing transitions.",
    "camera: establish (wide, calm), push-in (gradual focus), detail (action then close-up), drift (gentle lateral reframing).",
    "staging: left/right (character side, text opposite). Select camera and staging only from each entry's supplied composition capabilities; fixed-layout scenes support fewer controls.",
    "transition: zoom-through (push into background color and resolve next scene), match-cut (clean continuity), settle (quiet transition). Select only the entry's supplied composition transitions; complete fever safety cards cannot zoom.",
    "cue must be copied EXACTLY from that entry's supplied cueOptions: these are unique 1–4 word narration phrases checked against actual timing, plus an empty string for the opening. Never shorten or combine options. Use the empty string when no listed phrase suits the action; repeated phrases such as 'If you have' are not safe substitutes.",
    "messageIndex selects from supplied messages. Use 0 for no secondary text when the headline already carries the idea or extra text competes with captions.",
    "Return ONLY a JSON array with one decision per REQUESTED entry in the SAME order, no omissions or duplicates. Accepted decisions are immutable context: do not return or replace them.",
    'Each item: {"entryId":"...","assetId":"...","action":"...","camera":"detail","staging":"left","transition":"zoom-through","messageIndex":0,"cue":"...","rationale":"brief design reason, reviewer only"}.',
    `Patient preference: ${JSON.stringify(input.filter)}.`,
  ].join("\n");
  const direction = await directVideoWithRepairs(input, async ({ entryIds, accepted, feedback }) => {
    const requestCatalog = catalog.filter((entry) => entryIds.includes(entry.entryId));
    const response = await client.models.generateContent({ model: DIRECTOR_MODEL,
      contents: [{ role: "user", parts: [{ text: [prompt,
        `REQUESTED entries and their allowed composition, asset/action combinations and exact cueOptions:\n${JSON.stringify(requestCatalog)}`,
        `Accepted neighboring decisions (context only):\n${JSON.stringify(accepted)}`,
        `Corrections required for requested entries:\n${JSON.stringify(feedback)}`,
      ].join("\n") }] }],
      config: { responseMimeType: "application/json", temperature: 0.55 },
    });
    return response.text ?? "";
  });
  return {...direction,transitionPlan:await directTransitions(transitionScenesForDirection(direction))};
}
