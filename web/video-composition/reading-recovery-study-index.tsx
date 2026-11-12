import React, {useLayoutEffect} from 'react';
import {AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig, delayRender, continueRender, cancelRender} from 'remotion';
import {ReadingRecoveryArtwork} from './directed/ReadingRecoveryArtwork';
import {DirectedFonts, loadDirectedFont} from './directed/DirectedFonts';

export interface ReadingRecoveryStudyProps extends Record<string, unknown> {
  durationInFrames: number;
  captions: {text: string; startSeconds: number; endSeconds: number}[];
  label: string;
  reducedMotion?: boolean;
  qaMode?: boolean;
  cue: {pageStartSeconds: number; pageEndSeconds: number; comfortStartSeconds: number; comfortEndSeconds: number; returnEndSeconds: number};
}

const STUDY_INSETS = {top:100,bottom:150};

const Study: React.FC<ReadingRecoveryStudyProps> = ({durationInFrames, captions, label, cue, reducedMotion = false, qaMode = false}) => {
  const {fps} = useVideoConfig();
  const seconds = useCurrentFrame() / fps;
  const titleOpacity = reducedMotion ? 1 : Math.max(0,Math.min(1,(seconds-.45)/.35));
  const caption = captions.find(c => seconds >= c.startSeconds && seconds < c.endSeconds);
  useLayoutEffect(() => {
    if (!qaMode) return;
    const handle = delayRender('Reading recovery frame geometry');
    let done = false;
    let fontsReady = false;
    const inspect = () => {
      if (done || !fontsReady) return;
      const root = document.querySelector('svg[data-reading-recovery-state]');
      if (!root) return;
      const state = JSON.parse(root.getAttribute('data-reading-recovery-state')!);
      if (Math.abs(state.seconds - seconds) > 1e-7) return;
      // Remotion may temporarily park a composition offscreen. Compare geometry
      // in one freshly measured study-local space instead of cached global Y.
      const study = document.querySelector('[data-reading-study-root]')!.getBoundingClientRect();
      const box = (e: Element) => {const b = e.getBoundingClientRect(); return {x:b.x-study.x,y:b.y-study.y,width:b.width,height:b.height};};
      const svg = root.matches('svg') ? root : root.querySelector('svg');
      if (!svg || !svg.querySelector('path')) return;
      const artworkBounds = box(root);
      const layers = [...root.querySelectorAll('[data-reading-layer]')].map(e => ({
        layer: e.getAttribute('data-reading-layer'), transform: e.getAttribute('transform'),
        opacity: getComputedStyle(e).opacity, bounds: box(e),
      }));
      console.log('READING_QA:' + JSON.stringify({seconds,reducedMotion,state,artworkBounds,layers,
        actual: root.getAttribute('data-reading-recovery-actual'),
        icons:[...root.querySelectorAll('[data-reading-icon]')].map(e=>({name:e.getAttribute('data-reading-icon'),transform:e.getAttribute('transform'),origin:JSON.parse(e.getAttribute('data-reading-icon-origin')!),fit:Number(e.getAttribute('data-reading-icon-fit')),opacity:getComputedStyle(e).opacity,display:getComputedStyle(e).display,bounds:box(e)})),
        viewBox:svg.getAttribute('viewBox'),
        text:[...document.querySelectorAll('[data-study-text]')].map(e => ({text:e.textContent,bounds:box(e)}))}));
      done = true;
      continueRender(handle);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
    loadDirectedFont().then(() => {fontsReady = true; inspect();}).catch(cancelRender);
    return () => {done = true; observer.disconnect(); continueRender(handle);};
  },[seconds,qaMode,reducedMotion]);
  return <AbsoluteFill data-reading-study-root style={{background:'#F4F7F6',fontFamily:'Figtree, sans-serif',color:'#1C2B45'}}>
    <DirectedFonts/>
    <div style={{position:'absolute',inset:0}}>
      <ReadingRecoveryArtwork seconds={seconds} durationSeconds={durationInFrames/fps} width={1280} height={900} insets={STUDY_INSETS} cue={cue} reducedMotion={reducedMotion} qaMode={qaMode}/>
    </div>
    <div aria-hidden style={{position:'absolute',left:0,right:0,top:0,height:100,background:'#F4F7F6',opacity:titleOpacity}}/>
    <div aria-hidden style={{position:'absolute',left:0,right:0,bottom:0,height:150,background:'#F4F7F6',opacity:titleOpacity}}/>
    <div data-study-text style={{position:'absolute',left:64,top:38,fontSize:34,fontWeight:700,opacity:titleOpacity}}>{label}</div>
    {caption && <div data-study-text style={{position:'absolute',left:60,right:60,bottom:49,textAlign:'center',fontSize:32,lineHeight:1.3,fontWeight:600}}>{caption.text}</div>}
  </AbsoluteFill>;
};

const Root = () => <Composition id='ReadingRecoveryStudy' component={Study} width={1280} height={900} fps={30} durationInFrames={294}
  defaultProps={{durationInFrames:294,captions:[],label:'Days 11–21',cue:{pageStartSeconds:2,pageEndSeconds:4.6,comfortStartSeconds:5.2,comfortEndSeconds:7.5,returnEndSeconds:9}}}
  calculateMetadata={({props}) => ({durationInFrames:props.durationInFrames})}/>;
registerRoot(Root);
