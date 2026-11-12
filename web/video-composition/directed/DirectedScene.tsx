import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { DirectedShot, SceneKind } from "../../lib/video/direction-types";
import { PatientIllustration, INK, CORAL, TEAL, CREAM } from "./PatientIllustration";
import { FeverSafetyScene } from "./FeverSafetyScene";
import { FRAME_BG } from "./DirectedTheme";
import { approvedArtworkForShot } from "../../lib/video/approved-artwork-motion";
import { ApprovedArtworkStage } from "./ApprovedArtworkStage";
import { LibraryArtworkStage } from "./LibraryArtworkStage";

const EASE = Easing.bezier(.22, 1, .36, 1);
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function directedDriftX(shot: DirectedShot, seconds: number, reducedMotion: boolean): number {
  if (reducedMotion || shot.camera !== "drift") return 0;
  const start = Math.max(.35, shot.cueSeconds - shot.startSeconds) + 1.1;
  return interpolate(seconds, [start, start + 4], [0, shot.staging === "left" ? 22 : -22], { ...CLAMP, easing: EASE });
}

export function activeDirectedLabel(shot: DirectedShot, seconds: number): string | undefined {
  const absoluteNow = shot.startSeconds + seconds;
  return shot.labelCues?.find((cue) => cue.startSeconds <= absoluteNow && absoluteNow < cue.endSeconds)?.text;
}
export const SCENE_COLORS: Record<SceneKind, string> = {
  treatment: FRAME_BG, timeline: FRAME_BG, "daily-life": FRAME_BG, symptom: FRAME_BG,
  emergency: FRAME_BG, family: FRAME_BG, household: FRAME_BG, quote: FRAME_BG, outlook: FRAME_BG,
};
const SECTION_LABELS: Record<string, string> = {
  overview: "YOUR TREATMENT", timeline: "WHAT TO EXPECT", daily_life: "DAY TO DAY", side_effects: "HOW YOU MAY FEEL",
  emergency: "WHEN TO GET HELP", fertility_intimacy: "YOU & THE PEOPLE CLOSE TO YOU", practical_life: "AT HOME",
  patient_voices: "PATIENT PERSPECTIVES", big_picture: "LOOKING AHEAD",
};

/** Word-preserving pages: every source word remains available. Never use
 * line-clamp/ellipsis to silently remove a clinical condition or action. */
export function messagePages(message: string, budget = 155): string[] {
  const words = message.trim().split(/\s+/).filter(Boolean);
  const pages: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > budget) { pages.push(current); current = ""; }
    current += `${current ? " " : ""}${word}`;
  }
  if (current) pages.push(current);
  return pages;
}

const SceneAtmosphere: React.FC<{ kind: SceneKind; left?: boolean }> = ({ left = false }) => <div aria-hidden="true" style={{ position: "absolute", width: "62%", height: "78%", [left ? "left" : "right"]: "-6%", top: "8%", borderRadius: "58% 42% 53% 47% / 44% 55% 45% 56%", background: `radial-gradient(circle at ${left ? "40%" : "60%"} 40%, ${TEAL}22, ${FRAME_BG} 72%)` }} />;

const Eyebrow: React.FC<{ section: string }> = ({ section }) => <div data-qa-text="section-label" data-layout-id="section-label" style={{ position: "absolute", left: 78, top: 55, display: "flex", alignItems: "center", gap: 15, color: INK, fontSize: 21, fontWeight: 700, letterSpacing: 2.1 }}>
  <span style={{ display: "inline-block", width: 25, height: 4, borderRadius: 4, background: TEAL }} />
  {SECTION_LABELS[section] ?? section.replaceAll("_", " ").toUpperCase()}
</div>;

const SourceMessage: React.FC<{ shot: DirectedShot; seconds: number; centered?: boolean; width?: number }> = ({ shot, seconds, centered = false, width = 485 }) => {
  const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const duplicate = normalized(shot.message) === normalized(shot.headline);
  const pages = duplicate ? [] : messagePages(shot.message, centered ? 160 : shot.headline.length > 50 ? 100 : shot.headline.length > 22 ? 115 : 140);
  const duration = shot.endSeconds - shot.startSeconds;
  const pageTime = Math.max(.1, duration - .7) / Math.max(1, pages.length);
  const pageIndex = Math.min(pages.length - 1, Math.max(0, Math.floor((seconds - .35) / pageTime)));
  // Long drug names must fit with their parentheses at phone size, rather than
  // forcing a lone closing parenthesis onto another line.
  const longestWord = Math.max(...shot.headline.split(/\s+/).map((word) => word.length));
  const titleSize = shot.headline.length > 65 ? 38 : longestWord >= 18 ? 42 : 52;
  return <div style={{ width, textAlign: centered ? "center" : "left" }}>
    <div data-qa-text="headline" data-layout-id="shot-headline" style={{ color: INK, fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, overflowWrap: "break-word" }}>{shot.headline}</div>
    {pages.length > 0 && <div data-qa-text="message" data-layout-id="source-message" style={{ marginTop: 8, color: TEAL, fontSize: 34, lineHeight: 1.2, fontWeight: 700, overflowWrap: "break-word" }}>{pages[pageIndex]}</div>}
  </div>;
};

const IllustrationStage: React.FC<{ shot: DirectedShot; seconds: number; reducedMotion: boolean; large?: boolean; companion?: boolean }> = ({ shot, seconds, reducedMotion, large = false, companion = false }) => {
  if (shot.artworkBeats?.length) return <LibraryArtworkStage shot={shot} seconds={seconds} reducedMotion={reducedMotion} />;
  if (approvedArtworkForShot(shot)) return <ApprovedArtworkStage shot={shot} seconds={seconds} reducedMotion={reducedMotion} />;
  const cue = Math.max(.35, shot.cueSeconds - shot.startSeconds);
  const cameraStart = cue + 1.1;
  const targetScale = shot.camera === "detail" ? 1.65 : shot.camera === "push-in" ? 1.17 : shot.camera === "drift" ? 1.09 : 1;
  const scale = reducedMotion ? 1 : interpolate(seconds, [cameraStart, cameraStart + 2], [1, targetScale], { ...CLAMP, easing: EASE });
  const drift = directedDriftX(shot, seconds, reducedMotion);
  const onLeft = shot.staging === "left";
  return <div style={{ position: "absolute", left: onLeft ? 24 : large ? 545 : 600, top: large ? 66 : 91, width: large ? 694 : 625, height: large ? 555 : 525, overflow: "hidden", borderRadius: "46% 46% 20% 20%" }} data-layout-id="illustration-stage">
    <div style={{ width: "100%", height: "100%", transform: `translateX(${drift}px) scale(${scale})`, transformOrigin: `${shot.focus.x * 100}% ${shot.focus.y * 100}%` }}>
      <PatientIllustration action={shot.action} seconds={seconds} cue={cue} reducedMotion={reducedMotion} companion={companion} />
    </div>
  </div>;
};

const CalendarArtwork: React.FC<{ seconds: number; reducedMotion: boolean; labels: string[] }> = ({ seconds, reducedMotion, labels }) => {
  const progress = reducedMotion ? 1 : interpolate(seconds, [.4, 2], [0, 1], { ...CLAMP, easing: EASE });
  return <svg viewBox="0 0 540 420" width="100%" height="100%" aria-label="Treatment calendar">
    <ellipse cx="272" cy="367" rx="200" ry="20" fill="#BFCEC1" opacity=".35" />
    <g transform="rotate(-5 270 200)"><rect x="98" y="69" width="325" height="289" rx="23" fill="#CCDBCC" /></g>
    <rect x="85" y="54" width="338" height="294" rx="22" fill="#FFFDF6" stroke="#CDDACF" strokeWidth="2" />
    <path d="M107 54H401Q423 54 423 76V123H85V76Q85 54 107 54" fill={TEAL} />
    <path d="M144 37V72M367 37V72" stroke="#ABC3B6" strokeWidth="11" strokeLinecap="round" />
    {Array.from({ length: 20 }, (_, i) => <rect key={i} x={118 + i % 5 * 58} y={150 + Math.floor(i / 5) * 43} width="32" height="25" rx="7" fill={i % 6 === 0 ? "#D9E9DE" : "#EDEFE4"} />)}
    <path d="M134 164C194 124 213 268 280 250S329 186 365 206" pathLength="1" stroke={CORAL} strokeWidth="5" strokeLinecap="round" fill="none" strokeDasharray="1" strokeDashoffset={1 - progress} />
    <circle cx="134" cy="164" r="11" fill={CORAL} /><circle cx="365" cy="206" r="11" fill={CORAL} opacity={progress} />
    <path d="M127 164l5 5 10 -11" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <path d="M445 98L457 83M458 121l20 -2M438 80l2 -19" stroke="#C9AA75" strokeWidth="4" strokeLinecap="round" />
    {/* The source label is rendered as HTML below the calendar, never as an invented date grid. */}
    <title>{labels.join(". ")}</title>
  </svg>;
};

export const TimelineScene: React.FC<{ shot: DirectedShot; seconds: number; reducedMotion: boolean }> = ({ shot, seconds, reducedMotion }) => <>
  <SceneAtmosphere kind="timeline" /><Eyebrow section={shot.sectionId} />
  <div style={{ position: "absolute", left: 80, top: 157 }}><SourceMessage shot={shot} seconds={seconds} width={495} /></div>
  {shot.artworkBeats?.length ? <LibraryArtworkStage shot={shot} seconds={seconds} reducedMotion={reducedMotion} /> : <div style={{ position: "absolute", left: 615, top: 125, width: 560, height: 435 }}><CalendarArtwork seconds={seconds} reducedMotion={reducedMotion} labels={shot.labels} /></div>}
</>;

export const EmergencyScene: React.FC<{ shot: DirectedShot; seconds: number; reducedMotion: boolean }> = ({ shot, seconds, reducedMotion }) => {
  const cue = Math.max(.4, shot.cueSeconds - shot.startSeconds);
  const cameraScale = reducedMotion ? 1 : interpolate(seconds, [cue + 1.1, cue + 3.1], [1, shot.camera === "detail" ? 1.7 : shot.camera === "push-in" ? 1.22 : 1], { ...CLAMP, easing: EASE });
  const drift = directedDriftX(shot, seconds, reducedMotion);
  return <>
  <SceneAtmosphere kind="emergency" left />
  <Eyebrow section={shot.sectionId} />
  <div style={{ position: "absolute", left: 565, top: 151 }}><SourceMessage shot={shot} seconds={seconds} width={630} /></div>
  {shot.artworkBeats?.length ? <LibraryArtworkStage shot={shot} seconds={seconds} reducedMotion={reducedMotion} emergency /> : approvedArtworkForShot(shot) ? <ApprovedArtworkStage shot={shot} seconds={seconds} reducedMotion={reducedMotion} emergency /> : <div style={{ position: "absolute", left: 16, top: 134, width: 510, height: 475, overflow: "hidden", borderRadius: "44% 44% 15% 15%" }}>
    <div style={{ width: "100%", height: "100%", transform: `translateX(${drift}px) scale(${cameraScale})`, transformOrigin: `${shot.focus.x * 100}% ${shot.focus.y * 100}%` }}><PatientIllustration action={shot.action} seconds={seconds} cue={cue} reducedMotion={reducedMotion} /></div>
  </div>}
</>;
};

export const QuoteScene: React.FC<{ shot: DirectedShot; seconds: number; reducedMotion: boolean }> = ({ shot, seconds, reducedMotion }) => <>
  <SceneAtmosphere kind="quote" /><Eyebrow section={shot.sectionId} />
  <div style={{ position: "absolute", left: 75, top: 105, color: "#B6C9B8", fontFamily: "Georgia, serif", fontSize: 220, lineHeight: 1 }}>“</div>
  <div style={{ position: "absolute", left: 85, top: 178 }}><SourceMessage shot={shot} seconds={seconds} width={510} /></div>
  <IllustrationStage shot={{ ...shot, staging: "right" }} seconds={seconds} reducedMotion={reducedMotion} companion />
</>;

export const CharacterScene: React.FC<{ shot: DirectedShot; seconds: number; reducedMotion: boolean }> = ({ shot, seconds, reducedMotion }) => <>
  <SceneAtmosphere kind={shot.scene} left={shot.staging === "left"} /><Eyebrow section={shot.sectionId} />
  <div style={{ position: "absolute", left: shot.staging === "left" ? 688 : 80, top: shot.scene === "outlook" ? 170 : 156 }}><SourceMessage shot={shot} seconds={seconds} width={shot.staging === "left" ? 504 : 495} /></div>
  <IllustrationStage shot={shot} seconds={seconds} reducedMotion={reducedMotion} large={shot.scene === "treatment" || shot.scene === "family"} companion={shot.scene === "family" || shot.action === "support"} />
</>;

/** Each shot occupies its original audio-clock interval. Boundary animation
 * stays inside that interval: no TransitionSeries overlap can shorten speech. */
export const DirectedScene: React.FC<{ shot: DirectedShot; nextColor: string; index: number; reducedMotion: boolean; transitionDisabled?:boolean }> = ({ shot, nextColor, index, reducedMotion, transitionDisabled=false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const duration = shot.endSeconds - shot.startSeconds;
  const approvedArtwork = approvedArtworkForShot(shot) || Boolean(shot.artworkBeats?.length);
  const transitionTime = Math.min(.6, duration / 5);
  const exit = transitionDisabled || reducedMotion || shot.safetyCard || shot.transition !== "zoom-through" ? 0 : interpolate(seconds, [duration - transitionTime, duration], [0, 1], { ...CLAMP, easing: Easing.bezier(.6, 0, .9, .5) });
  const enter = transitionDisabled || reducedMotion || shot.safetyCard || index === 0 || shot.transition !== "zoom-through" ? 0 : interpolate(seconds, [0, transitionTime], [1, 0], { ...CLAMP, easing: EASE });
  const settle = reducedMotion ? 0 : interpolate(seconds, [0, .65], [15, 0], { ...CLAMP, easing: EASE });
  const scale = approvedArtwork ? 1 + exit * .04 + enter * .03 : 1 + exit * 4 + enter * 1.1;
  const entryCover = reducedMotion ? 0 : interpolate(seconds, [0, .12, .34], [1, 1, 0], CLAMP);
  const exitCover = approvedArtwork ? exit : interpolate(exit, [.55, .96], [0, 1], CLAMP);
  const color = SCENE_COLORS[shot.scene];
  const label = activeDirectedLabel(shot, seconds);
  return <AbsoluteFill data-qa-region="scene" style={{ backgroundColor: color, overflow: "hidden" }}>
    <AbsoluteFill style={{ transform: `translateY(${!transitionDisabled && shot.transition === "settle" ? settle : 0}px) scale(${scale})`, transformOrigin: shot.staging === "left" ? "28% 26%" : "77% 26%" }}>
      {shot.safetyCard ? <FeverSafetyScene shot={shot} seconds={seconds} reducedMotion={reducedMotion} /> : shot.scene === "timeline" ? <TimelineScene shot={shot} seconds={seconds} reducedMotion={reducedMotion} /> : shot.scene === "emergency" ? <EmergencyScene shot={shot} seconds={seconds} reducedMotion={reducedMotion} /> : shot.scene === "quote" ? <QuoteScene shot={shot} seconds={seconds} reducedMotion={reducedMotion} /> : <CharacterScene shot={shot} seconds={seconds} reducedMotion={reducedMotion} />}
      {!shot.safetyCard && label && !shot.message.includes(label) && !shot.headline.includes(label) && <div data-qa-text="source-label" style={{ position: "absolute", left: shot.scene === "emergency" || shot.staging === "left" ? 67 : 674, top: 108, maxWidth: shot.scene === "emergency" ? 420 : 510, boxSizing: "border-box", backgroundColor: "#FFFCF4F2", border: "1px solid #D7DED0", padding: "11px 18px", borderRadius: 15, color: INK, fontSize: label.length > 50 ? 27 : 31, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>}
    </AbsoluteFill>
    {enter > 0 && <AbsoluteFill style={{ backgroundColor: color, opacity: entryCover }} />}
    {exit > 0 && <AbsoluteFill style={{ backgroundColor: nextColor, opacity: exitCover }} />}
    {approvedArtwork && <div data-qa-text="artwork-credit" style={{ position: "absolute", bottom: 3, ...(shot.scene === "emergency" || shot.staging === "left" ? { right: 64 } : { left: 64 }), color: INK, fontSize: 14, lineHeight: "18px" }}>Artwork adapted from Storyset / Freepik</div>}
  </AbsoluteFill>;
};
