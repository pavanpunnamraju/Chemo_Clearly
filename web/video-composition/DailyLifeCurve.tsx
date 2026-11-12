import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AXIS_BOTTOM_Y_PERCENT,
  AXIS_ORIGIN_X_PERCENT,
  AXIS_RIGHT_X_PERCENT,
  AXIS_TOP_Y_PERCENT,
  dailyLifeCurveGeometry,
} from "../lib/video/daily-life-curve";

// Duplicated from lib/content/parse.ts's slugify rather than imported —
// that module also imports node:fs (readFileSync) at module scope, which
// this file can't pull in: Studio bundles video-composition/ for the
// browser (calculateMetadata/Composition components run client-side, no
// node:fs), and webpack has no "node:" scheme loader configured for it
// (verified against a real `npm run studio` build attempt, which failed on
// exactly this import chain). Same one-line implementation, kept in sync by
// inspection since it's this small.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// daily_life energy-curve archetype (docs/references/daily_life_motion_spec.md)
// — replaces the Scene (character + blob + illustration) archetype for this
// section. Studio-preview build only this round: not yet mounted by
// SlideVideo.tsx's section dispatch. Palette constants mirror
// SlideVideo.tsx's (video_visual_system.md color principle) — duplicated
// here since this file is deliberately standalone pre-integration; dedupe
// when this wires into SlideVideo.tsx.
const NAVY = "#1c2b45";
const TEAL = "#2fbfa0";
const FRAME_BG = "#f4f7f6";

// Same fixed two-line headline SlideVideo.tsx's SCENE_FIXED_HEADLINES.daily_life
// uses today — spec: "still holds," no change needed.
const HEADLINE: [string, string] = ["Most days,", "you keep living them"];

// How long the line takes to draw in from the left edge — spec: "timed to
// finish before narration reaches the first sub-topic." Exported so the
// isolated preview composition (Root.tsx) can schedule its topic reveals
// after this without duplicating the number.
export const DAILY_LIFE_CURVE_DRAW_SECONDS = 1.3;

const SPOTLIGHT_SIZE = 140; // px — spec's 130-160px range, comfortably above the 120px SVG-legibility floor
const SETTLED_DOT_SIZE = 16; // spec's 14-18px settled-dot range
const MARKER_SETTLE_FRAMES = 10;
const MARKER_POP_SPRING_CONFIG = { damping: 14, stiffness: 180, mass: 0.6 }; // reuses CountdownCard's pop-in feel (SlideVideo.tsx)
const LABEL_GAP_PX = 12;
const LABEL_STAGGER_EXTRA_PX = 24;

// §5 path B (daily_life_motion_spec.md): no closer — the section just holds
// on the settled curve after the last topic settles, then ends.
const HOLD_AFTER_LAST_SETTLE_SECONDS = 0.8;

// §5 path B: the last topic has no next topic to bound its live phase, so it
// gets a literal hold instead of the implicit "until next reveal" rule.
const LAST_TOPIC_LIVE_HOLD_SECONDS = 3;

// Problem 1 from the design spec: a sub-topic's marker gets an illustration
// inset only if daily_life/'s own folder has an asset whose subject matches
// (subject-to-sub-topic lookup, keyed by slugify(topic.label) — data-driven,
// not an `if topic === "Exercise"` branch, so a future regimen's
// differently-named daily_life sub-topics fall through to "no match" ->
// plain dot automatically). Exercise, Helpful routines, and Driving all have
// a match; Intimacy still doesn't (spec: don't borrow other sections'
// assets) and falls back to the plain dot.
// scale/xPercent/yPercent are the "zoomed/offset viewBox" crop, done here via
// a circular overflow:hidden container + a scaled/offset <Img> instead of a
// literal SVG clipPath/viewBox rewrite — same visual result, native CSS
// covers it.
const DAILY_LIFE_ILLUSTRATION_CROPS: Record<string, { src: string; scale: number; xPercent: number; yPercent: number }> = {
  exercise: {
    src: "illustrations/daily_life/daily_life__stretching-exercises-bro.svg",
    scale: 2.4,
    xPercent: 0,
    yPercent: -6,
  },
  "helpful-routines": {
    src: "illustrations/daily_life/daily_life__training-at-home-pana.svg",
    scale: 2.6,
    xPercent: -8,
    yPercent: -4,
  },
  driving: {
    src: "illustrations/daily_life/daily_life__car-driving-bro.svg",
    scale: 2.3,
    xPercent: 0,
    yPercent: -8,
  },
};

export interface DailyLifeCurveTopic {
  label: string;
  /** Real (STT-anchored) timestamp of this topic's narration beginning. */
  revealSeconds: number;
}

export interface DailyLifeCurveSectionProps {
  sectionStartSeconds: number;
  /** One per sub-topic, in curve order — array position drives both curve-point
   * order and marker order (design spec), so this holds for any N. */
  topics: DailyLifeCurveTopic[];
  [key: string]: unknown;
}

export const DailyLifeCurveSection: React.FC<DailyLifeCurveSectionProps> = ({ sectionStartSeconds, topics }) => {
  const { fps, width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  const geometry = useMemo(() => dailyLifeCurveGeometry(topics.length, width, height), [topics.length, width, height]);

  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  useLayoutEffect(() => {
    setPathLength(pathRef.current?.getTotalLength() ?? 0);
  }, [geometry.d]);

  const drawProgress = interpolate(frame, [0, DAILY_LIFE_CURVE_DRAW_SECONDS * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const bottom = (height * AXIS_BOTTOM_Y_PERCENT) / 100;
  const originX = (width * AXIS_ORIGIN_X_PERCENT) / 100;
  const axisRightX = (width * AXIS_RIGHT_X_PERCENT) / 100;
  const axisTopY = (height * AXIS_TOP_Y_PERCENT) / 100;
  const lastTopicPoint = geometry.topicPoints[geometry.topicPoints.length - 1]!;
  const areaD = `${geometry.d} L ${lastTopicPoint.x} ${bottom} L ${geometry.points[0]!.x} ${bottom} Z`;

  const revealFrame = (seconds: number) => Math.round((seconds - sectionStartSeconds) * fps);

  // Settled-label horizontal collision rule (spec §3): measure actual
  // rendered widths after first paint; stagger odd-indexed labels into a
  // second height tier if neighbors overlap.
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [staggered, setStaggered] = useState<boolean[]>(() => topics.map(() => false));
  useLayoutEffect(() => {
    const rects = labelRefs.current.map((el) => el?.getBoundingClientRect() ?? null);
    const next = topics.map(() => false);
    for (let i = 0; i < rects.length - 1; i++) {
      const a = rects[i];
      const b = rects[i + 1];
      if (!a || !b) continue;
      const overlaps = a.left < b.right && b.left < a.right;
      if (overlaps && i + 1 < next.length && (i + 1) % 2 === 1) next[i + 1] = true;
    }
    setStaggered(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics.length, geometry.d]);

  return (
    <AbsoluteFill style={{ backgroundColor: FRAME_BG, overflow: "hidden" }} from={-30}>
      <div style={{ position: "absolute", left: "6%", top: "8%", width: "40%" }}>
        <div style={{ fontWeight: 800, fontSize: 52, lineHeight: 1.1, color: NAVY }}>{HEADLINE[0]}</div>
        <div style={{ fontWeight: 700, fontSize: 34, lineHeight: 1.2, color: TEAL, marginTop: 8 }}>{HEADLINE[1]}</div>
      </div>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="daily-life-curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Axes: static reference geometry, present from frame 0 (spec §4) */}
        <line x1={originX} y1={axisTopY} x2={originX} y2={bottom} stroke="rgba(28,43,69,0.3)" strokeWidth={2} />
        <line x1={originX} y1={bottom} x2={axisRightX} y2={bottom} stroke="rgba(28,43,69,0.3)" strokeWidth={2} />
        <path d={areaD} fill="url(#daily-life-curve-fill)" stroke="none" opacity={drawProgress} />
        <path
          ref={pathRef}
          d={geometry.d}
          fill="none"
          stroke={NAVY}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={pathLength || 1}
          strokeDashoffset={pathLength ? pathLength * (1 - drawProgress) : 0}
          style={{ opacity: pathLength > 0 ? 1 : 0 }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: originX - 10,
          top: (axisTopY + bottom) / 2,
          transform: "translate(-50%, -50%) rotate(-90deg)",
          fontSize: 14,
          fontWeight: 600,
          color: "rgba(28,43,69,0.6)",
          whiteSpace: "nowrap",
        }}
      >
        Energy
      </div>
      {topics.map((topic, i) => {
        const point = geometry.topicPoints[i]!;
        // §5 path B: no next topic to bound the last topic's live phase, so
        // it holds for a literal LAST_TOPIC_LIVE_HOLD_SECONDS instead
        // (daily_life_motion_spec.md).
        const nextRevealSeconds =
          i + 1 < topics.length ? topics[i + 1]!.revealSeconds : topic.revealSeconds + LAST_TOPIC_LIVE_HOLD_SECONDS;
        return (
          <DailyLifeTopicMarker
            key={topic.label}
            x={point.x}
            y={point.y}
            label={topic.label}
            crop={DAILY_LIFE_ILLUSTRATION_CROPS[slugify(topic.label)]}
            revealFrame={revealFrame(topic.revealSeconds)}
            settleFrame={revealFrame(nextRevealSeconds)}
            labelRef={(el) => {
              labelRefs.current[i] = el;
            }}
            labelExtraOffset={staggered[i] ? LABEL_STAGGER_EXTRA_PX : 0}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** One sub-topic marker: rises from the curve into its "live" state (illustration
 * spotlight or a plain dot, per the coverage lookup above) while its sentence is
 * spoken, then contracts to a permanent settled dot+label — spec's reveal beat. */
const DailyLifeTopicMarker: React.FC<{
  x: number;
  y: number;
  label: string;
  crop?: { src: string; scale: number; xPercent: number; yPercent: number };
  revealFrame: number;
  settleFrame: number;
  labelRef: (el: HTMLDivElement | null) => void;
  labelExtraOffset: number;
}> = ({ x, y, label, crop, revealFrame, settleFrame, labelRef, labelExtraOffset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The last topic (no closer to key its settle off, §5 path B) settles
  // immediately: settleFrame === revealFrame. Skip the live/illustration
  // hover phase entirely in that case (its window has zero length) and go
  // straight to the permanent settled dot+label.
  const hasLivePhase = settleFrame > revealFrame;

  const framesSinceReveal = Math.max(0, frame - revealFrame);
  const liveScale = spring({ frame: framesSinceReveal, fps, config: MARKER_POP_SPRING_CONFIG });
  const liveLift = interpolate(framesSinceReveal, [0, 12], [10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const liveOpacity = hasLivePhase
    ? interpolate(
        frame,
        [revealFrame, revealFrame + 6, settleFrame, settleFrame + MARKER_SETTLE_FRAMES],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;
  const settledStartFrame = hasLivePhase ? settleFrame : revealFrame;
  const settledOpacity = interpolate(frame, [settledStartFrame, settledStartFrame + MARKER_SETTLE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      {liveOpacity > 0 ? (
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            transform: `translate(-50%, calc(-100% - ${liveLift}px)) scale(${liveScale})`,
            opacity: liveOpacity,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: LABEL_GAP_PX,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: NAVY,
              backgroundColor: FRAME_BG,
              padding: "4px 10px",
              borderRadius: 6,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
          {crop ? (
            <div
              style={{
                width: SPOTLIGHT_SIZE,
                height: SPOTLIGHT_SIZE,
                borderRadius: "50%",
                overflow: "hidden",
                position: "relative",
                backgroundColor: "#ffffff",
                boxShadow: `0 0 0 4px ${FRAME_BG}, 0 4px 16px rgba(0,0,0,0.15)`,
              }}
            >
              <Img
                src={staticFile(crop.src)}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: `translate(-50%, -50%) scale(${crop.scale}) translate(${crop.xPercent}%, ${crop.yPercent}%)`,
                }}
              />
            </div>
          ) : (
            <div style={{ width: SETTLED_DOT_SIZE * 1.8, height: SETTLED_DOT_SIZE * 1.8, borderRadius: "50%", backgroundColor: TEAL }} />
          )}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: "translate(-50%, -50%)",
          opacity: settledOpacity,
          width: SETTLED_DOT_SIZE,
          height: SETTLED_DOT_SIZE,
          borderRadius: "50%",
          backgroundColor: TEAL,
          border: `2px solid ${FRAME_BG}`,
        }}
      />
      <div
        ref={labelRef}
        style={{
          position: "absolute",
          left: x,
          top: y - SETTLED_DOT_SIZE / 2 - LABEL_GAP_PX - labelExtraOffset,
          transform: "translate(-50%, -100%)",
          opacity: settledOpacity,
          fontSize: 14,
          fontWeight: 700,
          color: NAVY,
          backgroundColor: FRAME_BG,
          padding: "2px 8px",
          borderRadius: 4,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </>
  );
};

/** Total on-screen duration for this section in path B (spec §5): the last
 * topic's live-phase hold, plus the settle animation, plus the final hold.
 * Exported so callers (Root.tsx, eventual SlideVideo.tsx wiring) can size
 * the composition without duplicating the formula. */
export function dailyLifeSectionEndSeconds(lastTopicRevealSeconds: number, fps: number): number {
  const lastTopicLiveEndSeconds = lastTopicRevealSeconds + LAST_TOPIC_LIVE_HOLD_SECONDS;
  return lastTopicLiveEndSeconds + MARKER_SETTLE_FRAMES / fps + HOLD_AFTER_LAST_SETTLE_SECONDS;
}
