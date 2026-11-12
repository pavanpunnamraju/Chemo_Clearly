import React from 'react';
import {armMicroscopeState,type ArmZoomAnchor} from '../../lib/video/arm-microscope-motion';

export type ArmZoomArtwork={
  characterMarkup:string;
  forearmSilhouette:string;
  vesselPath:string;
  branchPath:string;
  anchor:ArmZoomAnchor;
};

export const ArmMicroscopeOpening:React.FC<{
  artwork:ArmZoomArtwork;seconds:number;width:number;height:number;entrySeconds:number;reducedMotion?:boolean;
}> = ({artwork,seconds,width,height,entrySeconds,reducedMotion=false})=>{
  const state=armMicroscopeState(seconds,artwork.anchor,entrySeconds,reducedMotion);
  const viewWidth=state.height*width/height;
  const viewBox=`${state.center[0]-viewWidth/2} ${state.center[1]-state.height/2} ${viewWidth} ${state.height}`;
  return <svg data-arm-opening data-arm-state={JSON.stringify(state)} width={width} height={height} viewBox={viewBox}
    style={{position:'absolute',inset:0,opacity:state.openingOpacity,overflow:'hidden',background:'#F4F7F6'}}>
    <defs>
      <clipPath id='arm-skin-window'><path d={artwork.forearmSilhouette}/></clipPath>
      <radialGradient id='arm-soft-reveal'>
        <stop offset='0' stopColor='white'/><stop offset='.5' stopColor='white'/><stop offset='1' stopColor='black'/>
      </radialGradient>
      <mask id='arm-translucence' maskUnits='userSpaceOnUse' x={artwork.anchor.forearmCenter[0]-20} y={artwork.anchor.forearmCenter[1]-17} width='40' height='34'>
        <ellipse cx={artwork.anchor.forearmCenter[0]} cy={artwork.anchor.forearmCenter[1]} rx='20' ry='17' fill='url(#arm-soft-reveal)'/>
      </mask>
      <linearGradient id='arm-vessel-light' x1='0' y1='0' x2='1' y2='0'>
        <stop stopColor='#D66C5E'/><stop offset='.45' stopColor='#F2CCB9'/><stop offset='1' stopColor='#B85A53'/>
      </linearGradient>
    </defs>
    <g transform={`rotate(${state.rotation} ${state.center[0]} ${state.center[1]})`}>
    <g data-source-character dangerouslySetInnerHTML={{__html:artwork.characterMarkup}}/>
    <g clipPath='url(#arm-skin-window)' mask='url(#arm-translucence)' opacity={state.vesselReveal} data-translucent-vessel>
      <path d={artwork.forearmSilhouette} fill='#F7D8C7' opacity='.38'/>
      <path d={artwork.branchPath} fill='none' stroke='#57798A' strokeWidth='1.2' strokeLinecap='round' opacity='.48'/>
      <path d={artwork.vesselPath} fill='none' stroke='#567486' strokeWidth='4.2' strokeLinecap='round' opacity='.35'/>
      <path d={artwork.vesselPath} fill='none' stroke='url(#arm-vessel-light)' strokeWidth='3.2' strokeLinecap='round' opacity='.9'/>
      <path d={artwork.vesselPath} fill='none' stroke='#F7D8C7' strokeWidth='1.5' strokeLinecap='round' opacity='.55'/>
    </g>
    </g>
  </svg>;
};
