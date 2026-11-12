import React, {useLayoutEffect} from "react";
import {AbsoluteFill,Composition,cancelRender,continueRender,delayRender,registerRoot,useCurrentFrame,useVideoConfig} from "remotion";
import {DirectedFonts,loadDirectedFont} from "./directed/DirectedFonts";
import {MedicationStampArtwork} from "./directed/MedicationStampArtwork";
import type {MedicationStampCue} from "../lib/video/medication-stamp-motion";

export interface MedicationStampStudyProps extends Record<string,unknown> {
  cue:MedicationStampCue;
  captions:{text:string;startSeconds:number;endSeconds:number}[];
  durationInFrames:number;
  reducedMotion?:boolean;
  qaMode?:boolean;
}
const Study:React.FC<MedicationStampStudyProps>=({cue,captions,reducedMotion=false,qaMode=false})=>{
  const seconds=useCurrentFrame()/useVideoConfig().fps;
  const caption=captions.find(c=>seconds>=c.startSeconds&&seconds<c.endSeconds);
  useLayoutEffect(()=>{
    if(!qaMode)return;
    const handle=delayRender("Medication stamp rendered audit");let done=false,fontsReady=false;
    const inspect=()=>{
      const svg=document.querySelector<SVGSVGElement>("svg[data-library-artwork='care-medication-plan']");
      const root=svg?.querySelector<SVGGraphicsElement>("[data-medication-stamp-root]");
      if(done||!fontsReady||!root||Math.abs(Number(root.getAttribute("data-stamp-seconds"))-seconds)>.0006)return;
      done=true;
      const box=(el:Element)=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
      const layer=(el:SVGGraphicsElement)=>{const m=el.getCTM();return{attrs:Object.fromEntries([...el.attributes].filter(a=>a.name.startsWith("data-")||["transform","opacity","fill","visibility"].includes(a.name)).map(a=>[a.name,a.value])),bounds:box(el),...(el instanceof SVGPathElement?{pathLength:el.getTotalLength()}:{}),matrix:m?[m.a,m.b,m.c,m.d,m.e,m.f]:null,parent:el.parentElement?.getAttribute("data-stamp-layer")??el.parentElement?.tagName,ancestors:[...function*(node:Element|null){while(node&&node!==svg){yield {tag:node.tagName,clip:node.getAttribute("clip-path"),overflow:node.getAttribute("overflow"),receiver:node.getAttribute("data-stamp-shadow-receiver")};node=node.parentElement;}}(el.parentElement)]};};
      const source=[...svg!.querySelectorAll<SVGGraphicsElement>("[data-object-layer='plain-toast'],[data-object-layer='small-bowl'],[data-object-layer='blank-medication-checklist']")].map(el=>({...layer(el),geometry:el.innerHTML}));
      const layers=[...root.querySelectorAll<SVGGraphicsElement>("[data-stamp-anatomy],[data-stamp-thumb-crease],[data-stamp-hardware],[data-stamp-body],[data-stamp-pad],[data-stamp-grip],[data-stamp-hand],[data-stamp-forearm],[data-stamp-shadow],[data-stamp-imprint],[data-stamp-message],[data-stamp-layer]")].map(layer);
      console.log("MEDICATION_STAMP_QA:"+JSON.stringify({seconds,reducedMotion,root:layer(root),source,layers,boardSurface:box(svg!.querySelector("[data-object-layer='blank-medication-checklist'] > rect")!),contact:root.querySelector("metadata")?.getAttribute("data-stamp-contact"),messageBounds:[...root.querySelectorAll("text")].map(el=>({text:el.textContent,bounds:box(el)})),caption:caption?.text??"",captionBounds:document.querySelector("[data-study-caption]")?box(document.querySelector("[data-study-caption]")!):null,svgBounds:box(svg!)}));
      continueRender(handle);
    };
    const observer=new MutationObserver(inspect);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
    loadDirectedFont().then(()=>{fontsReady=true;inspect();}).catch(cancelRender);inspect();
    return()=>{done=true;observer.disconnect();continueRender(handle);};
  },[seconds,reducedMotion,qaMode,caption]);
  return <AbsoluteFill style={{backgroundColor:"#F4F7F6",fontFamily:"Figtree, sans-serif"}}>
    <DirectedFonts/>
    <div style={{position:"absolute",inset:"24px 0 125px",overflow:"hidden"}}>
      <MedicationStampArtwork seconds={seconds} cue={cue} reducedMotion={reducedMotion} style={{overflow:"hidden"}}/>
    </div>
    {caption&&<div data-study-caption style={{position:"absolute",bottom:49,left:55,right:55,textAlign:"center",fontSize:32,lineHeight:1.25,fontWeight:600,color:"#1C2B45"}}>{caption.text}</div>}
    <div style={{position:"absolute",bottom:12,width:"100%",textAlign:"center",fontSize:13,color:"#455A64"}}>Medication routine · Original vector illustration</div>
  </AbsoluteFill>;
};
const Root=()=> <Composition id="MedicationStampStudy" component={Study} width={1280} height={900} fps={30} durationInFrames={522}
  defaultProps={{cue:{lines:["WITH FOOD","NOT AT NIGHT"],sourceRef:"timeline.days-2-5:plain",contactSeconds:7.38,endSeconds:17.4},captions:[],durationInFrames:522}}
  calculateMetadata={({props})=>({durationInFrames:props.durationInFrames})}/>;
registerRoot(Root);
