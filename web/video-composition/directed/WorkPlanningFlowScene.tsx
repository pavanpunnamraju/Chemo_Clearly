import React from 'react';
import {AbsoluteFill, Freeze, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LibrarySvgArtwork, type LibrarySvgRig} from './LibrarySvgArtwork';
import {workPhase, workPropOffset} from '../../lib/video/work-planning-motion';

const NS='http://www.w3.org/2000/svg';
const SOURCE='studies/work-planning/working-typing-straight-sleeve.svg';
const SHA='f5855ae37922acffaccf882d14e0a251d51c5bfc26b1d016df3e63104544389f';
export const FLOW_PROPS=[
  {id:'right-window',start:1.05},{id:'left-window',start:1.24},
  {id:'wall-picture',start:1.41},{id:'storage',start:1.67},
  {id:'plant',start:1.5},{id:'card-0',start:1.17},
  {id:'card-1',start:1.33},{id:'card-2',start:1.49},
  {id:'desk',start:.85},
];
export function flowSceneState(seconds:number,exitStart:number,reduced=false){
 const t=reduced?0:seconds;
 // Remove source frames73–84 (0.5s) from the overhead hesitation. Both the
 // original video and foreground overlay use this same source-frame clock.
 const shotFrame=Math.floor(t*24+1e-6);
 const sourceFrame=Math.min(179,shotFrame+(shotFrame>=73?12:0));
 return {sourceFrame,camera:workPhase(t,2.3,7.5),exit:reduced?0:workPhase(t,exitStart,exitStart+1.1)};
}
function prepareRoom(svg:SVGSVGElement,foreground:boolean):LibrarySvgRig{
 const bg=svg.querySelector('#background-complete')!;
 const bgNodes=[...bg.children] as SVGElement[];
 const tasks=[...svg.querySelector('#Tasks')!.children] as SVGElement[];
 const make=(id:string,nodes:Element[])=>{const g=document.createElementNS(NS,'g');g.dataset.flowProp=id;nodes.forEach(n=>g.append(n));return g;};
 const desk=svg.querySelector('#work-desk-laptop')!;
 const groups=foreground?[make('desk',[desk,svg.querySelector('#Coffee')!])]:[
  make('right-window',bgNodes.slice(5,19)),make('left-window',bgNodes.slice(19,33)),
  make('wall-picture',bgNodes.slice(0,5)),make('storage',bgNodes.slice(33)),
  make('plant',[svg.querySelector('#Plant')!]),
  ...[0,1,2].map(i=>make(`card-${i}`,tasks.slice(i*5,(i+1)*5))),
 ];
 // Props retain source coordinates and paint, with exactly the Flow reference camera.
 svg.replaceChildren(...groups);
 svg.setAttribute('viewBox','-123.333333 65 746.666667 420');
 svg.style.overflow='visible';
 return {apply(seconds,reduced){groups.forEach(g=>{
  const cue=FLOW_PROPS.find(p=>p.id===g.dataset.flowProp)!;
  const t=reduced?0:seconds;
  g.setAttribute('transform',`translate(${workPropOffset(t,cue.start)} 0)`);
  g.setAttribute('visibility',t>=cue.start+1.6?'hidden':'visible');
 });}};
}
const back=(svg:SVGSVGElement)=>prepareRoom(svg,false);
const front=(svg:SVGSVGElement)=>prepareRoom(svg,true);
export const WorkPlanningFlowScene:React.FC<{exitStart:number;reducedMotion?:boolean}>=({exitStart,reducedMotion=false})=>{
 const frame=useCurrentFrame(),{fps}=useVideoConfig();const seconds=frame/fps;
 const state=flowSceneState(seconds,exitStart,reducedMotion);
 const image=state.sourceFrame.toString().padStart(3,'0');
 return <AbsoluteFill style={{overflow:'hidden'}} data-flow-source-frame={state.sourceFrame}>
   <div style={{position:'absolute',width:1280,height:720,left:76.8,top:40,transform:'scale(.88)',transformOrigin:'0 0'}}>
    <AbsoluteFill style={{transform:`translate(${-35*state.camera-1600*state.exit}px,${-54*state.camera}px) scale(${1+.12*state.camera})`,transformOrigin:'54% 40%'}}>
     {reducedMotion?<Img src={staticFile('studies/work-planning/flow-layers/rest.png')} style={{width:1280,height:720}}/>:
      <Freeze frame={state.sourceFrame * fps / 24}><OffthreadVideo muted src={staticFile('studies/work-planning/working-to-relax-flow-wide-candidate.mp4')} style={{width:1280,height:720}}/></Freeze>}
     <AbsoluteFill><LibrarySvgArtwork artworkId="flow-room-back" publicPath={SOURCE} expectedSha256={SHA} prepare={back} seconds={seconds} reducedMotion={reducedMotion}/></AbsoluteFill>
     <AbsoluteFill><Img src={staticFile(`studies/work-planning/flow-layers/${image}.png`)} style={{width:1280,height:720}}/></AbsoluteFill>
     <AbsoluteFill><LibrarySvgArtwork artworkId="flow-room-front" publicPath={SOURCE} expectedSha256={SHA} prepare={front} seconds={seconds} reducedMotion={reducedMotion}/></AbsoluteFill>
    </AbsoluteFill>
   </div>
 </AbsoluteFill>;
};
