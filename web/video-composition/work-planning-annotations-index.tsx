import React, {useState} from 'react';
import {AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import {LibrarySvgArtwork, type LibrarySvgRig} from './directed/LibrarySvgArtwork';
import {prepareWorkPlanningArmature, type WorkPlanningArmature, type ArmaturePoint, type ArmatureRegion, type ArmatureSurface} from './directed/WorkPlanningArmature';
import {prepareWorkPlanningArmatureRevision} from './directed/WorkPlanningArmatureRevision';
import candidate from '../public/studies/work-planning/straight-sleeve-candidate.json';

export interface WorkPlanningAnnotationsProps extends Record<string, unknown> {
  panel: 'regions' | 'boundaries' | 'coverage';
  baseline: boolean; showAnnotations: boolean; qa: boolean;
}
type Audit = ReturnType<WorkPlanningArmature['audit']>;
type Trace = {id: string; d: string; color: string; width: number; dash?: string; opacity?: number; halo?: boolean};
type Diagram = {audit: Audit; traces: Trace[]; counts: Record<string,number>};
const viewBox = '153 228 176 103';
const colors: Record<ArmatureRegion,string> = {
  torso:'#596979', 'near-sleeve':'#006f86','near-upper-arm':'#1173bd','near-forearm':'#058d99','near-hand':'#178258',
  'far-sleeve':'#7946ad','far-upper-arm':'#995cb1','far-forearm':'#b76ca6','far-hand':'#bb6079',
};
const titles = {
  regions:['01 / Surface ownership','Connected regions on the original artwork'],
  boundaries:['02 / Boundaries & clips','Cuff ink and the original source joins'],
  coverage:['03 / Coverage still to solve','Six checks before larger arm poses'],
};
const regionNames = ['sleeve','upper-arm','forearm','hand'] as const;
const mapPoint = (p:ArmaturePoint,m:DOMMatrix) => new DOMPoint(p.x,p.y).matrixTransform(m);
const domMatrix = (svg:SVGSVGElement,node:SVGGraphicsElement) => {
  const root=svg.getCTM(),child=node.getCTM();if(!root||!child) throw new Error('Annotation missing mounted source matrix');
  return root.inverse().multiply(child);
};
const fillContains = (node:SVGGeometryElement,p:ArmaturePoint,inverse:DOMMatrix) => node.isPointInFill(mapPoint(p,inverse));
const traceSegments = (points:ArmaturePoint[],include:(p:ArmaturePoint,i:number)=>boolean) => {
  let active=false;return points.map((p,i)=>{if(!include(p,i)){active=false;return '';}
    const command=active?'L':'M';active=true;return `${command}${p.x.toFixed(4)},${p.y.toFixed(4)}`;}).join('');
};

function buildDiagram(svg:SVGSVGElement,rig:WorkPlanningArmature,panel:WorkPlanningAnnotationsProps['panel']):Diagram {
  const audit=rig.audit(),traces:Trace[]=[];
  const clipById=new Map(rig.clipBindings.map(c=>[c.id,c]));
  const inverseBySurface=new Map(rig.surfaces.map(s=>[s.id,domMatrix(svg,s.node).inverse()]));
  const ordered=[...svg.querySelectorAll<SVGPathElement>('[id*="Character"] path')];
  // Source source-order is retained. Only opaque later surfaces can hide a
  // source outline; details and the original translucent fabric shadow do not.
  const sourceClipStack=(node:SVGGraphicsElement)=> {
    const stack:{shape:SVGGeometryElement;inverse:DOMMatrix}[]=[];
    let ancestor:Element|null=node;
    while(ancestor && ancestor!==svg) {
      const id=ancestor.getAttribute('clip-path')?.match(/^url\(#([^)]*)\)$/)?.[1];
      if(id){const clip=svg.querySelector<SVGClipPathElement>(`[id='${id}']`);
        if(!clip || clip.children.length!==1)throw new Error('Annotation unsupported actual clip stack');
        stack.push({shape:clip.firstElementChild as SVGGeometryElement,inverse:domMatrix(svg,ancestor as SVGGraphicsElement).inverse()});}
      ancestor=ancestor.parentElement;
    }
    return stack;
  };
  const painted=ordered.map(node=> {
    let opacity=1;let ancestor:Element|null=node;
    while(ancestor && ancestor!==svg){opacity*=Number(getComputedStyle(ancestor).opacity);ancestor=ancestor.parentElement;}
    return {node,inverse:domMatrix(svg,node).inverse(),clips:sourceClipStack(node),opaque:opacity>.999 && getComputedStyle(node).fill!=='none'};
  });
  const visible=(surface:ArmatureSurface,p:ArmaturePoint,occlusion=true)=> {
    for(const id of surface.clipBindingIds){const b=clipById.get(id)!;
      const shape=b.clip.firstElementChild as SVGGeometryElement;
      if(!fillContains(shape,p,domMatrix(svg,b.consumer).inverse())) return false;
    }
    if(!occlusion)return true;
    const index=ordered.indexOf(surface.node);
    return !painted.slice(index+1).some(other=>other.opaque && other.clips.every(c=>fillContains(c.shape,p,c.inverse)) && fillContains(other.node,p,other.inverse));
  };
  let contourPoints=0,clipEdgePoints=0,cuffPoints=0;
  const surfacesShown=new Set<string>(),detailsShown=new Set<string>(),regionsShown=new Set<ArmatureRegion>(),clipsShown=new Set<string>(),cuffsShown=new Set<string>();
  if(panel==='regions') {
    const principal=rig.surfaces;
    for(const surface of principal) for(const [ci,contour] of surface.contours.entries()) {
      const memberships=contour.samples.map(sample=>Object.entries(sample.memberships).reduce((best,next)=>next[1]>best[1]?next:best)![0] as ArmatureRegion);
      const points=contour.samples.map(sample=>sample.canonical);
      for(const region of Object.keys(colors) as ArmatureRegion[]){
        const d=traceSegments(points,(p,i)=>{const on=memberships[i]===region && visible(surface,p);if(on)contourPoints++;return on;});
        if(d.includes('L')){
          const detail=surface.role.includes('fabric-mark')||surface.role.includes('fabric-shadow')||surface.role.includes('fabric-crease');
          traces.push({id:`${surface.id}:${ci}:${region}`,d,color:colors[region],width:detail?.2:region==='torso'?.38:.55,opacity:detail?.8:1});
          surfacesShown.add(surface.id);regionsShown.add(region);if(detail)detailsShown.add(surface.id);
        }
      }
    }
  }
  if(panel==='boundaries') {
    for(const surface of rig.surfaces.filter(s=>s.role.includes('cuff-separator'))) for(const [ci,contour] of surface.contours.entries()) {
      const points=contour.samples.map(sample=>sample.canonical),d=traceSegments(points,p=>{const on=visible(surface,p);if(on)cuffPoints++;return on;});
      if(d.includes('L')){traces.push({id:`cuff:${surface.id}:${ci}`,d,color:'#dc740e',width:.65});cuffsShown.add(surface.id);}
    }
    for(const binding of rig.clipBindings){
      const affected=rig.surfaces.filter(s=>binding.affectedSurfaceIds.includes(s.id));
      const underSleeve=binding.sourceClipId==='far-arm-under-sleeve';
      const hand=affected.every(s=>s.role.includes('hand'));
      const mapping=domMatrix(svg,binding.consumer);
      for(const [ci,contour] of binding.contours.entries()) {
        const points=contour.samples.map(sample=>mapPoint(sample.local,mapping));
        const d=traceSegments(points,p=> {
          // Bound real clip contours to their source skin, avoiding enormous
          // rectangular clip extents. The concealed root is deliberately dashed.
          const on=affected.some(surface=>fillContains(surface.node,p,inverseBySurface.get(surface.id)!) && (underSleeve || visible(surface,p,false)));
          if(on)clipEdgePoints++;return on;
        });
        if(d.includes('L')){
          traces.push({id:`${binding.id}:${ci}`,d,color:underSleeve?'#7946ad':hand?'#b14e93':'#0075b4',width:underSleeve?.55:hand?.34:.75,dash:underSleeve?'1.1 .65':hand?'.65 .65':undefined,halo:underSleeve});
          clipsShown.add(binding.id);
        }
      }
    }
  }
  return {audit,traces,counts:{jointControls:audit.joints.length,sourceSurfaces:audit.counts.paintSurfaces,clipConsumers:audit.counts.clipConsumers,
    regionTraces:panel==='regions'?traces.length:0,boundaryTraces:panel==='boundaries'?traces.length:0,coverageCallouts:panel==='coverage'?audit.exposureRequirements.length:0,
    contourPoints,clipEdgePoints,cuffPoints,clipConsumersShown:clipsShown.size,cuffSurfacesShown:cuffsShown.size,sourceSurfacesShown:surfacesShown.size,distinctRegionsShown:regionsShown.size,fabricDetailSurfacesShown:detailsShown.size}};
}

const Row:React.FC<{color:string;label:string;detail?:string;dashed?:boolean}>=({color,label,detail,dashed})=><div style={{display:'flex',gap:12,marginBottom:18,alignItems:'flex-start'}}>
  <span style={{width:25,marginTop:9,borderTop:`4px ${dashed?'dashed':'solid'} ${color}`,flexShrink:0}}/>
  <div><div style={{fontSize:20,fontWeight:700,color:'#25323c'}}>{label}</div>{detail&&<div style={{fontSize:17,lineHeight:1.45,color:'#566674',marginTop:4}}>{detail}</div>}</div>
</div>;
const CoverageLabels:React.FC<{audit:Audit}>=({audit})=>{
  const positions:Record<string,{x:number;y:number}>={
    'far:shoulder':{x:221,y:231},'near:shoulder':{x:312,y:231},'far:elbow':{x:250,y:289},
    'near:elbow':{x:316,y:306},'far:wrist':{x:177,y:312},'near:wrist':{x:247,y:316},
  };
  return <>{audit.joints.map(j=>{const q=positions[j.id]!,label=`${j.side==='far'?'F':'N'}${j.kind[0]!.toUpperCase()}`;
    return <g key={j.id}>
      <line x1={j.actual.x} y1={j.actual.y} x2={q.x} y2={q.y} stroke="white" strokeWidth={1.2}/>
      <line x1={j.actual.x} y1={j.actual.y} x2={q.x} y2={q.y} stroke="#ae620f" strokeWidth={.45} strokeDasharray="1 .6"/>
      <circle cx={j.actual.x} cy={j.actual.y} r={1.3} fill="#ae620f" stroke="white" strokeWidth={.4}/>
      <rect x={q.x-5} y={q.y-2.4} width={10} height={4.8} rx={1} fill="white" stroke="#ae620f" strokeWidth={.28}/>
      <text x={q.x} y={q.y+.8} textAnchor="middle" fill="#864600" fontFamily="Arial" fontWeight={700} fontSize={2.6}>{label}</text>
    </g>;
  })}</>;
};

const WorkPlanningAnnotations:React.FC<WorkPlanningAnnotationsProps>=({panel,baseline,showAnnotations,qa})=>{
  const seconds=useCurrentFrame()/useVideoConfig().fps;
  const [diagram,setDiagram]=useState<Diagram|null>(null);
  const prepare=(svg:SVGSVGElement):LibrarySvgRig=>{
    for(const child of [...svg.children])if(child.tagName.toLowerCase()!=='defs'&&!['Character','background-simple','Floor'].includes(child.id))child.remove();
    svg.setAttribute('viewBox',viewBox);
    if(baseline)return{apply(){}};
    const rig=prepareWorkPlanningArmatureRevision(svg),data=buildDiagram(svg,rig,panel);setDiagram(data);
    return {apply(time){if(qa)console.log(`ANNOTATIONS_QA:${JSON.stringify({seconds:time,panel,baseline,showAnnotations,armature:rig.audit(),annotationCounts:data.counts})}`);}};
  };
  const show=showAnnotations&&!baseline&&diagram;
  return <AbsoluteFill style={{background:'#f5f7f9',fontFamily:'Arial, sans-serif',color:'#1e2c37'}}>
    <div style={{position:'absolute',left:42,top:31,fontSize:18,fontWeight:700,letterSpacing:1.1,color:'#607080'}}>{titles[panel][0]!.toUpperCase()}</div>
    <div style={{position:'absolute',left:42,top:64,fontSize:38,fontWeight:700,letterSpacing:-.6}}>{titles[panel][1]}</div>
    <div style={{position:'absolute',left:43,top:116,fontSize:20,color:'#596976'}}>Straight far-sleeve revision • torso ownership corrected • no new pose or motion</div>
    <div style={{position:'absolute',left:30,top:170,width:1010,height:627,background:'white',borderRadius:18,overflow:'hidden',border:'1px solid #dde4ea'}}>
      <LibrarySvgArtwork artworkId={`work-annotations-${panel}`} seconds={seconds} prepare={prepare}
        publicPath="studies/work-planning/working-typing-straight-sleeve-no-desk.svg" expectedSha256={candidate.candidateHashes['working-typing-straight-sleeve-no-desk.svg']}/>
      {show&&<svg viewBox={viewBox} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
        {diagram.traces.map(trace=><g key={trace.id} opacity={trace.opacity??1}>
          {trace.halo!==false&&!(panel==='boundaries'&&!trace.id.startsWith('cuff:')&&!trace.halo)&&<path d={trace.d} fill="none" stroke="white" strokeWidth={trace.width+(trace.opacity? .18:.5)} strokeLinejoin="round" strokeLinecap="round"/>}
          <path d={trace.d} fill="none" stroke={trace.color} strokeWidth={trace.width} strokeDasharray={trace.dash} strokeLinejoin="round" strokeLinecap="round"/>
        </g>)}
        {panel==='coverage'&&<CoverageLabels audit={diagram.audit}/>}
        {panel==='regions'&&<g><line x1={265} y1={259} x2={261} y2={248} stroke="white" strokeWidth={1}/><line x1={265} y1={259} x2={261} y2={248} stroke={colors.torso} strokeWidth={.4}/><rect x={248} y={244} width={26} height={6} rx={1} fill="white" stroke={colors.torso} strokeWidth={.2}/><text x={261} y={248.1} fontFamily="Arial" textAnchor="middle" fill={colors.torso} fontWeight={700} fontSize={2.8}>Fixed torso</text></g>}
      </svg>}
    </div>
    <div style={{position:'absolute',left:1068,top:177,width:294}}>
      {panel==='regions'?<>
        <div style={{display:'flex',gap:38,marginBottom:22}}>{(['near','far'] as const).map(side=><div key={side} style={{width:130}}>
          <div style={{fontSize:24,fontWeight:700,color:colors[`${side}-sleeve`],marginBottom:21}}>{side==='near'?'NEAR':'FAR'}</div>
          {regionNames.map(name=><Row key={name} color={colors[`${side}-${name}`]} label={name==='upper-arm'?'Upper arm':name[0]!.toUpperCase()+name.slice(1)}/>)}</div>)}</div>
        <Row color={colors.torso} label="Fixed torso" detail="One stationary shirt edge owner."/>
        <div style={{fontSize:19,lineHeight:1.5,padding:18,background:'#edf1f6',borderRadius:12}}>Colored outlines show logical ownership on shared source contours. They are not physical cuts.</div>
        <div style={{fontSize:17,lineHeight:1.45,color:'#586875',marginTop:22}}>Original sleeve marks, cuff ink and fabric shadow remain with their owning regions.</div>
      </>:panel==='boundaries'?<>
        <Row color="#dc740e" label="Cuff ink" detail="Actual source separators; both remain on their sleeves."/>
        <Row color="#0075b4" label="Arm-side cut" detail="Original source arm clip at the wrist."/>
        <Row color="#b14e93" dashed label="Mirrored hand cut" detail="Dashed magenta over blue shows the overlapping source wrist cuts."/>
        <Row color="#7946ad" dashed label="Concealed arm root" detail="Far-arm clip underneath the shirt, shown only over its source skin."/>
        <div style={{fontSize:18,lineHeight:1.5,padding:18,background:'#edf1f6',borderRadius:12}}>Five clip consumers use three shared source definitions. Each consumer has its own coordinate mapping.</div>
        <div style={{fontSize:17,lineHeight:1.45,color:'#586875',marginTop:20}}>Far arm paints behind the shirt; near arm paints in front. The original drawing order is intact.</div>
      </>:<>
        <div style={{fontSize:18,fontWeight:700,color:'#986019',marginBottom:17}}>PLANNED • NOT RECONSTRUCTED</div>
        {['Shoulder / underarm','Elbow contour','Wrist seam'].map((title,i)=><div key={title} style={{marginBottom:24,paddingBottom:20,borderBottom:'1px solid #dce3e9'}}>
          <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>{title}</div>
          <div style={{fontSize:16,fontWeight:700,color:'#ad690f',marginBottom:7}}>{i===0?'FS + NS':i===1?'FE + NE':'FW + NW'}</div>
          <div style={{fontSize:17,lineHeight:1.45,color:'#596976'}}>{i===0?'Check newly exposed skin and inside sleeve where garment meets the fixed torso.':i===1?'Check inner and outer skin coverage when the bent source elbow opens.':'Check full wrist width and clip alignment before independent hand rotation.'}</div>
        </div>)}
        <div style={{fontSize:17,lineHeight:1.4,color:'#596976'}}>No new patch or pose is shown. These six source-joint checks remain open for larger poses.</div>
      </>}
    </div>
    <div style={{position:'absolute',left:43,bottom:38,fontSize:18,color:'#607080'}}>{panel==='regions'?'Near / far describe painter depth. All colors are annotation overlays.':panel==='boundaries'?'Clip traces are bounded to source skin; the original masks are not changed.':'FS / NS: shoulder     FE / NE: elbow     FW / NW: wrist'}</div>
  </AbsoluteFill>;
};
registerRoot(()=><Composition id="WorkPlanningAnnotations" component={WorkPlanningAnnotations} width={1400} height={900} fps={30} durationInFrames={91}
  defaultProps={{panel:'regions',baseline:false,showAnnotations:true,qa:false}}/>);
