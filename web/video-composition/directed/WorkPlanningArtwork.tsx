import React from 'react';
import {prepareWorkPlanningUpperBody, mapWorkPlanningUpperBodyPoint} from './WorkPlanningUpperBody';
import {DEFAULT_WORK_PLANNING_CUE, type WorkPlanningCue, workPlanningMotion, workPropOffset, workRotate, workEase, type WorkPoint} from '../../lib/video/work-planning-motion';
import {LibrarySvgArtwork, type LibrarySvgRig} from './LibrarySvgArtwork';

const NS = 'http://www.w3.org/2000/svg';
const SOURCE_SHA = '995d9c41bff8938c57f5724fe53c5149eb08fe4e1c3e698b67570e8c9b4a5078';
const smooth = (t: number) => {const x = Math.max(0, Math.min(1,t)); return x*x*(3-2*x);};
export function workLegProofAngle(seconds: number, reducedMotion = false) {
  if(reducedMotion) return 0;
  // Bounded construction test, not the complete authored recline.
  return 5 * smooth((seconds-.6)/1.4) * (1-smooth((seconds-2.6)/1.4));
}
export function prepareWorkPlanningLegProof(svg: SVGSVGElement): LibrarySvgRig {
  const character = svg.querySelector<SVGGElement>('#Character')!;
  const parts = [...character.children] as SVGElement[];
  if(parts.length !== 100) throw new Error('Working/Pana source structure changed');
  for(const child of [...svg.children]) if(!['Character','background-simple','Floor'].includes(child.id)) child.remove();
  parts.forEach((p,i) => p.setAttribute('data-work-source-index',String(i)));
  parts.slice(96).forEach(p=>p.remove());
  // Full original shoe assembly, including every lace/sole/shading path.
  const shoe = document.createElementNS(NS,'g');
  shoe.setAttribute('data-work-layer','floor-shoe');
  character.insertBefore(shoe,parts[19]!);
  parts.slice(19,37).forEach(p=>shoe.append(p));
  const knee = {x:238,y:349};
  const rotate = (x:number,y:number,degrees:number) => {
    const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    return {x:knee.x+(x-knee.x)*c-(y-knee.y)*s,y:knee.y+(x-knee.x)*s+(y-knee.y)*c};
  };
  const deform = [90,92,93,94,95].map(i=>{
    const path=parts[i] as SVGPathElement, original=path.getAttribute('d')!;
    const length=path.getTotalLength(), count=Math.ceil(length/.12);
    const points=Array.from({length:count},(_,n)=>{
      const p=path.getPointAtLength(n*length/count);return {x:p.x,y:p.y};
    });
    return {path,original,points};
  });
  svg.setAttribute('viewBox','165 175 180 280');
  return {apply(seconds,reducedMotion) {
    const angle=workLegProofAngle(seconds,reducedMotion);
    for(const item of deform) {
      if(angle===0){item.path.setAttribute('d',item.original);continue;}
      // One continuous displacement field across the existing trouser shape;
      // upper thigh stays fixed, calf and cuff reach the shoe's rigid transform.
      item.path.setAttribute('d',item.points.map((p,i)=>{
        const q=rotate(p.x,p.y,angle*smooth((p.y-344)/20)*(1-smooth((p.x-252)/20)));
        return `${i?'L':'M'}${q.x.toFixed(4)},${q.y.toFixed(4)}`;
      }).join(' ')+' Z');
    }
    if(angle===0)shoe.removeAttribute('transform');
    else shoe.setAttribute('transform',`rotate(${angle} ${knee.x} ${knee.y})`);
    svg.setAttribute('data-work-proof-angle',String(angle));
    svg.setAttribute('data-work-state','original-source-leg-proof');
  }};
}

export function prepareWorkPlanningArtwork(svg:SVGSVGElement,cue:WorkPlanningCue,qa=false):LibrarySvgRig {
  const character=svg.querySelector<SVGGElement>('#Character')!;
  const parts=[...character.children] as SVGElement[];
  if(parts.length!==100)throw new Error('Working/Pana source structure changed');
  parts.forEach((p,i)=>p.setAttribute('data-work-source-index',String(i)));
  const scene=document.createElementNS(NS,'g');scene.setAttribute('data-work-layer','scene');
  for(const n of [...svg.children])scene.append(n);svg.append(scene);
  const group=(name:string,nodes:SVGElement[],parent:SVGElement)=>{
    const g=document.createElementNS(NS,'g');g.setAttribute('data-work-layer',name);
    parent.insertBefore(g,nodes[0]??null);nodes.forEach(n=>g.append(n));return g;
  };
  const shoe=group('floor-shoe',parts.slice(19,37),character);
  const crossedShoe=group('raised-shoe',parts.slice(37,55),character);
  const upper=prepareWorkPlanningUpperBody(svg,parts);
  const background=scene.querySelector<SVGGElement>('#background-complete')!;
  const bg=[...background.children] as SVGElement[];
  const tasks=scene.querySelector<SVGGElement>('#Tasks')!;const taskNodes=[...tasks.children] as SVGElement[];
  const coffee=scene.querySelector<SVGGElement>('#Coffee')!;
  const desk=group('desk-laptop-cup',parts.slice(96),character);desk.append(coffee);
  const props=[
    {node:group('right-window',bg.slice(5,19),background),offset:.0},
    {node:group('left-window',bg.slice(19,33),background),offset:.19},
    {node:group('wall-picture',bg.slice(0,5),background),offset:.36},
    {node:group('storage-and-books',bg.slice(33),background),offset:.62},
    {node:scene.querySelector<SVGGElement>('#Plant')!,offset:.45},
    ...[0,1,2].map(i=>({node:group(`task-card-${i}`,taskNodes.slice(i*5,(i+1)*5),tasks),offset:.12+i*.16})),
    // Clear the work surface before the outward arm sweep reaches its plane.
    {node:desk,offset:0}
  ];
  const originalChair=parts.slice(0,5).map(p=>p.outerHTML);
  const paths=[89,90,91,92,93,94,95].map(i=>{
    const node=parts[i] as SVGPathElement,original=node.getAttribute('d')!;
    const length=node.getTotalLength(),count=Math.ceil(length/.18);
    const points=Array.from({length:count},(_,n)=>{const p=node.getPointAtLength(n*length/count);return{x:p.x,y:p.y};});
    return{i,node,original,points};
  });
  return {apply(seconds,reducedMotion){
    const state=workPlanningMotion(seconds,cue,reducedMotion);upper.apply(state);
    const hip={x:282,y:324},knee={x:238,y:349};
    const thigh=(p:WorkPoint)=>{
      const h=workEase((p.x-232)/36)*(1-workEase((p.y-343)/25));
      const q=mapWorkPlanningUpperBodyPoint(p,state);
      return {x:p.x+(q.x-p.x)*h+state.legShiftX*(1-h),y:p.y+(q.y-p.y)*h+state.legShiftY*(1-h)};
    };
    const floor=(p:WorkPoint)=>{
      const bend=smooth((p.y-330)/40)*(1-smooth((p.x-252)/20));
      const rotated=workRotate(p,knee,state.legAngle);
      const q={x:p.x+(rotated.x-p.x)*bend,y:p.y+(rotated.y-p.y)*bend};
      return thigh(q);
    };
    for(const item of paths){
      if(state.recline===0&&state.legAngle===0){item.node.setAttribute('d',item.original);continue;}
      const fn=item.i===90||item.i>=92?floor:thigh;
      item.node.setAttribute('d',item.points.map((p,i)=>{const q=fn(p);return `${i?'L':'M'}${q.x.toFixed(4)},${q.y.toFixed(4)}`;}).join(' ')+' Z');
    }
    const shoeTransform=`translate(${state.legShiftX} ${state.legShiftY}) rotate(${state.legAngle} 238 349)`;
    if(state.legAngle===0)shoe.removeAttribute('transform');else shoe.setAttribute('transform',shoeTransform);
    if(state.legShiftX===0)crossedShoe.removeAttribute('transform');else crossedShoe.setAttribute('transform',`translate(${state.legShiftX} ${state.legShiftY})`);
    props.forEach(p=>{
      const start=cue.motionStart+p.offset;
      const dx=reducedMotion?0:workPropOffset(seconds,start);
      if(dx===0)p.node.removeAttribute('transform');else p.node.setAttribute('transform',`translate(${dx} 0)`);
      // Retire only after the complete object is beyond the widest viewport.
      // Its rightward parking offset must never be undone by the later scene swipe.
      p.node.setAttribute('visibility',!reducedMotion&&seconds>=start+1.6?'hidden':'visible');
    });
    const head=upper.headAnchor();const endWidth=435,endHeight=endWidth*900/1280;
    const w=660+(endWidth-660)*state.camera,h=w*900/1280;
    // Reserve the caption band below both source shoes throughout the camera move.
    const start={x:250,y:250};const target={x:head.x-endWidth*.07,y:head.y+endHeight*.21};
    const center={x:start.x+(target.x-start.x)*state.camera,y:start.y+(target.y-start.y)*state.camera};
    const view={x:center.x-w/2,y:center.y-h/2,w,h};svg.setAttribute('viewBox',`${view.x} ${view.y} ${w} ${h}`);
    if(state.exit===0)scene.removeAttribute('transform');else scene.setAttribute('transform',`translate(${-w*1.5*state.exit} 0)`);
    svg.setAttribute('data-work-state',JSON.stringify({...state,view,head}));
    if(qa){
      const viewport=svg.getBoundingClientRect();
      const bounds=(nodes:SVGElement[])=>{const b=nodes.map(n=>n.getBoundingClientRect());const x=Math.min(...b.map(n=>n.x))-viewport.x,y=Math.min(...b.map(n=>n.y))-viewport.y;return{x,y,width:Math.max(...b.map(n=>n.right))-viewport.x-x,height:Math.max(...b.map(n=>n.bottom))-viewport.y-y};};
      console.log('WORK_QA:'+JSON.stringify({seconds,reducedMotion,state,view,head,upper:upper.audit(),shoeTransform:shoe.getAttribute('transform'),
      actualBounds:{viewport:{width:viewport.width,height:viewport.height},head:bounds([...parts.slice(5,19),parts[60]!]),shoe:bounds([shoe]),chair:bounds(parts.slice(0,5))},
      chairUnchanged:parts.slice(0,5).every((p,i)=>p.outerHTML===originalChair[i]),
      cuff:floor({x:240.7,y:434.17}),shoeCuff:{...(()=>{const p=workRotate({x:240.7,y:434.17},knee,state.legAngle);return{x:p.x+state.legShiftX,y:p.y+state.legShiftY};})()},
      props:props.map(p=>({name:p.node.getAttribute('data-work-layer')??p.node.id,transform:p.node.getAttribute('transform'),visibility:p.node.getAttribute('visibility')}))}));}
  }};
}
// The active source now contains the complete reviewed typing human from frame 0.
// Static pose is approved; do not invoke the superseded reconstruction
// rig above when loading this asset. The historical leg proof remains explicit.
const prepareBakedTypingArtwork = (svg: SVGSVGElement): LibrarySvgRig => {
  svg.setAttribute('viewBox', '-80 17.96875 660 464.0625');
  svg.setAttribute('data-work-state', 'baked-typing-approved');
  return {apply() {}};
};
export const WorkPlanningArtwork:React.FC<{seconds:number;reducedMotion?:boolean;proof?:boolean;cue?:WorkPlanningCue;qa?:boolean}> =
({seconds,reducedMotion=false,proof=false})=>
  <LibrarySvgArtwork artworkId="work-planning" publicPath={proof?'studies/work-planning/working-pana.svg':'studies/work-planning/working-typing-straight-sleeve.svg'}
    expectedSha256={proof?SOURCE_SHA:'f5855ae37922acffaccf882d14e0a251d51c5bfc26b1d016df3e63104544389f'}
    seconds={seconds} reducedMotion={reducedMotion} prepare={proof?prepareWorkPlanningLegProof:prepareBakedTypingArtwork}/>;
