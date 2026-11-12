import React, { useLayoutEffect } from "react";
import { AbsoluteFill, Composition, cancelRender, continueRender, delayRender, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { ScheduleArtwork } from "./directed/ScheduleArtwork";
import { DirectedFonts, loadDirectedFont } from "./directed/DirectedFonts";
import type { ScheduleNumberCue } from "../lib/video/schedule-number-cues";

export interface ScheduleStudyProps extends Record<string, unknown> {
  cues: ScheduleNumberCue[];
  captions: { text: string; startSeconds: number; endSeconds: number }[];
  durationInFrames: number;
  reducedMotion?: boolean;
  qaMode?: boolean;
}
const ScheduleStudy: React.FC<ScheduleStudyProps> = ({ cues, captions, reducedMotion = false, qaMode = false }) => {
  const seconds = useCurrentFrame() / useVideoConfig().fps;
  const caption = captions.find(caption => seconds >= caption.startSeconds && seconds < caption.endSeconds);
  useLayoutEffect(() => {
    if (!qaMode) return;
    const handle = delayRender("Schedule rendered audit");
    let done = false;
    let fontsReady = false;
    const inspect = () => {
      const svg = document.querySelector<SVGSVGElement>("svg[data-prepared-schedule]");
      if (!fontsReady || !svg || Number(svg.getAttribute("data-schedule-seconds")) !== seconds || done) return;
      done = true;
      const bounds = (el: Element) => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
      const character = svg.querySelector<SVGGraphicsElement>("[data-schedule-character]")!;
      const matrix = character.getCTM()!;
      console.log("SCHEDULE_QA:" + JSON.stringify({ seconds, reducedMotion, character: {
        bounds: bounds(character), transform: character.getAttribute("transform"),
        matrix: [matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f], markup: character.innerHTML },
        unit: svg.getAttribute("data-schedule-unit"),
        numbers: [...svg.querySelectorAll<SVGTextElement>("[data-schedule-number]")].map(n=>{const m=n.getCTM()!;return {value:Number(n.dataset.scheduleNumber),opacity:Number(n.getAttribute("opacity")),highlight:Number(n.dataset.scheduleHighlight),scale:Number(n.dataset.scheduleScale),fill:n.getAttribute("fill"),matrix:[m.a,m.b,m.c,m.d,m.e,m.f],bounds:bounds(n)};}),
        weekdays:[...svg.querySelectorAll<SVGTextElement>("[data-schedule-weekday]")].map(n=>({text:n.textContent,fill:n.getAttribute("fill"),bounds:bounds(n)})),
        cells:[...svg.querySelectorAll<SVGRectElement>("[data-schedule-cell]")].map(n=>({value:Number(n.dataset.scheduleCell),bounds:bounds(n)})),
        gridBounds:svg.querySelector("[data-schedule-grid]") ? bounds(svg.querySelector("[data-schedule-grid]")!) : null,
        caption: caption?.text ?? "", captionBounds: document.querySelector("[data-study-caption]") ? bounds(document.querySelector("[data-study-caption]")!) : null,
        sourceBounds: bounds(svg), screenBounds: bounds(svg.querySelector("[id*='Schedule--inject-18'] > rect")!),
      }));
      continueRender(handle);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true});
    loadDirectedFont().then(()=>{fontsReady=true;inspect();}).catch(cancelRender);
    inspect();
    return () => {done=true;observer.disconnect(); continueRender(handle);};
  }, [seconds, reducedMotion, qaMode, caption]);
  return <AbsoluteFill style={{backgroundColor:"#F4F7F6",fontFamily:"Figtree, sans-serif"}}>
    <DirectedFonts />
    <div style={{position:"absolute",inset:"24px 60px 125px"}}>
      <ScheduleArtwork seconds={seconds} cues={cues} reducedMotion={reducedMotion}/>
    </div>
    {caption && <div data-study-caption style={{position:"absolute",bottom:49,left:70,right:70,textAlign:"center",fontSize:32,lineHeight:1.25,fontWeight:600,color:"#1C2B45"}}>{caption.text}</div>}
    <div style={{position:"absolute",bottom:12,width:"100%",textAlign:"center",fontSize:13,color:"#455A64"}}>Illustration adapted from Storyset / Freepik</div>
  </AbsoluteFill>;
};
const Root = () => <Composition id="ScheduleStudy" component={ScheduleStudy} width={1280} height={900} fps={30}
  durationInFrames={900} defaultProps={{cues:[],captions:[],durationInFrames:900}}
  calculateMetadata={({props})=>({durationInFrames:props.durationInFrames})}/>;
registerRoot(Root);
