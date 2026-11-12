import { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Easing, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import {
  applyShoulderRig,
  axisPivot,
  lagFramesForT,
  pointsToClosedPathD,
  projectT,
  rotateAroundPivot,
  sampleClosedPath,
  smoothstep,
  type ArmAxis,
  type ShoulderRig,
} from "../lib/video/arm-deform";

// Gradient-deformation arm bend (docs/references/handoff.md round 3). Unlike
// the banned cut-and-hinge approach (ArmBendTest.tsx, deleted), the arm path
// is never split: every sampled outline point rotates about the elbow by an
// angle that grows smoothly from the shoulder, so the shape deforms instead
// of tearing. Every tuning value below is a live Studio slider — the human
// picks the final numbers, not the agent.

export const armBendSchema = z.object({
  maxBendDegrees: z.number().min(0).max(90).step(1),
  falloffStart: z.number().min(0).max(1).step(0.01),
  falloffEnd: z.number().min(0).max(1).step(0.01),
  elbowPosition: z.number().min(0).max(1).step(0.01),
  shoulderLagFrames: z.number().min(0).max(20).step(1),
  wristLagFrames: z.number().min(0).max(20).step(1),
  handDragFrames: z.number().min(0).max(20).step(1),
  overshootAmount: z.number().min(0).max(3).step(0.1),
  bodySettleAmount: z.number().min(0).max(10).step(0.5),
  cycleSeconds: z.number().min(0.2).max(6).step(0.1),
  shoulderSocketX: z.number().min(200).max(400).step(1),
  shoulderSocketY: z.number().min(200).max(350).step(1),
  shoulderRotateDegrees: z.number().min(-30).max(30).step(1),
  shoulderRetractX: z.number().min(-50).max(150).step(1),
  shoulderRetractY: z.number().min(-50).max(150).step(1),
  shoulderArcBow: z.number().min(0).max(60).step(1),
});
export type ArmBendProps = z.infer<typeof armBendSchema>;

export const armBendDefaultProps: ArmBendProps = {
  maxBendDegrees: 45,
  falloffStart: 0.25,
  falloffEnd: 0.55,
  elbowPosition: 0.37,
  shoulderLagFrames: 0,
  wristLagFrames: 6,
  handDragFrames: 4,
  overshootAmount: 1.2,
  bodySettleAmount: 3,
  cycleSeconds: 2.0,
  shoulderSocketX: 300,
  shoulderSocketY: 270,
  shoulderRotateDegrees: 10,
  shoulderRetractX: 0,
  shoulderRetractY: 0,
  shoulderArcBow: 0,
};

const SVG_SRC = staticFile("illustrations/daily_life/daily_life__training-at-home-pana.svg");
const CHARACTER_GROUP_ID = "freepik--Characters--inject-3";
const SAMPLE_COUNT = 400;

// Verified geometry (handoff.md): the arm path's own shoulder/fingertip
// anchor points, in the path's local coordinate space — same space
// getPointAtLength returns, so no extra mapping is needed.
const ARM_AXIS_SHOULDER = { x: 312, y: 276 };
const ARM_AXIS_FINGERTIP = { x: 78, y: 285 };

/** Bend-in/out progress for one point's own (lagged) timeline: 0..1 over
 * `cycleFrames`, back to 0 over the next `cycleFrames`, looping — with an
 * overshoot-and-settle bounce at each end instead of a hard stop. */
function cycleProgress(frame: number, cycleFrames: number, overshootAmount: number): number {
  const period = cycleFrames * 2;
  const phase = ((frame % period) + period) % period;
  const ease = Easing.out(Easing.back(overshootAmount));
  return phase <= cycleFrames ? ease(phase / cycleFrames) : 1 - ease((phase - cycleFrames) / cycleFrames);
}

export const ArmBend: React.FC<ArmBendProps> = (props) => {
  const {
    maxBendDegrees,
    falloffStart,
    falloffEnd,
    elbowPosition,
    shoulderLagFrames,
    wristLagFrames,
    handDragFrames,
    overshootAmount,
    bodySettleAmount,
    cycleSeconds,
    shoulderSocketX,
    shoulderSocketY,
    shoulderRotateDegrees,
    shoulderRetractX,
    shoulderRetractY,
    shoulderArcBow,
  } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [handle] = useState(() => delayRender("ArmBend: loading source SVG"));
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const restPointsRef = useRef<{ x: number; y: number }[] | null>(null);
  // Finger bbox origin (rest pose, unrotated) — the shoulder pivot moves
  // every frame now, so the fill-box transform-origin is recomputed from
  // this fixed offset each frame instead of once at mount.
  const fingerBBoxesRef = useRef<{ x: number; y: number }[]>([]);

  useLayoutEffect(() => {
    let cancelled = false;
    fetch(SVG_SRC)
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setSvgMarkup(text);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once mounted, locate the arm path (index 39) and the finger paths (41-43)
  // among the character group's <path d> elements, sample the arm's rest
  // outline once, and precompute each finger's fill-box transform origin at
  // the elbow pivot (transformOrigin under fill-box is bbox-relative, not
  // canvas-relative — same technique as the deleted ArmBendTest).
  useLayoutEffect(() => {
    if (!svgMarkup) return;
    const group = containerRef.current?.querySelector<SVGGElement>(`#${CHARACTER_GROUP_ID}`);
    if (!group) throw new Error("ArmBend: character group not found — source SVG structure changed");
    const paths = Array.from(group.querySelectorAll<SVGPathElement>("path")).filter((p) => p.hasAttribute("d"));
    const armPath = paths[39];
    const fingerPaths = [paths[41], paths[42], paths[43]].filter((p): p is SVGPathElement => !!p);
    if (!armPath) throw new Error("ArmBend: arm path (index 39) not found — source SVG structure changed");

    restPointsRef.current = sampleClosedPath(armPath, SAMPLE_COUNT);
    fingerBBoxesRef.current = fingerPaths.map((p) => {
      const bbox = p.getBBox();
      return { x: bbox.x, y: bbox.y };
    });
    continueRender(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgMarkup, handle]);

  useLayoutEffect(() => {
    if (!svgMarkup || !restPointsRef.current) return;
    const group = containerRef.current?.querySelector<SVGGElement>(`#${CHARACTER_GROUP_ID}`);
    if (!group) return;
    const paths = Array.from(group.querySelectorAll<SVGPathElement>("path")).filter((p) => p.hasAttribute("d"));
    const armPath = paths[39];
    const fingerPaths = [paths[41], paths[42], paths[43]].filter((p): p is SVGPathElement => !!p);
    if (!armPath) return;

    const axis: ArmAxis = { shoulder: ARM_AXIS_SHOULDER, fingertip: ARM_AXIS_FINGERTIP, elbowPosition };
    const restPivot = axisPivot(axis);
    const cycleFrames = cycleSeconds * fps;

    // Two-bone chain: shoulder (root) then elbow (child). The shoulder is
    // the root, so it uses its own (unweighted, leading) progress and moves
    // every point on the arm — including the elbow pivot itself — rigidly,
    // before the elbow's own gradient bend layers on top.
    const rig: ShoulderRig = {
      socket: { x: shoulderSocketX, y: shoulderSocketY },
      rotateDegrees: shoulderRotateDegrees,
      retractX: shoulderRetractX,
      retractY: shoulderRetractY,
      arcBow: shoulderArcBow,
    };
    const rootProgress = cycleProgress(frame - shoulderLagFrames, cycleFrames, overshootAmount);
    const pivot = applyShoulderRig(restPivot, rig, rootProgress);

    // Per-point angle = spatial falloff weight * that point's own (lagged)
    // progress, so the shoulder starts moving first and the wrist/hand
    // follow — successive joint breaking, not one rigid swing.
    const deformed = restPointsRef.current.map((p) => {
      const t = projectT(p, axis.shoulder, axis.fingertip);
      const lag = lagFramesForT(t, shoulderLagFrames, wristLagFrames);
      const progress = cycleProgress(frame - lag, cycleFrames, overshootAmount);
      const weight = smoothstep(falloffStart, falloffEnd, t);
      const afterShoulder = applyShoulderRig(p, rig, rootProgress);
      // Negative: this asset's arm extends to the left, and a positive angle
      // here sweeps it up toward the head (a curl) — the human explicitly
      // ruled that out. Negative sweeps down-and-back toward the ribs, the
      // bent-over-row direction that was confirmed.
      return rotateAroundPivot(afterShoulder, pivot, -(maxBendDegrees * weight * progress));
    });
    armPath.setAttribute("d", pointsToClosedPathD(deformed));

    // Fingers are small rigid pieces (t ~= 1): full spatial weight, extra
    // drag lag on top of the wrist's, rotated rigidly about the same
    // (shoulder-moved) pivot. Total rotation is shoulder + elbow, since both
    // bones are ancestors of the hand in the chain.
    const handLag = wristLagFrames + handDragFrames;
    const handProgress = cycleProgress(frame - handLag, cycleFrames, overshootAmount);
    const handAngle = -(shoulderRotateDegrees * rootProgress) - maxBendDegrees * handProgress;
    fingerPaths.forEach((el, i) => {
      const bbox = fingerBBoxesRef.current[i];
      if (!bbox) return;
      el.style.transformBox = "fill-box";
      el.style.transformOrigin = `${pivot.x - bbox.x}px ${pivot.y - bbox.y}px`;
      el.style.rotate = `${handAngle}deg`;
    });

    // Secondary body motion: the shoulder/torso settle a few units on the
    // same (unlagged) cycle — a perfectly frozen body reads as cheap
    // animation even when the limb itself is convincing.
    const bodyProgress = cycleProgress(frame, cycleFrames, overshootAmount);
    group.style.transformBox = "fill-box";
    group.style.transformOrigin = "center";
    group.style.transform = `translateY(${-bodySettleAmount * bodyProgress}px) rotate(${bodySettleAmount * 0.15 * bodyProgress}deg)`;
  }, [
    svgMarkup,
    frame,
    fps,
    maxBendDegrees,
    falloffStart,
    falloffEnd,
    elbowPosition,
    shoulderLagFrames,
    wristLagFrames,
    handDragFrames,
    overshootAmount,
    bodySettleAmount,
    cycleSeconds,
    shoulderSocketX,
    shoulderSocketY,
    shoulderRotateDegrees,
    shoulderRetractX,
    shoulderRetractY,
    shoulderArcBow,
  ]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#f4f7f6", justifyContent: "center", alignItems: "center" }}>
      <div
        ref={containerRef}
        style={{ width: 750, height: 500 }}
        // Raw fetched SVG markup, patched live via direct DOM writes above
        // (dangerouslySetInnerHTML content isn't React-ref-able per element).
        dangerouslySetInnerHTML={svgMarkup ? { __html: svgMarkup } : undefined}
      />
    </AbsoluteFill>
  );
};
