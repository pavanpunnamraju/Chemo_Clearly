import React, {useLayoutEffect, useMemo, useRef} from "react";
import type {BloodCellCue} from "../../lib/video/blood-cell-motion";
import {continuousArmVesselState, createApprovedRimMaskPath} from "../../lib/video/continuous-arm-vessel-motion";
import type {ArmZoomArtwork} from "./ArmMicroscopeOpening";
import {CurvedVesselArtwork} from "./CurvedVesselArtwork";

export type ContinuousArmVesselOpeningProps = {
  artwork: ArmZoomArtwork;
  seconds: number;
  width: number;
  height: number;
  cue: BloodCellCue;
  reducedMotion?: boolean;
  qaMode?: boolean;
};

export const ContinuousArmVesselOpening: React.FC<ContinuousArmVesselOpeningProps> = ({
  artwork,
  seconds,
  width,
  height,
  cue,
  reducedMotion = false,
  qaMode = false,
}) => {
  const entrySeconds = cue.entrySeconds ?? 3.2;
  const state = useMemo(
    () => continuousArmVesselState(seconds, artwork.anchor, entrySeconds, width, height, reducedMotion),
    [artwork.anchor, entrySeconds, height, reducedMotion, seconds, width],
  );
  const portalRef = useRef<HTMLDivElement>(null);
  const viewWidth = state.camera.height * width / height;
  const viewBox = `${state.camera.center[0] - viewWidth / 2} ${state.camera.center[1] - state.camera.height / 2} ${viewWidth} ${state.camera.height}`;
  const rotation = `rotate(${state.camera.rotation} ${state.camera.center[0]} ${state.camera.center[1]})`;
  const portalClipId = "continuous-arm-portal-forearm";
  const portalMaskId = "continuous-arm-live-rim-mask";
  const portalBlurId = "continuous-arm-live-rim-softness";
  const ellipseGradientId = "continuous-arm-live-ellipse-softness";
  const rimMaskPath = useMemo(() => createApprovedRimMaskPath(width, height), [height, width]);

  useLayoutEffect(() => {
    const portal = portalRef.current;
    if (!portal) return;
    const bounds = portal.getBoundingClientRect();
    const computed = getComputedStyle(portal);
    const content = portal.firstElementChild;
    const contentBounds = content?.getBoundingClientRect();
    const contentComputed = content ? getComputedStyle(content) : null;
    portal.setAttribute("data-vessel-portal-actual", JSON.stringify({
      bounds: contentBounds ? {x: contentBounds.x, y: contentBounds.y, width: contentBounds.width, height: contentBounds.height} : null,
      maskBounds: {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height},
      transform: contentComputed?.transform ?? "none",
      maskImage: computed.maskImage || computed.webkitMaskImage,
      clipPath: computed.clipPath,
      opacity: computed.opacity,
    }));
  }, [state]);

  return <div
    data-continuous-arm-root="true"
    data-continuous-arm-state={JSON.stringify(state)}
    style={{position: "absolute", inset: 0, width, height, overflow: "hidden"}}
  >
    <svg aria-hidden width="0" height="0" style={{position: "absolute"}}>
      <defs>
        <clipPath id={portalClipId} clipPathUnits="userSpaceOnUse">
          <path d={artwork.forearmSilhouette} transform={state.portal.forearmClipTransform} />
        </clipPath>
        <filter id={portalBlurId} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <radialGradient id={ellipseGradientId}>
          <stop offset="0" stopColor="white" />
          <stop offset="0.82" stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={portalMaskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{maskType: "alpha"}}>
          <g transform={state.portal.transform === "none" ? undefined : state.portal.transform} filter={`url(#${portalBlurId})`}>
            <path d={rimMaskPath} fill="white" />
          </g>
          <ellipse cx={state.portal.center[0]} cy={state.portal.center[1]} rx={state.portal.maskRadius[0]} ry={state.portal.maskRadius[1]} fill={`url(#${ellipseGradientId})`} opacity={state.portal.ellipseOpacity} />
        </mask>
      </defs>
    </svg>
    <svg
      data-arm-opening
      data-arm-state={JSON.stringify(state)}
      width={width}
      height={height}
      viewBox={viewBox}
      style={{position: "absolute", inset: 0, overflow: "hidden", opacity: state.sourceOpacity}}
    >
      <rect x={state.camera.center[0] - viewWidth} y={state.camera.center[1] - state.camera.height} width={viewWidth * 2} height={state.camera.height * 2} fill="#F4F7F6" />
      <g transform={rotation} data-source-character dangerouslySetInnerHTML={{__html: artwork.characterMarkup}} />
    </svg>

    <div
      ref={portalRef}
      data-vessel-portal="true"
      data-vessel-portal-state={JSON.stringify(state.portal)}
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        opacity: state.portal.opacity,
        maskImage: state.portal.maskImage,
        WebkitMaskImage: state.portal.maskImage,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        clipPath: state.portal.forearmClipActive ? `url(#${portalClipId})` : "none",
      }}
    >
      <div style={{position: "absolute", inset: 0, width, height, transformOrigin: "0 0", transform: state.portal.transform}}>
        <CurvedVesselArtwork width={width} height={height} seconds={seconds} cue={cue} reducedMotion={reducedMotion} qaMode={qaMode} earlyCellVisibility />
      </div>
    </div>
  </div>;
};
