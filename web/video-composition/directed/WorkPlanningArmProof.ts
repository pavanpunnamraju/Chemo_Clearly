import type {LibrarySvgRig} from "./LibrarySvgArtwork";
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {const t = clamp(n); return t*t*t*(t*(t*6-15)+10);};
const finite = (n: number, label: string) => {if (!Number.isFinite(n)) throw new Error(`Arm proof nonfinite ${label}`); return n;};
type Point = {x: number; y: number};
type Side = "near" | "far";
type Field = Side | "fabric";
type Contour = {points: Point[]; closed: boolean; length: number};
type Surface = {node: SVGPathElement; owner: SVGGraphicsElement; d: string; contours: Contour[]; toSource: DOMMatrix; inverse: DOMMatrix; field: Field; label: string};
export interface WorkPlanningArmProofOptions {qa?: boolean}
export interface WorkPlanningArmProofState {seconds: number; progress: number; shoulderLift: number; elbowOpen: number}
export function workPlanningArmProofState(seconds: number, reducedMotion = false): WorkPlanningArmProofState {
  const time = clamp(finite(seconds, "clock")/6)*6;
  const raw = reducedMotion || time <= .7 ? 0 : time <= 2.3 ? ease((time-.7)/1.6) : time <= 3 ? 1 : time <= 4.6 ? 1-ease((time-3)/1.6) : 0;
  const progress = raw < 1e-12 ? 0 : raw > 1-1e-12 ? 1 : raw;
  return {seconds: time, progress, shoulderLift: 3*progress, elbowOpen: 3*progress};
}
const get = <T extends SVGElement>(parent: Element, selector: string, label: string) => {
  const node = parent.querySelector<T>(selector); if (!node) throw new Error(`Arm proof missing ${label}`); return node;
};
const map = (p: Point, matrix: DOMMatrix): Point => {
  const q = new DOMPoint(p.x,p.y).matrixTransform(matrix); return {x: finite(q.x,"mapped x"), y: finite(q.y,"mapped y")};
};
function sourceMatrix(svg: SVGSVGElement, owner: SVGGraphicsElement): DOMMatrix {
  const root = svg.getCTM(), matrix = owner.getCTM(); if (!root || !matrix) throw new Error("Arm proof requires mounted SVG");
  return root.inverse().multiply(matrix);
}
/** Each absolute-M contour sampled separately. Source subdivisions remain dense
 * (.12 SVG units) so thin marks and source curves are retained to chord precision.
 * Relative-moveto subpaths are rejected, never silently joined. */
function sample(node: SVGPathElement): Contour[] {
  const d = node.getAttribute("d"); if (!d || /m/.test(d)) throw new Error("Arm proof source requires absolute moveto contours");
  const parts = d.match(/M[^M]*/g); if (!parts?.length) throw new Error("Arm proof empty source contour coverage");
  try {return parts.map((part) => {
    node.setAttribute("d",part); const length = finite(node.getTotalLength(),"path length");
    if (length <= 0) throw new Error("Arm proof zero source length");
    const count = Math.max(24,Math.ceil(length/(length<40?.04:.12)));
    const points = Array.from({length: count+1},(_,i) => {const p=node.getPointAtLength(i*length/count); return {x:finite(p.x,"source x"),y:finite(p.y,"source y")};});
    return {points,closed:/[Zz]\s*$/.test(part),length};
  });} finally {node.setAttribute("d",d);}
}
/** Small source-relative shoulder plus elbow rotation fields, not a two-bone rig.
 * All paths and their consumer-specific clips deform in canonical SVG coordinates
 * after original far-copy scaling and palm mirroring. Source transforms unchanged.
 * No source asset, skin, palette or replacement geometry changes. */
export function prepareWorkPlanningArmProof(svg: SVGSVGElement, options: WorkPlanningArmProofOptions = {}): LibrarySvgRig {
  const character = get<SVGGElement>(svg,"[id='Character']","Character");
  const farHand = get<SVGGElement>(character,"[id='source-copy-far-arm']","far arm");
  const nearHand = get<SVGGElement>(character,"[id='source-near-arm-palms-down']","near arm");
  const shirt = farHand.nextElementSibling as SVGPathElement;
  const crease = shirt?.nextElementSibling as SVGPathElement;
  const nearCuff = crease?.nextElementSibling as SVGPathElement;
  const farCuff = get<SVGPathElement>(character,"[id='far-sleeve-cuff-separator']","far cuff");
  if (![98,99].includes(character.children.length) || !shirt?.getAttribute("d")?.startsWith("M303,270.66") || !crease?.getAttribute("d")?.startsWith("M280.37,250.53") || !nearCuff?.getAttribute("d")?.startsWith("M303.31,269.72")) throw new Error("Arm proof approved source hierarchy changed");
  // Construction pivots inferred from garment contour; not measured joints.
  // Correct transformed wrist registrations: near244,294; far190.45,285.6.
  const pivots = {far:{x:240.61,y:243.46},near:{x:291,y:245}};
  const elbows = {far:{x:237.25,y:284.7},near:{x:296,y:293}};
  const limbField = (p: Point,s: WorkPlanningArmProofState,side: Side): Point => {
    const pivot=pivots[side], w=ease((p.y-pivot.y)/(270-pivot.y));
    // Rotate the forearm separately around its own elbow before the shoulder.
    // Blend across the source curved elbow, not an arbitrary path boundary.
    // The mirrored palm and both cut masks receive precisely this same field.
    const elbow=elbows[side], scale=side==="far"?.9:1;
    const bendWeight=ease((elbow.x-p.x)/(18*scale))*ease((p.y-(elbow.y-20*scale))/(11*scale));
    const b=s.elbowOpen*Math.PI/180*bendWeight, bc=Math.cos(b),bs=Math.sin(b);
    const ex=p.x-elbow.x,ey=p.y-elbow.y;
    const bent={x:elbow.x+bc*ex-bs*ey,y:elbow.y+bs*ex+bc*ey};
    const a=s.shoulderLift*Math.PI/180*w,c=Math.cos(a),n=Math.sin(a),x=bent.x-pivot.x,y=bent.y-pivot.y;
    return {x:pivot.x+c*x-n*y+(side==="far"?-.35:.35)*s.progress*w,y:pivot.y+n*x+c*y-.4*s.progress*w};
  };
  const deform = (p: Point,s: WorkPlanningArmProofState,field: Field): Point => {
    if (field!=="fabric") return limbField(p,s,field);
    // Only sleeve supports move; fade to the unchanged armpit/torso/waist.
    const f=1-ease((p.x-245)/10), n=ease((p.x-278)/6), bottom=1-ease((p.y-280)/14);
    const far=limbField(p,s,"far"),near=limbField(p,s,"near");
    return {x:p.x+((far.x-p.x)*f+(near.x-p.x)*n)*bottom,y:p.y+((far.y-p.y)*f+(near.y-p.y)*n)*bottom};
  };
  const surfaces: Surface[]=[];
  const register = (node: SVGPathElement,field: Field,label: string,owner: SVGGraphicsElement=node): Surface => {
    const d=node.getAttribute("d"); if (!d) throw new Error(`Arm proof missing ${label} geometry`);
    const toSource=sourceMatrix(svg,owner),surface={node,owner,d,contours:sample(node),toSource,inverse:toSource.inverse(),field,label};
    surfaces.push(surface);return surface;
  };
  const shirtSurface=register(shirt,"fabric","shirt"); register(crease,"fabric","crease");
  const nearCuffSurface=register(nearCuff,"near","near-cuff"),farCuffSurface=register(farCuff,"far","far-cuff");
  const children=[...character.children],start=children.indexOf(nearHand)+1,end=children.findIndex(n=>n.getAttribute("d")?.startsWith("M299.93,315.12"));
  if (end<start) throw new Error("Arm proof fabric range changed");
  // Include original fabric marks and shading; exclude stationary hair.
  for (const node of children.slice(start,end)) {
    if (node.getAttribute("d")?.startsWith("M267.7,203")) continue;
    if (node.tagName.toLowerCase()==="path") register(node as SVGPathElement,"fabric","fabric-detail");
    else for (const p of node.querySelectorAll<SVGPathElement>("path")) register(p,"fabric","fabric-shadow");
  }
  const skin={near:[...nearHand.querySelectorAll<SVGPathElement>("path")].map((p,i)=>register(p,"near",`near-skin-${i}`)),far:[...farHand.querySelectorAll<SVGPathElement>("path")].map((p,i)=>register(p,"far",`far-skin-${i}`))};
  if (skin.near.length!==2 || skin.far.length!==2) throw new Error("Arm proof skin coverage changed");
  // Original clip defs are shared between differently transformed consumers.
  // Clone per owner; mapping uses owner's CTM, never a defs node's CTM.
  const defs=get<SVGDefsElement>(svg,"defs","defs");
  const clips: {consumer:SVGGraphicsElement;originalClip:SVGClipPathElement;surface:Surface}[]=[];
  for (const side of ["far","near"] as const) {
    const group=side==="far"?farHand:nearHand;
    for (const consumer of [group,...group.querySelectorAll<SVGGraphicsElement>("[clip-path]")]) {
      const original=consumer.getAttribute("clip-path"); if (!original) continue;
      const id=original.match(/^url\(#([^)]*)\)$/)?.[1];if (!id) throw new Error("Arm proof unsupported clip URL");
      const source=get<SVGClipPathElement>(svg,`[id='${id}']`,"source clip");
      if (source.children.length!==1) throw new Error("Arm proof clip contour coverage changed");
      const shape=source.firstElementChild!,clone=document.createElementNS("http://www.w3.org/2000/svg","clipPath"),path=document.createElementNS("http://www.w3.org/2000/svg","path");
      clone.id=`arm-proof-clip-${clips.length}`;clone.setAttribute("clipPathUnits","userSpaceOnUse");
      if (shape.tagName.toLowerCase()==="rect") {
        const x=Number(shape.getAttribute("x")),y=Number(shape.getAttribute("y")),w=Number(shape.getAttribute("width")),h=Number(shape.getAttribute("height"));
        if (![x,y,w,h].every(Number.isFinite)) throw new Error("Arm proof invalid clip rect");
        path.setAttribute("d",`M${x} ${y}H${x+w}V${y+h}H${x}Z`);
      } else if (shape.tagName.toLowerCase()==="path") path.setAttribute("d",shape.getAttribute("d")!);
      else throw new Error("Arm proof unsupported clip shape");
      clone.append(path);defs.append(clone);
      const surface=register(path,side,`${side}-clip`,consumer);clips.push({consumer,originalClip:source,surface});
    }
  }
  if (clips.length!==5) throw new Error("Arm proof incomplete clip coverage");
  const localChanged=(surface:Surface,p:Point,s:WorkPlanningArmProofState)=>map(deform(map(p,surface.toSource),s,surface.field),surface.inverse);
  const write=(surface:Surface,s:WorkPlanningArmProofState)=> {
    const unchanged=surface.contours.every(c=>c.points.every(p=>{const original=map(p,surface.toSource),q=deform(original,s,surface.field);return Math.hypot(q.x-original.x,q.y-original.y)<1e-10;}));
    if(unchanged) {surface.node.setAttribute("d",surface.d);return;}
    surface.node.setAttribute("d",surface.contours.map(({points,closed})=>points.map((p,i)=>{const q=localChanged(surface,p,s);return `${i?"L":"M"}${q.x.toFixed(6)},${q.y.toFixed(6)}`;}).join("")+(closed?"Z":"")).join(""));
  };
  const probe=(surface:Surface,target:Point)=> {
    let best=Infinity,index=0;
    surface.contours[0]!.points.forEach((p,i)=>{const q=map(p,surface.toSource),d=Math.hypot(q.x-target.x,q.y-target.y);if(d<best){best=d;index=i;}});
    return {surface,index,rest:map(surface.contours[0]!.points[index]!,surface.toSource)};
  };
  const nearSource=(p:Point)=>p;
  const farSource=(p:Point)=>map(p,skin.far[0]!.toSource);
  const jointProbes=(["near","far"] as const).map(side=> {
    const convert=side==="far"?farSource:nearSource, surface=skin[side][0]!;
    return {side,upperStart:probe(surface,convert({x:302.89,y:270})),upperEnd:probe(surface,convert({x:305.32,y:286})),
      foreStart:probe(surface,convert({x:270,y:286})),foreEnd:probe(surface,convert({x:244,y:287.32}))};
  });
  const clipProbes=(["near","far"] as const).map(side=> {
    const consumers=clips.filter(c=>c.surface.field===side && c.consumer.tagName.toLowerCase()==="path");
    if(consumers.length!==2) throw new Error("Arm proof wrist clip audit coverage changed");
    const convert=side==="far"?farSource:nearSource;
    return {side,arm:probe(consumers[0]!.surface,convert({x:244,y:294})),hand:probe(consumers[1]!.surface,convert({x:244.08,y:294}))};
  });
  const probes=[...jointProbes.flatMap(j=>[j.upperStart,j.upperEnd,j.foreStart,j.foreEnd]),
    ...clipProbes.flatMap(c=>[c.arm,c.hand]),probe(nearCuffSurface,{x:293.55,y:269.75}),probe(farCuffSurface,{x:236.1,y:276.38}),probe(shirtSurface,pivots.far),probe(shirtSurface,{x:299,y:317})];
  const readProbe=(entry:ReturnType<typeof probe>,s:WorkPlanningArmProofState):Point=> {
    // The written DOM polyline retains sample indexing. Query its actual arc
    // point; this detects transform/serialization mismatches, not just helper math.
    if(entry.surface.node.getAttribute("d")===entry.surface.d) {
      const contour=entry.surface.contours[0]!;
      const point=entry.surface.node.getPointAtLength(entry.index*contour.length/(contour.points.length-1));
      return map(point,sourceMatrix(svg,entry.surface.owner));
    }
    let distance=0;const points=entry.surface.contours[0]!.points.slice(0,entry.index+1).map(p=>localChanged(entry.surface,p,s));
    for(let i=1;i<points.length;i++) distance+=Math.hypot(points[i]!.x-points[i-1]!.x,points[i]!.y-points[i-1]!.y);
    const actual=entry.surface.node.getPointAtLength(distance);return map(actual,sourceMatrix(svg,entry.surface.owner));
  };
  const transforms=[farHand,nearHand,farCuff].map(owner=>({owner,rest:sourceMatrix(svg,owner)}));
  const restore=()=>{surfaces.forEach(({node,d})=>node.setAttribute("d",d));clips.forEach(({consumer,originalClip})=>consumer.setAttribute("clip-path",`url(#${originalClip.id})`));};
  svg.setAttribute("data-work-arm-proof","canonical-source-surface-deformation");
  svg.setAttribute("data-work-arm-proof-construction-pivots",JSON.stringify({shoulders:pivots,elbows}));restore();
  return {apply(seconds,reducedMotion) {
    const state=workPlanningArmProofState(seconds,reducedMotion);
    if(state.progress===0) restore(); else {surfaces.forEach(surface=>write(surface,state));clips.forEach(({consumer,surface})=>consumer.setAttribute("clip-path",`url(#${surface.node.parentElement!.id})`));}
    const pathProbes=probes.map(entry=>{const actual=readProbe(entry,state),expected=deform(entry.rest,state,entry.surface.field);return {label:entry.surface.label,rest:entry.rest,actual,displacement:Math.hypot(actual.x-entry.rest.x,actual.y-entry.rest.y),lift:entry.rest.y-actual.y,registrationResidual:Math.hypot(actual.x-expected.x,actual.y-expected.y)};});
    const matrixDrift=transforms.map(({owner,rest})=>{const actual=sourceMatrix(svg,owner);return Math.max(...(["a","b","c","d","e","f"] as const).map(key=>Math.abs(actual[key]-rest[key])));});
    const angle=(a:Point,b:Point)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
    const wrap=(degrees:number)=>((degrees+540)%360)-180;
    const jointAngles=jointProbes.map(j=> {
      const upperRest=angle(j.upperStart.rest,j.upperEnd.rest),foreRest=angle(j.foreStart.rest,j.foreEnd.rest);
      const upperActual=angle(readProbe(j.upperStart,state),readProbe(j.upperEnd,state));
      const foreActual=angle(readProbe(j.foreStart,state),readProbe(j.foreEnd,state));
      return {side:j.side,upperRest,foreRest,upperActual,foreActual,
        shoulderChange:wrap(upperActual-upperRest),elbowChange:wrap((foreActual-upperActual)-(foreRest-upperRest))};
    });
    const clipRegistrations=clipProbes.map(c=> {
      const arm=readProbe(c.arm,state),hand=readProbe(c.hand,state);
      const expectedArm=deform(c.arm.rest,state,c.arm.surface.field),expectedHand=deform(c.hand.rest,state,c.hand.surface.field);
      return {side:c.side,restEdgeDistance:Math.hypot(c.arm.rest.x-c.hand.rest.x,c.arm.rest.y-c.hand.rest.y),
        actualEdgeDistance:Math.hypot(arm.x-hand.x,arm.y-hand.y),
        residual:Math.hypot((arm.x-hand.x)-(expectedArm.x-expectedHand.x),(arm.y-hand.y)-(expectedArm.y-expectedHand.y))};
    });
    const measurements={surfaceCount:surfaces.length,clipCount:clips.length,stationaryMatrixDrift:Math.max(...matrixDrift),originalDCount:surfaces.filter(({node,d})=>node.getAttribute("d")===d).length,pathProbes,jointAngles,clipRegistrations};
    if(!pathProbes.length || !pathProbes.every(p=>[p.actual.x,p.actual.y,p.displacement,p.lift,p.registrationResidual].every(Number.isFinite)) || !matrixDrift.every(Number.isFinite) || !jointAngles.every(j=>[j.upperActual,j.foreActual,j.shoulderChange,j.elbowChange].every(Number.isFinite)) || !clipRegistrations.every(c=>[c.restEdgeDistance,c.actualEdgeDistance,c.residual].every(Number.isFinite))) throw new Error("Arm proof incomplete/nonfinite DOM audit");
    svg.setAttribute("data-work-arm-proof-state",JSON.stringify({state,measurements}));
    if(options.qa) console.log(`ARM_PROOF_QA:${JSON.stringify({seconds:state.seconds,reducedMotion,state,measurements})}`);
  }};
}
