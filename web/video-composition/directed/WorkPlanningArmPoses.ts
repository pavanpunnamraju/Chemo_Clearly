import {prepareWorkPlanningArmatureRevision} from './WorkPlanningArmatureRevision';
import type {ArmaturePoint, ArmatureSide, ArmatureSurface} from './WorkPlanningArmature';

export type WorkPlanningArmPoseIndex = 0|1|2|3|4;
export const WORK_PLANNING_ARM_POSES = [
  {id:0,label:'Approved working rest'},
  {id:1,label:'Hands clear the work'},
  {id:2,label:'Elbows open, forearms beside face'},
  {id:3,label:'Hands rise beside head'},
  {id:4,label:'Fingertips meet above head'},
] as const;
const NS='http://www.w3.org/2000/svg';
const finite=(v:number)=>{if(!Number.isFinite(v))throw new Error('Arm pose nonfinite geometry');return v;};
const p=(x:number,y:number):ArmaturePoint=>({x:finite(x),y:finite(y)});
const distance=(a:ArmaturePoint,b:ArmaturePoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const map=(q:ArmaturePoint,m:DOMMatrix)=>{const r=new DOMPoint(q.x,q.y).matrixTransform(m);return p(r.x,r.y);};
const textMatrix=(m:DOMMatrix)=>`matrix(${[m.a,m.b,m.c,m.d,m.e,m.f].map(finite).join(' ')})`;
const tupleMatrix=(t:readonly number[])=>new DOMMatrix([...t]);
const rotate=(root:ArmaturePoint,angle:number,destination=root)=>new DOMMatrix().translate(destination.x,destination.y).rotate(angle).translate(-root.x,-root.y);
const angle=(a:ArmaturePoint,b:ArmaturePoint)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
const node=<K extends keyof SVGElementTagNameMap>(tag:K,attrs:Record<string,string>={})=>{
  const el=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);return el;
};
function clipRectangle(points:ArmaturePoint[],left:number,right:number,top:number,bottom:number){
  let result=points.filter((_,i)=>i%2===0);
  for(const [axis,limit,positive]of [['x',left,true],['x',right,false],['y',top,true],['y',bottom,false]]as const){
    const input=result;result=[];if(!input.length)break;
    for(let i=0;i<input.length;i++){
      const a=input[i]!,b=input[(i+1)%input.length]!,insideA=positive?a[axis]>=limit:a[axis]<=limit,insideB=positive?b[axis]>=limit:b[axis]<=limit;
      if(insideA)result.push(a);
      if(insideA!==insideB){const t=(limit-a[axis])/(b[axis]-a[axis]);result.push(p(a.x+t*(b.x-a.x),a.y+t*(b.y-a.y)));}
    }
  }
  if(result.length<3)throw new Error('Arm pose empty clipped hand polygon');return result;
}
const cross=(a:ArmaturePoint,b:ArmaturePoint,c:ArmaturePoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points:ArmaturePoint[]){
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),lower:ArmaturePoint[]=[],upper:ArmaturePoint[]=[];
  for(const q of sorted){while(lower.length>1&&cross(lower[lower.length-2]!,lower[lower.length-1]!,q)<=0)lower.pop();lower.push(q);}
  for(const q of [...sorted].reverse()){while(upper.length>1&&cross(upper[upper.length-2]!,upper[upper.length-1]!,q)<=0)upper.pop();upper.push(q);}
  return[...lower.slice(0,-1),...upper.slice(0,-1)];
}
function contourCrossings(surface:ArmatureSurface,axis:'x'|'y',value:number){
  const results:ArmaturePoint[]=[];
  for(const contour of surface.contours){const points=contour.samples.map(s=>s.local);for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!;
    if((a[axis]<=value&&b[axis]>=value||a[axis]>=value&&b[axis]<=value)&&Math.abs(a[axis]-b[axis])>1e-9){
      const t=(value-a[axis])/(b[axis]-a[axis]);results.push(p(a.x+t*(b.x-a.x),a.y+t*(b.y-a.y)));
    }
  }}return results;
}
function inside(q:ArmaturePoint,poly:ArmaturePoint[]){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i]!,b=poly[j]!;if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
}return yes;}
function polygonContact(a:ArmaturePoint[],b:ArmaturePoint[]){
  let edgeIntersections=0,min=Infinity,pa=a[0]!,pb=b[0]!;
  const nearest=(q:ArmaturePoint,u:ArmaturePoint,v:ArmaturePoint)=>{const n=(v.x-u.x)**2+(v.y-u.y)**2,t=n?Math.max(0,Math.min(1,((q.x-u.x)*(v.x-u.x)+(q.y-u.y)*(v.y-u.y))/n)):0;return p(u.x+t*(v.x-u.x),u.y+t*(v.y-u.y));};
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    const u=a[i]!,v=a[(i+1)%a.length]!,w=b[j]!,z=b[(j+1)%b.length]!;
    if(cross(u,v,w)*cross(u,v,z)<-1e-12&&cross(w,z,u)*cross(w,z,v)<-1e-12)edgeIntersections++;
    for(const [q,r,onA]of [[u,nearest(u,w,z),true],[v,nearest(v,w,z),true],[w,nearest(w,u,v),false],[z,nearest(z,u,v),false]]as const){const d=distance(q,r);if(d<min){min=d;pa=onA?q:r;pb=onA?r:q;}}
  }
  const containedVertices=a.filter(q=>inside(q,b)).length+b.filter(q=>inside(q,a)).length;
  return{gap:finite(min),edgeIntersections,containedVertices,overlap:edgeIntersections>0||containedVertices>0,nearPoint:pa,farPoint:pb};
}
interface Carrier {side:ArmatureSide;upper:SVGGElement;fore:SVGGElement;sleeve:SVGGElement;
  upperPaint:SVGGElement;forePaint:SVGGElement;
  shoulder:ArmaturePoint;elbow:ArmaturePoint;wrist:ArmaturePoint;tip:ArmaturePoint;
  shoulderProbe:SVGCircleElement;elbowProbe:SVGCircleElement;foreElbowProbe:SVGCircleElement;wristProbe:SVGCircleElement;tipProbe:SVGCircleElement;
  clips:SVGClipPathElement[];cap:SVGPathElement;innerWedge:SVGPathElement;innerBand:SVGPathElement;shoulderPatch:SVGPathElement;
  bridgeConstraints:{clip:SVGClipPathElement;source:SVGPathElement;plane:SVGPathElement;kind:'upper'|'fore'}[];
  upperCut:ArmaturePoint[];foreCut:ArmaturePoint[];sleeveRoot:ArmaturePoint[];
  skinSurface:ArmatureSurface;handSurface:ArmatureSurface;foreSkin:SVGPathElement;handPaint:SVGPathElement;handPolygon:ArmaturePoint[];
  expectedUpper:DOMMatrix;expectedFore:DOMMatrix;contactTarget:ArmaturePoint;}

/** Static construction study. Source paths are clipped into rigid render units;
 * this is deliberately separate from the approved small-motion deformation.
 * Index zero restores the original source layers, rather than asserting that
 * the newly assembled layer stack has identical zero-angle raster coverage. */
export function prepareWorkPlanningArmPoses(svg:SVGSVGElement){
  if(svg.hasAttribute('data-work-arm-poses'))throw new Error('Arm poses already prepared');
  const rig=prepareWorkPlanningArmatureRevision(svg);
  const restAudit=rig.audit();
  const character=svg.querySelector<SVGGElement>('[id="Character"]');
  if(!character)throw new Error('Arm poses missing Character');
  const rootMatrix=(el:SVGGraphicsElement)=>{const a=svg.getCTM(),b=el.getCTM();if(!a||!b)throw new Error('Arm pose mounted source matrix required');return a.inverse().multiply(b);};
  const headNodes=[...character.querySelectorAll<SVGPathElement>('path')].filter(el=>
    !rig.surfaces.some(s=>s.node===el)&&el.getBBox().y<243);
  const headSnapshots=headNodes.map(el=>({el,attributes:[...el.attributes].filter(a=>a.name!=='id'&&!a.name.startsWith('data-')).map(a=>[a.name,a.value]),matrix:rootMatrix(el)}));
  const shirt=rig.surfaces.find(s=>s.role==='shared-shirt-sleeves-torso')!;
  if(!shirt.sourceD.includes('C232.96,252.09 228.2,263.5 226.15,276.38'))throw new Error('Arm poses require approved straight sleeve source');
  const defs=svg.querySelector('defs')??svg.insertBefore(node('defs'),svg.firstChild);
  let serial=0;const prefix='work-pose';
  const register=<T extends SVGElement>(element:T)=>{element.id=`${prefix}-${++serial}`;defs.appendChild(element);return element;};
  const pathClip=(d:string)=>{const clip=register(node('clipPath',{clipPathUnits:'userSpaceOnUse'}));clip.appendChild(node('path',{d}));return clip;};
  // These boundaries follow the original garment's external source arcs. Their
  // closing lines are internal segmentation seams, not new visible outlines.
  const sleeveD={
    far:'M220,243.46H253L245.45,276.7H220Z',
    near:'M279,245H315V271L283.79,271Z',
  };
  const torsoStart=shirt.sourceD.indexOf('c0,4.79,5,7,5,7');
  const torsoD=`M245.45,274.54${shirt.sourceD.slice(torsoStart).replace(/[Zz]\s*$/,'')}L291,245L276.22,237L260,236.73L243.61,243.46Z`;
  const sleeveClips={near:pathClip(sleeveD.near),far:pathClip(sleeveD.far)};
  const originals=new Map<SVGElement,{display:string|null;mask:string|null}>();
  const remember=(el:SVGElement)=>{if(!originals.has(el))originals.set(el,{display:el.getAttribute('display'),mask:el.getAttribute('mask')});};
  const masks:{consumer:SVGPathElement;mask:SVGMaskElement}[]=[];
  const fabric=rig.surfaces.filter(s=>!s.role.includes('shared-upperarm-forearm')&&!s.role.includes('mirrored-source-hand'));
  // The fixed source torso owns its exact existing contour arc. This internal
  // upper closure connects shoulder roots around the retained collar/chest;
  // there is no broad slab restoring old sleeve lobes under the lifted units.
  for(const surface of fabric){
    const mask=register(node('mask',{maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',x:'-500',y:'-500',width:'1500',height:'1500'}));
    const root=node('g',{transform:textMatrix(tupleMatrix(surface.inverseCanonicalMatrix))});
    root.appendChild(node('path',{d:torsoD,fill:'white'}));
    mask.appendChild(root);masks.push({consumer:surface.node,mask});remember(surface.node);
  }
  const sourceClipRefs:{clone:SVGPathElement;clip:SVGClipPathElement}[]=[];
  const cloneSurface=(surface:ArmatureSurface,parent:SVGGElement)=>{
    const clone=surface.node.cloneNode(false)as SVGPathElement;
    clone.removeAttribute('id');clone.removeAttribute('mask');clone.removeAttribute('display');
    clone.setAttribute('data-pose-source',surface.id);
    clone.setAttribute('transform',textMatrix(tupleMatrix(surface.canonicalMatrix)));
    // Preserve inherited source shadow opacity when lifting a path from a group.
    let inherited=1;let ancestor:Element|null=surface.node.parentElement;
    while(ancestor&&ancestor!==character){inherited*=Number(getComputedStyle(ancestor).opacity);ancestor=ancestor.parentElement;}
    if(inherited!==1)clone.style.opacity=String(inherited*Number(getComputedStyle(surface.node).opacity));
    const clipId=surface.node.getAttribute('clip-path')?.match(/url\(#([^)]*)\)/)?.[1];
    if(clipId){const clip=svg.querySelector<SVGClipPathElement>(`[id="${clipId}"]`);if(!clip)throw new Error('Arm pose missing source clip');sourceClipRefs.push({clone,clip});}
    parent.appendChild(clone);return clone;
  };
  const joint=(side:ArmatureSide,kind:string)=>rig.bindings.joints.find(j=>j.side===side&&j.kind===kind)!.canonical;
  const probe=(parent:SVGGElement,q:ArmaturePoint)=>{const el=node('circle',{cx:String(q.x),cy:String(q.y),r:'.01',fill:'none','data-pose-probe':'true'});parent.appendChild(el);return el;};
  const carriers:Carrier[]=[];
  const assemblies:SVGGElement[]=[];
  const farConcealConsumers:{consumer:SVGGElement;clip:SVGClipPathElement}[]=[];
  const coverageClipConsumers:{consumer:SVGGraphicsElement;clip:SVGClipPathElement}[]=[];
  const torsoDetails=node('g',{'data-pose-unit':'stationary-torso-details',display:'none'});
  character.insertBefore(torsoDetails,shirt.node.nextSibling);
  const torsoClip=pathClip(torsoD);torsoDetails.setAttribute('clip-path',`url(#${torsoClip.id})`);
  const isLimbDetail=(surface:ArmatureSurface)=>['near-cuff-separator','far-cuff-separator','near-fabric-crease','original-fabric-shadow'].includes(surface.role)||surface.sourceD.startsWith('M245.9,271.17');
  for(const surface of fabric)if(surface!==shirt&&!isLimbDetail(surface))cloneSurface(surface,torsoDetails);
  for(const side of ['far','near']as const){
    const sourceGroup=svg.querySelector<SVGGElement>(`[id="${side==='far'?'source-copy-far-arm':'source-near-arm-palms-down'}"]`)!;
    remember(sourceGroup);
    const assembly=node('g',{'data-pose-assembly':side,display:'none'});character.insertBefore(assembly,sourceGroup);assemblies.push(assembly);
    const upper=node('g',{'data-pose-unit':`${side}-upperarm`}),fore=node('g',{'data-pose-unit':`${side}-forearm-hand`}),sleeve=node('g',{'data-pose-unit':`${side}-sleeve`});
    assembly.append(upper,fore,sleeve);
    const skin=rig.surfaces.find(s=>s.role===`${side}-shared-upperarm-forearm`)!,hand=rig.surfaces.find(s=>s.role===`${side}-mirrored-source-hand`)!;
    const shoulder=joint(side,'shoulder'),elbow=joint(side,'elbow'),wrist=joint(side,'wrist');
    const skinMatrix=tupleMatrix(skin.canonicalMatrix);
    const sourceClip=(d:string)=>{const clip=pathClip(d);clip.firstElementChild!.setAttribute('transform',textMatrix(skinMatrix));return clip;};
    const upperClip=sourceClip('M284,250H310V283H284Z');
    const foreClip=sourceClip('M200,283H284V320H200Z');
    const upperPaint=node('g'),forePaint=node('g');upper.appendChild(upperPaint);fore.appendChild(forePaint);
    upperPaint.setAttribute('clip-path',`url(#${upperClip.id})`);forePaint.setAttribute('clip-path',`url(#${foreClip.id})`);
    let upperSkinReceiver=upperPaint;
    if(side==='far'){
      const binding=rig.clipBindings.find(b=>b.consumer===sourceGroup);
      if(!binding)throw new Error('Arm pose far source root clip missing');
      const canonicalClip=register(node('clipPath',{clipPathUnits:'userSpaceOnUse'}));
      for(const child of [...binding.clip.children]){const clone=child.cloneNode(true)as SVGElement;clone.removeAttribute('id');clone.setAttribute('transform',textMatrix(tupleMatrix(binding.canonicalMatrix)));canonicalClip.appendChild(clone);}
      upperSkinReceiver=node('g',{'clip-path':`url(#${canonicalClip.id})`});upperPaint.appendChild(upperSkinReceiver);
      farConcealConsumers.push({consumer:upperSkinReceiver,clip:canonicalClip});
    }
    cloneSurface(skin,upperSkinReceiver);const foreSkin=cloneSurface(skin,forePaint),handPaint=cloneSurface(hand,fore);
    const cap=node('path',{fill:skin.node.getAttribute('fill')??'#ffbe9d','data-pose-coverage':`${side}-elbow`});
    const bridgeWrapper=node('g');bridgeWrapper.appendChild(cap);assembly.insertBefore(bridgeWrapper,upper);
    const innerWedge=node('path',{fill:skin.node.getAttribute('fill')??'#ffbe9d','data-pose-coverage':`${side}-inner-elbow-overlap`});assembly.insertBefore(innerWedge,upper);
    const innerClip=pathClip('M0,0Z'),innerBand=innerClip.firstElementChild as SVGPathElement;
    innerWedge.setAttribute('clip-path',`url(#${innerClip.id})`);coverageClipConsumers.push({consumer:innerWedge,clip:innerClip});
    const bridgeConstraints=(['upper','fore']as const).map(kind=>{
      const clip=register(node('clipPath',{clipPathUnits:'userSpaceOnUse'})),source=node('path',{d:skin.sourceD}),plane=node('path',{d:kind==='upper'?'M-500,283H500V500H-500Z':'M284,-500H500V500H284Z'});
      clip.append(source,plane);const consumer=kind==='upper'?bridgeWrapper:cap;
      consumer.setAttribute('clip-path',`url(#${clip.id})`);coverageClipConsumers.push({consumer,clip});return{clip,source,plane,kind};
    });
    const shoulderPatch=node('path',{fill:shirt.node.getAttribute('fill')??'#FF725E','data-pose-coverage':`${side}-shoulder-socket`});assembly.insertBefore(shoulderPatch,bridgeWrapper);
    // One source-unit overlap lies inside each retained half. Constraint clips
    // retain its exact source exterior on that side of the transverse cut.
    const upperCutLocal=contourCrossings(skin,'y',282).filter(q=>q.x>=284&&q.x<=310).sort((a,b)=>a.x-b.x);
    const foreCutLocal=contourCrossings(skin,'x',283).filter(q=>q.y>=283&&q.y<=320).sort((a,b)=>a.y-b.y);
    if(upperCutLocal.length!==2||foreCutLocal.length!==2)throw new Error('Arm pose source transverse boundary count changed');
    const upperCut=upperCutLocal.map(q=>map(q,skinMatrix)),foreCut=foreCutLocal.map(q=>map(q,skinMatrix));
    const garmentCrossings=contourCrossings(shirt,'y',shoulder.y+1).map(q=>map(q,tupleMatrix(shirt.canonicalMatrix))).sort((a,b)=>a.x-b.x);
    if(garmentCrossings.length!==2)throw new Error('Arm pose garment shoulder cross-section changed');
    const sleeveRoot=side==='far'?[garmentCrossings[0]!,p(253+(245.45-253)/(276.7-243.46),shoulder.y+1)]:[p(279+(283.79-279)/26,shoulder.y+1),garmentCrossings[1]!];
    // This same-color wrist underpaint is the intersection of the original
    // skin and mirrored-hand surfaces. It cannot enlarge either visible side.
    const wristBand=sourceClip('M243.6,250H244.5V320H243.6Z');
    const handShape=pathClip(hand.sourceD);handShape.firstElementChild!.setAttribute('transform',textMatrix(tupleMatrix(hand.canonicalMatrix)));
    const wristWrapper=node('g',{'clip-path':`url(#${wristBand.id})`,'data-pose-coverage':`${side}-wrist-overlap`});
    const wristPaint=skin.node.cloneNode(false)as SVGPathElement;wristPaint.removeAttribute('id');wristPaint.setAttribute('transform',textMatrix(skinMatrix));wristPaint.setAttribute('clip-path',`url(#${handShape.id})`);wristWrapper.appendChild(wristPaint);fore.insertBefore(wristWrapper,forePaint);
    coverageClipConsumers.push({consumer:wristWrapper,clip:wristBand},{consumer:wristPaint,clip:handShape});
    sleeve.setAttribute('clip-path',`url(#${sleeveClips[side].id})`);
    for(const surface of fabric){
      if(surface.role==='near-cuff-separator'&&side==='far'||surface.role==='far-cuff-separator'&&side==='near')continue;
      cloneSurface(surface,sleeve);
    }
    // Actual source hand contour, bounded by the original hand clip. Its most
    // distal source contour point becomes the explicit contact fingertip.
    const samples=hand.contours.flatMap(c=>c.samples).filter(s=>s.local.x<=244.08&&s.local.x>=200&&s.local.y>=250&&s.local.y<=320);
    if(!samples.length)throw new Error('Arm poses empty clipped hand contour');
    const tip=samples.reduce((best,s)=>s.canonical.x<best.x?s.canonical:best,samples[0]!.canonical);
    const handPolygon=clipRectangle(hand.contours[0]!.samples.map(s=>s.local),200,244.08,250,320);
    carriers.push({side,upper,fore,sleeve,upperPaint,forePaint,shoulder,elbow,wrist,tip,foreSkin,handPaint,handPolygon,expectedUpper:new DOMMatrix(),expectedFore:new DOMMatrix(),contactTarget:p(264,169),
      shoulderProbe:probe(upper,shoulder),elbowProbe:probe(upper,elbow),foreElbowProbe:probe(fore,elbow),wristProbe:probe(fore,wrist),tipProbe:probe(fore,tip),
      clips:[upperClip,foreClip,sleeveClips[side]],cap,innerWedge,innerBand,shoulderPatch,bridgeConstraints,upperCut,foreCut,sleeveRoot,skinSurface:skin,handSurface:hand});
  }
  const unitClipConsumers=carriers.flatMap(c=>[{consumer:c.upperPaint,clip:c.clips[0]!},{consumer:c.forePaint,clip:c.clips[1]!},{consumer:c.sleeve,clip:c.clips[2]!}]);
  const snapshots=rig.surfaces.map(s=>({surface:s,d:s.node.getAttribute('d')}));
  const restJoints=restAudit.joints;
  const torsoProbes=restAudit.ownershipChecks.probes.map(q=>({...q.canonical}));
  const sourceTorsoMapping=tupleMatrix(shirt.canonicalMatrix);
  let poseIndex:WorkPlanningArmPoseIndex=0;
  const actual=(el:SVGGraphicsElement,q:ArmaturePoint)=>{const a=svg.getCTM(),b=el.getCTM();if(!a||!b)throw new Error('Arm pose audit needs mounted DOM');return map(q,a.inverse().multiply(b));};
  const probePoint=(el:SVGCircleElement)=>actual(el,p(Number(el.getAttribute('cx')),Number(el.getAttribute('cy'))));
  const target=p(264,169);
  function solveContact(c:Carrier,destination:ArmaturePoint){
    const upperLength=distance(c.shoulder,c.elbow),effectiveForeLength=distance(c.elbow,c.tip),reach=distance(c.shoulder,destination);
    const cosine=(upperLength**2+reach**2-effectiveForeLength**2)/(2*upperLength*reach);
    if(cosine<-1||cosine>1)throw new Error('Arm contact target outside unscaled source reach');
    const branch=c.side==='far'?-1:1;
    const upperAngle=angle(c.shoulder,destination)+branch*Math.acos(cosine)*180/Math.PI-angle(c.shoulder,c.elbow);
    const upperMatrix=rotate(c.shoulder,upperAngle),elbow=map(c.elbow,upperMatrix);
    const foreMatrix=rotate(c.elbow,angle(elbow,destination)-angle(c.elbow,c.tip),elbow);
    return{upperMatrix,foreMatrix};
  }
  function separatedContactTargets(){
    const pair=(separation:number)=>carriers.map(c=>{
      const destination=p(target.x+(c.side==='near'?1:-1)*separation/2,target.y),solution=solveContact(c,destination);
      return{c,destination,...solution,polygon:c.handPolygon.map(q=>map(map(q,tupleMatrix(c.handSurface.canonicalMatrix)),solution.foreMatrix))};
    });
    const overlap=(items:ReturnType<typeof pair>)=>polygonContact(items[0]!.polygon,items[1]!.polygon).overlap;
    let low=0,high=24;
    if(overlap(pair(high)))throw new Error('Arm pose hand contact cannot separate source hands');
    if(!overlap(pair(0)))return pair(0);
    for(let iteration=0;iteration<24;iteration++){const mid=(low+high)/2;if(overlap(pair(mid)))low=mid;else high=mid;}
    return pair(high+.002);
  }
  function coverage(c:Carrier){
    const e=map(c.elbow,c.expectedUpper),s=map(c.shoulder,c.expectedUpper),w=map(c.wrist,c.expectedFore);
    const du=p((e.x-s.x)/distance(e,s),(e.y-s.y)/distance(e,s)),df=p((w.x-e.x)/distance(w,e),(w.y-e.y)/distance(w,e));
    const turn=du.x*df.y-du.y*df.x,sign=turn<0?1:-1;
    const nu=p(-du.y*sign,du.x*sign),nf=p(-df.y*sign,df.x*sign);
    const dot=(q:ArmaturePoint,n:ArmaturePoint)=>(q.x-e.x)*n.x+(q.y-e.y)*n.y;
    const upper=c.upperCut.map(q=>map(q,c.expectedUpper)).sort((a,b)=>dot(b,nu)-dot(a,nu));
    const fore=c.foreCut.map(q=>map(q,c.expectedFore)).sort((a,b)=>dot(b,nf)-dot(a,nf));
    const uo=upper[0]!,ui=upper[1]!,fo=fore[0]!,fi=fore[1]!;
    const cu=p((uo.x+ui.x)/2,(uo.y+ui.y)/2),cf=p((fo.x+fi.x)/2,(fo.y+fi.y)/2);
    const lu=Math.max(1,(e.x-cu.x)*du.x+(e.y-cu.y)*du.y)*1.25,lf=Math.max(1,(cf.x-e.x)*df.x+(cf.y-e.y)*df.y)*1.25;
    const uc=p(uo.x+du.x*lu,uo.y+du.y*lu),fc=p(fo.x-df.x*lf,fo.y-df.y*lf);
    // This bridge interpolates the two actual cut widths. It has no independent
    // disk/ball silhouette and is painted underneath both retained source halves.
    // Large-angle source cuts can bring the inner endpoints very close.
    // Handle lengths based on full limb distances would loop across that gap.
    const innerHandle=Math.min(lu*.3,lf*.3,distance(fi,ui)*.2);
    const fic=p(fi.x-df.x*innerHandle,fi.y-df.y*innerHandle),uic=p(ui.x+du.x*innerHandle,ui.y+du.y*innerHandle);
    c.cap.setAttribute('d',`M${uo.x},${uo.y}C${uc.x},${uc.y} ${fc.x},${fc.y} ${fo.x},${fo.y}L${fi.x},${fi.y}C${fic.x},${fic.y} ${uic.x},${uic.y} ${ui.x},${ui.y}Z`);
    // Restore only the inner band of the intended bridge. Its own raw contour
    // bounds the natural white concavity; this cannot paint outside that shape
    // or reach uo/fo. It bypasses the source-side constraints which carved the
    // material-side pinholes at both the fore and upper tangent neighborhoods.
    const band=hull([
      p(fi.x+df.x-nf.x*.8,fi.y+df.y-nf.y*.8),p(ui.x-du.x-nu.x*.8,ui.y-du.y-nu.y*.8),
      p(ui.x+du.x*2-nu.x*.8,ui.y+du.y*2-nu.y*.8),p(ui.x+du.x*2+nu.x*1.5,ui.y+du.y*2+nu.y*1.5),
      p(fi.x-df.x*2+nf.x*1.5,fi.y-df.y*2+nf.y*1.5),p(fi.x-df.x*2-nf.x*.8,fi.y-df.y*2-nf.y*.8),
    ]);
    c.innerWedge.setAttribute('d',c.cap.getAttribute('d')!);
    c.innerBand.setAttribute('d',`${band.map((q,i)=>`${i?'L':'M'}${q.x},${q.y}`).join('')}Z`);
    for(const constraint of c.bridgeConstraints){const transform=textMatrix((constraint.kind==='upper'?c.expectedUpper:c.expectedFore).multiply(tupleMatrix(c.skinSurface.canonicalMatrix)));constraint.source.setAttribute('transform',transform);constraint.plane.setAttribute('transform',transform);}
    const root=c.sleeveRoot.map(q=>map(q,c.expectedUpper));
    const outside=c.side==='far'?root[0]!:root[1]!,insideRoot=c.side==='far'?root[1]!:root[0]!;
    const underarm=c.side==='far'?p(245.45,274.54):p(293,270.66);
    const socketDepth=c.side==='far'?14:12,t=socketDepth/distance(c.shoulder,underarm);
    const inward=c.side==='far'?1:-1;
    const body=p(c.shoulder.x+(underarm.x-c.shoulder.x)*t+inward,c.shoulder.y+(underarm.y-c.shoulder.y)*t),fixedRoot=p(c.shoulder.x+inward,c.shoulder.y);
    c.shoulderPatch.setAttribute('d',`M${outside.x},${outside.y}Q${(outside.x+fixedRoot.x)/2},${(outside.y+fixedRoot.y)/2} ${fixedRoot.x},${fixedRoot.y}L${body.x},${body.y}Q${(body.x+insideRoot.x)/2},${(body.y+insideRoot.y)/2} ${insideRoot.x},${insideRoot.y}Z`);
  }
  function applyPose(index:WorkPlanningArmPoseIndex){
    if(!Number.isInteger(index)||index<0||index>4)throw new Error('Arm pose index out of range');poseIndex=index;
    for(const [el,attrs]of originals){for(const name of ['display','mask']as const){const value=attrs[name];if(value===null)el.removeAttribute(name);else el.setAttribute(name,value);}}
    for(const assembly of assemblies)assembly.setAttribute('display',index===0?'none':'inline');
    torsoDetails.setAttribute('display',index===0?'none':'inline');torsoDetails.setAttribute('clip-path',`url(#${torsoClip.id})`);
    for(const c of carriers){c.upper.removeAttribute('transform');c.fore.removeAttribute('transform');c.sleeve.removeAttribute('transform');c.expectedUpper=new DOMMatrix();c.expectedFore=new DOMMatrix();}
    // Namespace-safe reference refresh: the loader namespaces after prepare.
    for(const ref of sourceClipRefs)ref.clone.setAttribute('clip-path',`url(#${ref.clip.id})`);
    for(const ref of unitClipConsumers)ref.consumer.setAttribute('clip-path',`url(#${ref.clip.id})`);
    for(const ref of farConcealConsumers)ref.consumer.setAttribute('clip-path',`url(#${ref.clip.id})`);
    for(const ref of coverageClipConsumers)ref.consumer.setAttribute('clip-path',`url(#${ref.clip.id})`);
    if(index===0)return;
    for(const {consumer,mask}of masks)consumer.setAttribute('mask',`url(#${mask.id})`);
    for(const surface of fabric)if(surface!==shirt)surface.node.setAttribute('display','none');
    const contactSolutions=index===4?separatedContactTargets():null;
    for(const c of carriers){
      // The original source group is held by its registered source surface.
      const source=c.skinSurface.node.parentElement!;source.setAttribute('display','none');
      let upperAngle:number,foreRotation:number,elbow:ArmaturePoint;
      if(index===4){
        const solution=contactSolutions!.find(s=>s.c===c)!;
        c.expectedUpper=solution.upperMatrix;c.expectedFore=solution.foreMatrix;c.contactTarget=solution.destination;
        c.upper.setAttribute('transform',textMatrix(c.expectedUpper));c.sleeve.setAttribute('transform',textMatrix(c.expectedUpper));c.fore.setAttribute('transform',textMatrix(c.expectedFore));coverage(c);continue;
      }else{
        const shoulderAngles={far:[0,10,50,85],near:[0,-10,-60,-105]};
        const foreAngles={far:[0,205,238,290],near:[0,200,300,240]};
        upperAngle=shoulderAngles[c.side][index]!;
        elbow=map(c.elbow,rotate(c.shoulder,upperAngle));
        foreRotation=foreAngles[c.side][index]!-angle(c.elbow,c.wrist);
      }
      const upperMatrix=rotate(c.shoulder,upperAngle),foreMatrix=rotate(c.elbow,foreRotation,elbow);
      c.expectedUpper=upperMatrix;c.expectedFore=foreMatrix;
      c.upper.setAttribute('transform',textMatrix(upperMatrix));c.sleeve.setAttribute('transform',textMatrix(upperMatrix));c.fore.setAttribute('transform',textMatrix(foreMatrix));
      coverage(c);
    }
  }
  function audit(){
    const liveReference=(consumer:Element,attribute:string,expected:SVGElement)=>{
      const value=consumer.getAttribute(attribute),id=value?.match(/^url\(#([^)]*)\)$/)?.[1];
      return id===expected.id&&svg.querySelector(`[id="${id}"]`)===expected;
    };
    const clipOwners=unitClipConsumers.map(ref=>({liveClipId:ref.clip.id,consumerUnit:ref.consumer.closest('[data-pose-unit]')?.getAttribute('data-pose-unit'),liveMatch:liveReference(ref.consumer,'clip-path',ref.clip)}));
    const concealClipsValid=farConcealConsumers.every(ref=>liveReference(ref.consumer,'clip-path',ref.clip));
    const sourceClipsValid=sourceClipRefs.every(ref=>liveReference(ref.clone,'clip-path',ref.clip));
    const coverageClipsValid=coverageClipConsumers.every(ref=>liveReference(ref.consumer,'clip-path',ref.clip));
    const masksValid=poseIndex===0?true:masks.every(ref=>liveReference(ref.consumer,'mask',ref.mask));
    if(clipOwners.some(ref=>!ref.liveMatch)||!concealClipsValid||!sourceClipsValid||!masksValid||!coverageClipsValid)throw new Error('Arm pose live clip/mask ownership failed');
    const joints=carriers.flatMap(c=>{
      return(['shoulder','elbow','wrist']as const).map(kind=>{
        const registration=restJoints.find(j=>j.side===c.side&&j.kind===kind)!,binding=rig.bindings.joints.find(j=>j.id===registration.id)!;
        const observed=poseIndex===0?actual(binding.carrier,binding.carrierLocal):probePoint(kind==='shoulder'?c.shoulderProbe:kind==='elbow'?c.elbowProbe:c.wristProbe);
        const expected=map(registration.canonical,kind==='wrist'?c.expectedFore:c.expectedUpper);
        return{id:registration.id,side:c.side,kind,canonical:registration.canonical,actual:observed,expected,mappingResidual:distance(observed,expected)};
      });
    });
    const limbs=carriers.map(c=>{
      const s=poseIndex===0?c.shoulder:probePoint(c.shoulderProbe),e=poseIndex===0?c.elbow:probePoint(c.elbowProbe),w=poseIndex===0?c.wrist:probePoint(c.wristProbe),fe=poseIndex===0?c.elbow:probePoint(c.foreElbowProbe),tip=poseIndex===0?c.tip:probePoint(c.tipProbe);
      const upperLength=distance(s,e),forearmLength=distance(e,w);
      const armWrist=actual(poseIndex===0?c.skinSurface.node:c.foreSkin,p(244,294)),handWrist=actual(poseIndex===0?c.handSurface.node:c.handPaint,p(244.08,294));
      const originalOverlap=distance(map(p(244,294),tupleMatrix(c.skinSurface.canonicalMatrix)),map(p(244.08,294),tupleMatrix(c.handSurface.canonicalMatrix)));
      return{side:c.side,upperLength,forearmLength,upperLengthResidual:Math.abs(upperLength-distance(c.shoulder,c.elbow)),forearmLengthResidual:Math.abs(forearmLength-distance(c.elbow,c.wrist)),elbowJoinResidual:distance(e,fe),wristJoinResidual:Math.abs(distance(armWrist,handWrist)-originalOverlap),wristOriginalOverlap:originalOverlap,wristActualOverlap:distance(armWrist,handWrist),fingertip:tip,contactTarget:c.contactTarget};
    });
    const near=limbs.find(l=>l.side==='near')!,far=limbs.find(l=>l.side==='far')!;
    const handContours=carriers.map(c=>c.handPolygon.map(q=>actual(poseIndex===0?c.handSurface.node:c.handPaint,q)));
    const contourContact=polygonContact(handContours[0]!,handContours[1]!);
    const current=svg.getCTM(),shirtCtm=shirt.node.getCTM();if(!current||!shirtCtm)throw new Error('Arm pose torso audit missing matrix');
    const torsoMapping=current.inverse().multiply(shirtCtm);
    const torsoDrift=torsoProbes.map(q=>distance(q,map(map(q,sourceTorsoMapping.inverse()),torsoMapping)));
    const nearCarrier=carriers.find(c=>c.side==='near')!,joinProbe=poseIndex===3?p(323.4,221.4):poseIndex===4?p(313.8,211.6):null;
    const pathContains=(el:SVGPathElement,q:ArmaturePoint)=>{const detached=node('path',{d:el.getAttribute('d')!});return detached.isPointInFill(new DOMPoint(q.x,q.y));};
    const whiteProbe=poseIndex===3?p(319,222):poseIndex===4?p(310,214):null;
    const jointCoverageProbes=joinProbe?[{canonical:joinProbe,rawBridgeContains:pathContains(nearCarrier.cap,joinProbe),innerBandContains:pathContains(nearCarrier.innerBand,joinProbe),upperSource:map(joinProbe,rootMatrix(nearCarrier.upperPaint.querySelector<SVGPathElement>('path')!).inverse()),foreSource:map(joinProbe,rootMatrix(nearCarrier.foreSkin).inverse()),naturalConcavity:{canonical:whiteProbe!,rawBridgeContains:pathContains(nearCarrier.cap,whiteProbe!),underpaintContains:pathContains(nearCarrier.innerWedge,whiteProbe!)&&pathContains(nearCarrier.innerBand,whiteProbe!)}}]:[];
    const bridgeShapeMetrics=poseIndex===0?[]:carriers.map(c=>{
      const coordinates=[...c.cap.getAttribute('d')!.matchAll(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)].map(v=>finite(Number(v[0])));
      if(coordinates.length!==16)throw new Error('Arm pose bridge command contract changed');
      const fi=p(coordinates[8]!,coordinates[9]!),fic=p(coordinates[10]!,coordinates[11]!),uic=p(coordinates[12]!,coordinates[13]!),ui=p(coordinates[14]!,coordinates[15]!);
      const innerChord=distance(fi,ui),foreInnerHandle=distance(fi,fic),upperInnerHandle=distance(ui,uic);
      return{side:c.side,innerChord,foreInnerHandle,upperInnerHandle,maxHandleChordRatio:Math.max(foreInnerHandle,upperInnerHandle)/innerChord};
    });
    const headAttributesPreserved=headSnapshots.every(({el,attributes})=>JSON.stringify([...el.attributes].filter(a=>a.name!=='id'&&!a.name.startsWith('data-')).map(a=>[a.name,a.value]))===JSON.stringify(attributes));
    const headMatrixResidual=Math.max(...headSnapshots.map(({el,matrix})=>{const now=rootMatrix(el);return Math.max(...['a','b','c','d','e','f'].map(key=>Math.abs(now[key as keyof DOMMatrix]as number-(matrix[key as keyof DOMMatrix]as number))));}));
    return{poseIndex,joints,limbs,jointCoverageProbes,bridgeShapeMetrics,contact:{distance:distance(near.fingertip,far.fingertip),targetResidualNear:distance(near.fingertip,near.contactTarget),targetResidualFar:distance(far.fingertip,far.contactTarget),target,nearestContourGap:contourContact.gap,edgeIntersections:contourContact.edgeIntersections,containedVertices:contourContact.containedVertices,contactPoints:[contourContact.nearPoint,contourContact.farPoint],contourSampleCount:handContours.reduce((sum,points)=>sum+points.length,0)},
      torso:{sourceDUnchanged:shirt.node.getAttribute('d')===shirt.sourceD,probeMaxDrift:Math.max(...torsoDrift),probeCount:torsoProbes.length},
      source:{pathDataPreserved:snapshots.every(s=>s.surface.node.getAttribute('d')===s.d),sourceSurfaceCount:snapshots.length},
      fixedHead:{pathCount:headSnapshots.length,paintAttributesPreserved:headAttributesPreserved,maxMatrixResidual:headMatrixResidual},
      construction:{rigidSourceUnits:8,elbowCoverageBridges:2,innerElbowUnderpaints:2,sleeveClipConsumers:2,skinSplitClipConsumers:4,sourceHandClipConsumers:2,restUsesOriginalLayers:true,
        assembledZeroAngleEquivalenceValidated:false,largeAngleCoverageValidated:false,
        limitations:['Localized elbow bridges interpolate actual transformed source cut-edge widths; their posed silhouettes need visual review.','Two localized matching-coral shoulder socket patches connect source sleeve roots to the fixed torso seam; the exact lower torso arc remains unchanged.','Source hand and forearm remain one rigid unit; no independent wrist turn or interlocking.','Hand contact uses sampled clipped source contours at approximately .5 source-unit spacing; raster edge contact needs visual verification.','Exact rest is an original-layer switch; static results do not establish motion continuity.']},
      clipOwners,
      clipRegistration:{unitConsumerCount:clipOwners.length,sourceConsumerCount:sourceClipRefs.length,farConcealConsumerCount:farConcealConsumers.length,sourceClipsValid,concealClipsValid,coverageClipConsumerCount:coverageClipConsumers.length,coverageClipsValid,activeMaskConsumerCount:poseIndex===0?0:masks.length,masksValid},
      exposureRequirements:rig.exposureRequirements};
  }
  svg.setAttribute('data-work-arm-poses','static-source-units');applyPose(0);
  return{applyPose,audit};
}
