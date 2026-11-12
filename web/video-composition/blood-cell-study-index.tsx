import React,{useLayoutEffect} from 'react';
import {AbsoluteFill,Composition,registerRoot,useCurrentFrame,useVideoConfig,delayRender,continueRender,cancelRender} from 'remotion';
import {BloodCellArtwork} from './directed/BloodCellArtwork';
import type {BloodCellCue} from '../lib/video/blood-cell-motion';
import {DirectedFonts,loadDirectedFont} from './directed/DirectedFonts';
export interface BloodCellStudyProps extends Record<string,unknown>{cue:BloodCellCue;captions:{text:string;startSeconds:number;endSeconds:number}[];durationInFrames:number;reducedMotion?:boolean;qaMode?:boolean;}
const Study:React.FC<BloodCellStudyProps>=({cue,captions,reducedMotion=false,qaMode=false})=>{
 const seconds=useCurrentFrame()/useVideoConfig().fps;
 const caption=captions.find(c=>seconds>=c.startSeconds&&seconds<c.endSeconds);
 useLayoutEffect(()=>{
  if(!qaMode)return;
  const handle=delayRender('Blood-cell scene and font audit');let done=false,ready=false;
  const inspect=()=>{
   const root=document.querySelector('[data-blood-cell-root]');
   if(done||!ready||!root)return;
   const rendered=root.getAttribute('data-blood-rendered');if(!rendered)return;
   const actual=JSON.parse(rendered);if(Math.abs(actual.seconds-seconds)>.0001)return;
   const box=(el:Element)=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
   done=true;
   console.log('BLOOD_STUDY_QA:'+JSON.stringify({seconds,reducedMotion,actual,state:JSON.parse(root.getAttribute('data-blood-state')??'{}'),rootBounds:box(root),canvas:[...root.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,bounds:box(c)})),text:[...document.querySelectorAll('[data-study-text]')].map(e=>({text:e.textContent,bounds:box(e)})),caption:caption?.text??''}));
   continueRender(handle);
  };
  const observer=new MutationObserver(inspect);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
  loadDirectedFont().then(()=>{ready=true;inspect();}).catch(cancelRender);
  return()=>{done=true;observer.disconnect();continueRender(handle);};
 },[seconds,qaMode,reducedMotion,caption]);
 return <AbsoluteFill style={{background:'#F4F7F6',fontFamily:'Figtree, sans-serif',color:'#1C2B45'}}>
  <DirectedFonts/>
  <div data-study-text style={{position:'absolute',top:38,left:64,fontSize:34,fontWeight:700}}>{cue.windowLabel}</div>
  <div data-study-text style={{position:'absolute',top:48,right:64,fontSize:20,letterSpacing:2,color:'#657974',fontWeight:600}}>ILLUSTRATED TIME-LAPSE</div>
  <div style={{position:'absolute',top:100,left:0,width:1280,height:650,overflow:'hidden'}}>
   <BloodCellArtwork seconds={seconds} cue={cue} reducedMotion={reducedMotion} qaMode={qaMode} width={1280} height={650}/>
  </div>
  {seconds>=cue.lowSeconds&&<div data-study-text style={{position:'absolute',top:765,left:64,right:64,textAlign:'center',fontSize:27,fontWeight:700,color:'#168D78'}}>White blood cells are typically lowest</div>}
  {caption&&<div data-study-text style={{position:'absolute',bottom:45,left:60,right:60,textAlign:'center',fontSize:32,lineHeight:1.25,fontWeight:600}}>{caption.text}</div>}
 </AbsoluteFill>;
};
const Root=()=> <Composition id='BloodCellStudy' component={Study} width={1280} height={900} fps={30} durationInFrames={402}
 defaultProps={{cue:{sourceRef:'timeline.roughly-days-7-10:plain',windowLabel:'Around days 7–10',focusSeconds:4.66,lowSeconds:7.36,precautionSeconds:8.6,endSeconds:13.4},captions:[],durationInFrames:402}}
 calculateMetadata={({props})=>({durationInFrames:props.durationInFrames})}/>;
registerRoot(Root);
