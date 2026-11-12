import React,{useLayoutEffect} from 'react';
import {AbsoluteFill,Composition,registerRoot,useCurrentFrame,useVideoConfig,delayRender,continueRender,cancelRender} from 'remotion';
import {BloodCellArtwork} from './directed/BloodCellArtwork';
import {CurvedVesselArtwork} from './directed/CurvedVesselArtwork';
import {ContinuousArmVesselOpening} from './directed/ContinuousArmVesselOpening';
import {ArmMicroscopeOpening,type ArmZoomArtwork} from './directed/ArmMicroscopeOpening';
import type {BloodCellCue} from '../lib/video/blood-cell-motion';
import {armMicroscopeState} from '../lib/video/arm-microscope-motion';
import {DirectedFonts,loadDirectedFont} from './directed/DirectedFonts';

export interface ArmBloodCellStudyProps extends Record<string,unknown>{
  cue:BloodCellCue;artwork:ArmZoomArtwork|null;captions:{text:string;startSeconds:number;endSeconds:number}[];
  durationInFrames:number;reducedMotion?:boolean;qaMode?:boolean;vesselStyle?:'legacy'|'curved';continuousZoom?:boolean;
}
const Study:React.FC<ArmBloodCellStudyProps>=({cue,artwork,captions,reducedMotion=false,qaMode=false,vesselStyle='legacy',continuousZoom=false})=>{
 const seconds=useCurrentFrame()/useVideoConfig().fps;
 const caption=captions.find(c=>seconds>=c.startSeconds&&seconds<c.endSeconds);
 const entrySeconds=cue.entrySeconds??3.2;
 const opening=artwork?armMicroscopeState(seconds,artwork.anchor,entrySeconds,reducedMotion):null;
 useLayoutEffect(()=>{
  if(!qaMode)return;
  const handle=delayRender('Arm zoom scene and font audit');let done=false,ready=false;
  const inspect=()=>{
   const curved=vesselStyle==='curved';
   const root=document.querySelector(curved?'[data-curved-vessel-root]':'[data-blood-cell-root]');
   if(done||!ready||!root)return;
   const rendered=root.getAttribute(curved?'data-curved-vessel-rendered':'data-blood-rendered');if(!rendered)return;
   const actual=JSON.parse(rendered);if(Math.abs(actual.seconds-seconds)>.0001)return;
   const box=(el:Element)=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
   const svg=document.querySelector('[data-arm-opening]') as SVGSVGElement|null;
   const source=document.querySelector('[data-source-character]') as SVGGraphicsElement|null;
   const continuousRoot=document.querySelector('[data-continuous-arm-root]');
   const portal=document.querySelector('[data-vessel-portal]');
   const read=(element:Element|null,attribute:string)=>JSON.parse(element?.getAttribute(attribute)??'null');
   const continuous=continuousRoot?{state:read(continuousRoot,'data-continuous-arm-state'),portalState:read(portal,'data-vessel-portal-state'),actual:read(portal,'data-vessel-portal-actual')}:null;
   if(continuousZoom&&(!continuous?.actual||continuous.state.seconds!==seconds))return;
   const matrix=source?.getScreenCTM();
   done=true;
   console.log('ARM_BLOOD_QA:'+JSON.stringify({seconds,reducedMotion,continuousZoom,continuous,actual,state:JSON.parse(root.getAttribute(curved?'data-curved-vessel-state':'data-blood-state')??'{}'),rootBounds:box(root),
    opening:svg?{state:JSON.parse(svg.getAttribute('data-arm-state')??'{}'),viewBox:svg.getAttribute('viewBox'),opacity:getComputedStyle(svg).opacity,sourceMatrix:matrix?[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]:null,sourcePathCount:source?.querySelectorAll('path').length}:null,
    canvas:[...root.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,bounds:box(c)})),
    text:[...document.querySelectorAll('[data-study-text]')].map(e=>({text:e.textContent,bounds:box(e)})),caption:caption?.text??''}));
   continueRender(handle);
  };
  const observer=new MutationObserver(inspect);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
  loadDirectedFont().then(()=>{ready=true;inspect();}).catch(cancelRender);
  return()=>{done=true;observer.disconnect();continueRender(handle);};
 },[seconds,qaMode,reducedMotion,caption,vesselStyle,continuousZoom]);
 return <AbsoluteFill style={{background:'#F4F7F6',fontFamily:'Figtree, sans-serif',color:'#1C2B45'}}>
  <DirectedFonts/>
  <div data-study-text style={{position:'absolute',top:38,left:64,fontSize:34,fontWeight:700}}>{cue.windowLabel}</div>
  <div data-study-text style={{position:'absolute',top:48,right:64,fontSize:20,letterSpacing:2,color:'#657974',fontWeight:600}}>ILLUSTRATED TIME-LAPSE</div>
  <div style={{position:'absolute',top:100,left:0,width:1280,height:650,overflow:'hidden',borderRadius:32,clipPath:'inset(0 round 32px)',background:'#F4F7F6'}}>
   {continuousZoom&&vesselStyle==='curved'&&artwork
    ?<ContinuousArmVesselOpening artwork={artwork} seconds={seconds} width={1280} height={650} cue={cue} reducedMotion={reducedMotion} qaMode={qaMode}/>
    :<><div style={{position:'absolute',inset:0,opacity:1}}>
    {vesselStyle==='curved'
     ?<CurvedVesselArtwork seconds={seconds} cue={cue} reducedMotion={reducedMotion} qaMode={qaMode} width={1280} height={650}/>
     :<BloodCellArtwork seconds={seconds} cue={cue} variant='vertical' reducedMotion={reducedMotion} qaMode={qaMode} width={1280} height={650}/>}
   </div>
   {artwork&&<ArmMicroscopeOpening artwork={artwork} seconds={seconds} width={1280} height={650} entrySeconds={entrySeconds} reducedMotion={reducedMotion}/>}
   </>}
  </div>
  {/* Opaque corner cover avoids transparent WebGL clipping pixels in the encoded frame. */}
  <svg aria-hidden width={1280} height={650} style={{position:'absolute',left:0,top:100,pointerEvents:'none'}}>
   <path fill='#F4F7F6' fillRule='evenodd' d='M0 0H1280V650H0Z M32 0H1248A32 32 0 0 1 1280 32V618A32 32 0 0 1 1248 650H32A32 32 0 0 1 0 618V32A32 32 0 0 1 32 0Z'/>
  </svg>
  {seconds>=cue.lowSeconds&&<div data-study-text style={{position:'absolute',top:765,left:64,right:64,textAlign:'center',fontSize:27,fontWeight:700,color:'#168D78'}}>White blood cells are typically lowest</div>}
  {caption&&<div data-study-text style={{position:'absolute',bottom:45,left:60,right:60,textAlign:'center',fontSize:32,lineHeight:1.25,fontWeight:600}}>{caption.text}</div>}
 </AbsoluteFill>;
};
const Root=()=> <Composition id='ArmBloodCellStudy' component={Study} width={1280} height={900} fps={30} durationInFrames={402}
 defaultProps={{cue:{sourceRef:'timeline.roughly-days-7-10:plain',windowLabel:'Around days 7–10',entrySeconds:3.2,focusSeconds:4.66,lowSeconds:7.36,precautionSeconds:8.6,endSeconds:13.4},artwork:null,captions:[],durationInFrames:402}}
 calculateMetadata={({props})=>({durationInFrames:props.durationInFrames})}/>;
registerRoot(Root);
