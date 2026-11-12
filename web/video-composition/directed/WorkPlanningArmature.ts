/** Static prerequisite for larger work-arm poses. These are logical regions on
 * retained source contours, not independently separated renderable limb layers.
 * Preparation changes only data-* instrumentation. No pose or clock API exists. */
export type ArmaturePoint = {x: number; y: number};
export type ArmatureSide = "near" | "far";
export type ArmatureJointKind = "shoulder" | "elbow" | "wrist";
export type ArmatureRegion = "torso" | "near-sleeve" | "near-upper-arm" | "near-forearm" | "near-hand" |
  "far-sleeve" | "far-upper-arm" | "far-forearm" | "far-hand";
export type ArmatureMatrix = readonly [number, number, number, number, number, number];
export type ArmatureMemberships = Record<ArmatureRegion, number>;
export interface ArmatureSample {
  local: ArmaturePoint;
  canonical: ArmaturePoint;
  memberships: ArmatureMemberships;
}
export interface ArmatureContour {sourceD: string; closed: boolean; length: number; samples: ArmatureSample[]}
export interface ArmatureJoint {
  id: string; side: ArmatureSide; kind: ArmatureJointKind; parentId: string;
  canonical: ArmaturePoint; parentLocalOffset: ArmaturePoint;
  /** Real source group used to map the canonical joint through the final DOM. */
  carrier: SVGGElement; carrierLocal: ArmaturePoint;
}
export interface ArmaturePart {
  id: ArmatureRegion; side: ArmatureSide; parentId: ArmatureRegion;
  proximalJointId: string; distalJointId: string | null; sourceSurfaceIds: string[];
  representation: "logical-region-on-retained-contour";
}
export interface ArmatureSurface {
  id: string; painterId: string; role: string; node: SVGPathElement;
  sourceD: string; canonicalMatrix: ArmatureMatrix; inverseCanonicalMatrix: ArmatureMatrix;
  contours: ArmatureContour[]; clipBindingIds: string[];
}
export interface ArmatureClipBinding {
  id: string; consumer: SVGGraphicsElement; clip: SVGClipPathElement;
  consumerPainterId: string; sourceClipId: string;
  canonicalMatrix: ArmatureMatrix; inverseCanonicalMatrix: ArmatureMatrix;
  contours: ArmatureContour[]; affectedSurfaceIds: string[];
  ownership: "consumer-space-logical-regions";
}
export interface ArmatureExposureRequirement {
  id: string; owner: string; receiver: string; trigger: string;
  restCoverage: string; reconstructionNeeded: string; status: "unresolved-for-larger-poses";
}
export interface ArmatureAudit {
  kind: "logical-source-regions";
  capabilities: {staticRestBound: true; visibleSegmentsSeparated: false; largeAngleCoverageValidated: false; poseEvaluationAvailable: false};
  joints: {id: string; side: ArmatureSide; kind: ArmatureJointKind; parentId: string;
    canonical: ArmaturePoint; actual: ArmaturePoint; parentLocalOffset: ArmaturePoint; mappingResidual: number}[];
  parts: ArmaturePart[];
  counts: {joints: number; parts: number; paintSurfaces: number; clipConsumers: number; contourSamples: number; stationaryPaths: number};
  sourcePreserved: {paintAttributes: boolean; painterOrder: boolean; transforms: boolean; clipReferences: boolean};
  regionWeights: {region: ArmatureRegion; min: number; max: number; sampleCount: number; nonzeroSampleCount: number}[];
  membershipMaxResidual: number;
  surfaces: {id: string; painterId: string; role: string; contourCount: number; sampleCount: number;
    canonicalMatrix: ArmatureMatrix; inverseCanonicalMatrix: ArmatureMatrix; clipBindingIds: string[]}[];
  clips: {id: string; consumerPainterId: string; sourceClipId: string; liveClipId: string;
    affectedSurfaceIds: string[]; sampleCount: number; canonicalMatrix: ArmatureMatrix; inverseCanonicalMatrix: ArmatureMatrix}[];
  exposureRequirements: ArmatureExposureRequirement[];
}
export interface WorkPlanningArmature {
  kind: "logical-source-regions";
  bindings: {joints: ArmatureJoint[]; parts: ArmaturePart[]};
  surfaces: ArmatureSurface[]; clipBindings: ArmatureClipBinding[];
  exposureRequirements: ArmatureExposureRequirement[];
  audit(): ArmatureAudit;
}

const regions: ArmatureRegion[] = ["torso", "near-sleeve", "near-upper-arm", "near-forearm", "near-hand", "far-sleeve", "far-upper-arm", "far-forearm", "far-hand"];
const registrations: Record<ArmatureSide, Record<ArmatureJointKind, ArmaturePoint>> = {
  near: {shoulder: {x: 291, y: 245}, elbow: {x: 296, y: 293}, wrist: {x: 244, y: 294}},
  far: {shoulder: {x: 243.61, y: 243.46}, elbow: {x: 237.25, y: 284.7}, wrist: {x: 190.45, y: 285.6}},
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {const t = clamp(n); return t*t*t*(t*(t*6-15)+10);};
const valid = (n: number, label: string) => {
  if (!Number.isFinite(n)) throw new Error(`Work armature nonfinite ${label}`);
  return n;
};
const point = (p: ArmaturePoint, matrix: DOMMatrix): ArmaturePoint => {
  const q = new DOMPoint(p.x, p.y).matrixTransform(matrix);
  return {x: valid(q.x, "canonical x"), y: valid(q.y, "canonical y")};
};
const tuple = (matrix: DOMMatrix): ArmatureMatrix => [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].map(n => valid(n, "matrix")) as unknown as ArmatureMatrix;
const matrix = (svg: SVGSVGElement, owner: SVGGraphicsElement): DOMMatrix => {
  const root = svg.getCTM(), local = owner.getCTM();
  if (!root || !local) throw new Error("Work armature requires mounted source SVG");
  const result = root.inverse().multiply(local);
  if (Math.abs(result.a*result.d-result.b*result.c) < 1e-12) throw new Error("Work armature singular source mapping");
  tuple(result); return result;
};
const requireNode = <T extends SVGElement>(root: Element, selector: string, label: string): T => {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Work armature missing ${label}`);
  return node;
};
const emptyWeights = (): ArmatureMemberships => Object.fromEntries(regions.map(region => [region, 0])) as ArmatureMemberships;
type WeightOwner = "fabric" | "near-cuff" | "far-cuff" | "near-skin" | "far-skin" | "near-hand" | "far-hand";
function memberships(p: ArmaturePoint, owner: WeightOwner): ArmatureMemberships {
  const weights = emptyWeights();
  if (owner === "fabric") {
    const bottom = 1-ease((p.y-280)/14);
    const far = (1-ease((p.x-245)/10))*ease((p.y-registrations.far.shoulder.y)/(270-registrations.far.shoulder.y))*bottom;
    const near = ease((p.x-278)/6)*ease((p.y-registrations.near.shoulder.y)/(270-registrations.near.shoulder.y))*bottom;
    weights["far-sleeve"] = far; weights["near-sleeve"] = near; weights.torso = 1-far-near;
  } else {
    const side: ArmatureSide = owner.startsWith("near") ? "near" : "far";
    if (owner.endsWith("hand")) weights[`${side}-hand`] = 1;
    else if (owner.endsWith("cuff")) weights[`${side}-sleeve`] = 1;
    else {
      // Inferred blend region on the original curved elbow, not a path cut.
      const elbow = registrations[side].elbow, scale = side === "far" ? .9 : 1;
      const forearm = ease((elbow.x-p.x)/(18*scale))*ease((p.y-(elbow.y-20*scale))/(11*scale));
      weights[`${side}-forearm`] = forearm; weights[`${side}-upper-arm`] = 1-forearm;
    }
  }
  const sum = Object.values(weights).reduce((a,b) => a+b,0);
  if (!Number.isFinite(sum) || Math.abs(sum-1)>1e-9 || Object.values(weights).some(n => !Number.isFinite(n) || n < -1e-9 || n > 1+1e-9))
    throw new Error("Work armature invalid logical membership coverage");
  return weights;
}
/** Reads detached path geometry. No source d is temporarily rewritten. Source
 * M subpaths remain distinct; these samples are binding data, not render paths. */
function contours(d: string, mapping: DOMMatrix, owner: WeightOwner): ArmatureContour[] {
  if (/m/.test(d)) throw new Error("Work armature relative moveto subpaths need explicit normalization");
  const subpaths = d.match(/M[^M]*/g);
  if (!subpaths?.length) throw new Error("Work armature empty source contour");
  return subpaths.map(sourceD => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", sourceD);
    const length = valid(path.getTotalLength(), "source contour length");
    if (length <= 0) throw new Error("Work armature zero contour length");
    const count = Math.max(24, Math.ceil(length/.25));
    const samples = Array.from({length: count+1}, (_,i) => {
      const sampled = path.getPointAtLength(length*i/count);
      const local = {x: valid(sampled.x,"source sample x"), y: valid(sampled.y,"source sample y")};
      const canonical = point(local,mapping);
      return {local,canonical,memberships:memberships(canonical,owner)};
    });
    return {sourceD,closed:/[Zz]\s*$/.test(sourceD),length,samples};
  });
}
const exposureRequirements: ArmatureExposureRequirement[] = [
  {id:"far-shoulder-underarm",owner:"far-sleeve",receiver:"torso",trigger:"Far sleeve rotates away from its fixed shoulder/armpit boundary.",restCoverage:"Shared coral shirt covers the copied arm root; far-arm-under-sleeve clip conceals unfinished skin.",reconstructionNeeded:"Determine the newly visible underarm skin and inside sleeve from the first posed silhouette; preserve one stationary torso-edge owner.",status:"unresolved-for-larger-poses"},
  {id:"near-shoulder-underarm",owner:"near-sleeve",receiver:"torso",trigger:"Near sleeve opens beside the stationary neck/hair/torso.",restCoverage:"Near sleeve and torso are one source path; original fabric shadow sits above skin.",reconstructionNeeded:"Separate the permitted sleeve contour and determine interior garment/underarm coverage before a large shoulder turn; original shadow must follow its receiving fabric.",status:"unresolved-for-larger-poses"},
  ...(["near","far"] as const).map(side => ({id:`${side}-elbow-coverage`,owner:`${side}-upper-arm`,receiver:`${side}-forearm`,trigger:"Source bent elbow straightens or changes bend during an overhead route.",restCoverage:"Upper arm and forearm are one continuous opaque source skin contour; regional binding introduces no rendered cut.",reconstructionNeeded:"Inspect inner/outer elbow silhouette at intermediate poses; supply a localized continuous bridge only where source coverage fails. Large-angle regional deformation remains unimplemented.",status:"unresolved-for-larger-poses" as const})),
  ...(["near","far"] as const).map(side => ({id:`${side}-wrist-coverage`,owner:`${side}-forearm`,receiver:`${side}-hand`,trigger:"Hand rotates independently of its forearm or palm orientation changes.",restCoverage:`Mirrored source hand meets arm through shared clip definitions, with original local x244–244.08 overlap (${side === "far" ? ".072" : ".08"} canonical units).`,reconstructionNeeded:"Keep cut-mask registration and full wrist width through the new pose; determine any newly exposed wrist surface before independent rotation.",status:"unresolved-for-larger-poses" as const})),
];

export function prepareWorkPlanningArmature(svg: SVGSVGElement): WorkPlanningArmature {
  if (svg.hasAttribute("data-work-armature")) throw new Error("Work armature already prepared; do not bind twice");
  const character = requireNode<SVGGElement>(svg,"[id='Character']","Character");
  const near = requireNode<SVGGElement>(character,"[id='source-near-arm-palms-down']","near arm");
  const far = requireNode<SVGGElement>(character,"[id='source-copy-far-arm']","far arm");
  const shirt = far.nextElementSibling as SVGPathElement, crease = shirt?.nextElementSibling as SVGPathElement, nearCuff = crease?.nextElementSibling as SVGPathElement;
  const farCuff = requireNode<SVGPathElement>(character,"[id='far-sleeve-cuff-separator']","far cuff");
  if (![98,99].includes(character.children.length) || !shirt?.getAttribute("d")?.startsWith("M303,270.66") || !crease?.getAttribute("d")?.startsWith("M280.37,250.53") || !nearCuff?.getAttribute("d")?.startsWith("M303.31,269.72"))
    throw new Error("Work armature approved source hierarchy changed");

  const sourceNodes = [svg,...svg.querySelectorAll<SVGElement>("*")];
  // Namespacing after prepare legitimately changes IDs/clip URLs; compare live
  // node references for clips, and all remaining original paint attributes.
  // Root viewport/style/role are loader/preview controls, not source paint;
  // LibrarySvgArtwork sets them after prepare and a closeup changes viewBox.
  const attrs = (node: SVGElement) => Object.fromEntries([...node.attributes].filter(a => a.name!=="id" && a.name!=="clip-path" && !a.name.startsWith("data-") && !(node===svg && ["style","role","aria-label","width","height","viewBox","preserveAspectRatio"].includes(a.name))).map(a => [a.name,a.value]));
  const snapshots = sourceNodes.map(node => ({node,attrs:attrs(node),parent:node.parentElement,children:[...node.children],transform:node.getAttribute("transform")}));
  const painterId = (node: Element): string => {
    const address: number[] = []; let cursor: Element|null = node;
    while (cursor && cursor!==character) {
      const parent: Element|null = cursor.parentElement;
      if (!parent) throw new Error("Work armature source consumer is outside Character");
      address.unshift([...parent.children].indexOf(cursor));cursor=parent;
    }
    if (cursor!==character) throw new Error("Work armature painter address missing Character root");
    return `Character/${address.join("/")}`;
  };
  const surfaces: ArmatureSurface[] = [],surfaceOwners = new Map<SVGPathElement,WeightOwner>();
  const register = (node: SVGPathElement,owner: WeightOwner,role: string) => {
    if (surfaceOwners.has(node)) throw new Error("Work armature duplicate surface binding");
    const d = node.getAttribute("d"); if (!d) throw new Error(`Work armature ${role} missing source d`);
    const mapping = matrix(svg,node),id = `surface:${painterId(node)}`;
    surfaces.push({id,painterId:painterId(node),role,node,sourceD:d,canonicalMatrix:tuple(mapping),inverseCanonicalMatrix:tuple(mapping.inverse()),contours:contours(d,mapping,owner),clipBindingIds:[]});
    surfaceOwners.set(node,owner);return id;
  };
  register(shirt,"fabric","shared-shirt-sleeves-torso"); register(crease,"fabric","near-fabric-crease");
  register(nearCuff,"near-cuff","near-cuff-separator"); register(farCuff,"far-cuff","far-cuff-separator");
  for (const side of ["near","far"] as const) {
    const group = side==="near"?near:far,skin = [...group.querySelectorAll<SVGPathElement>("path")];
    if (skin.length!==2 || skin[0]?.parentNode!==group || skin[1]?.parentNode?.parentNode!==group)
      throw new Error("Work armature skin/palm hierarchy changed");
    register(skin[0],`${side}-skin`,`${side}-shared-upperarm-forearm`);
    register(skin[1],`${side}-hand`,`${side}-mirrored-source-hand`);
  }
  const children = [...character.children],start = children.indexOf(near)+1,end = children.findIndex(n => n.getAttribute("d")?.startsWith("M299.93,315.12"));
  if (end<start) throw new Error("Work armature garment detail range changed");
  for (const node of children.slice(start,end)) {
    if (node.getAttribute("d")?.startsWith("M267.7,203")) continue;
    if (node.tagName.toLowerCase()==="path") register(node as SVGPathElement,"fabric","source-fabric-mark-or-crease");
    else for (const path of node.querySelectorAll<SVGPathElement>("path")) register(path,"fabric","original-fabric-shadow");
  }
  // Verified by source inspection: 37 visible paths, not 42 paint paths.
  // Five clip consumers complete the 42 source surfaces in the small proof.
  if (surfaces.length!==37) throw new Error(`Work armature paint coverage changed (${surfaces.length})`);
  const clipBindings: ArmatureClipBinding[] = [];
  for (const group of [near,far]) {
    for (const consumer of [group,...group.querySelectorAll<SVGGraphicsElement>("[clip-path]")]) {
      const ref = consumer.getAttribute("clip-path"); if (!ref) continue;
      const sourceClipId = ref.match(/^url\(#([^)]*)\)$/)?.[1];
      if (!sourceClipId) throw new Error("Work armature unsupported clip URL");
      const clip = requireNode<SVGClipPathElement>(svg,`[id='${sourceClipId}']`,"consumer clip");
      if (clip.getAttribute("clipPathUnits")!=="userSpaceOnUse" || clip.children.length!==1) throw new Error("Work armature clip coordinate contract changed");
      const shape = clip.firstElementChild!,mapping = matrix(svg,consumer);
      let d: string;
      if (shape.tagName.toLowerCase()==="path") d=shape.getAttribute("d")!;
      else if (shape.tagName.toLowerCase()==="rect") {
        const x=Number(shape.getAttribute("x")),y=Number(shape.getAttribute("y")),w=Number(shape.getAttribute("width")),h=Number(shape.getAttribute("height"));
        if (![x,y,w,h].every(Number.isFinite)) throw new Error("Work armature invalid source clip rectangle");
        d=`M${x} ${y}H${x+w}V${y+h}H${x}Z`;
      } else throw new Error("Work armature unsupported source clip shape");
      const affected = surfaces.filter(surface => surface.node===consumer || consumer.contains(surface.node));
      if (!affected.length) throw new Error("Work armature clip has no source surface owner");
      const owner:WeightOwner = surfaceOwners.get(consumer as SVGPathElement) ?? "far-skin";
      const id=`clip:${painterId(consumer)}`;
      const binding = {id,consumer,clip,consumerPainterId:painterId(consumer),sourceClipId,canonicalMatrix:tuple(mapping),inverseCanonicalMatrix:tuple(mapping.inverse()),contours:contours(d,mapping,owner),affectedSurfaceIds:affected.map(s => s.id),ownership:"consumer-space-logical-regions" as const};
      clipBindings.push(binding);affected.forEach(surface => surface.clipBindingIds.push(id));
    }
  }
  if (clipBindings.length!==5) throw new Error("Work armature missing clip consumer coverage");
  const joints: ArmatureJoint[] = [];
  for (const side of ["near","far"] as const) {
    const carrier = side==="near"?near:far, mapping = matrix(svg,carrier);
    for (const kind of ["shoulder","elbow","wrist"] as const) {
      const canonical = {...registrations[side][kind]},parentKind = kind==="elbow"?"shoulder":kind==="wrist"?"elbow":null;
      const parent = parentKind?registrations[side][parentKind]:{x:0,y:0};
      joints.push({id:`${side}:${kind}`,side,kind,parentId:parentKind?`${side}:${parentKind}`:"torso:source-root",canonical,
        parentLocalOffset:{x:canonical.x-parent.x,y:canonical.y-parent.y},carrier,carrierLocal:point(canonical,mapping.inverse())});
    }
  }
  const parts: ArmaturePart[] = [];
  for (const side of ["near","far"] as const) {
    for (const name of ["sleeve","upper-arm","forearm","hand"] as const) {
      const id:ArmatureRegion = `${side}-${name}`;
      const parentId:ArmatureRegion = name==="sleeve"?"torso":name==="upper-arm"?`${side}-sleeve`:name==="forearm"?`${side}-upper-arm`:`${side}-forearm`;
      const proximal = name==="forearm"?"elbow":name==="hand"?"wrist":"shoulder",distal = name==="forearm"?"wrist":name==="hand"?null:"elbow";
      const sourceSurfaceIds = surfaces.filter(surface => surface.contours.some(c => c.samples.some(s => s.memberships[id]>1e-9))).map(surface => surface.id);
      if (!sourceSurfaceIds.length) throw new Error(`Work armature region ${id} is unbound`);
      parts.push({id,side,parentId,proximalJointId:`${side}:${proximal}`,distalJointId:distal?`${side}:${distal}`:null,sourceSurfaceIds,representation:"logical-region-on-retained-contour"});
    }
  }
  // These additions never change paint, ancestry, source transforms or clip refs.
  surfaces.forEach(surface => surface.node.setAttribute("data-work-armature-surface",surface.id));
  svg.setAttribute("data-work-armature","logical-source-regions");
  const audit = (): ArmatureAudit => {
    const sameAttrs = snapshots.every(s => JSON.stringify(attrs(s.node))===JSON.stringify(s.attrs));
    const painterOrder = snapshots.every(s => s.node.parentElement===s.parent && s.children.length===s.node.children.length && s.children.every((child,i) => s.node.children[i]===child));
    const transforms = snapshots.every(s => s.node.getAttribute("transform")===s.transform);
    const clipReferences = clipBindings.every(binding => binding.consumer.getAttribute("clip-path")===`url(#${binding.clip.id})`);
    if (!sameAttrs || !painterOrder || !transforms || !clipReferences) throw new Error("Work armature preparation changed source paint/ordering/transform/clip ownership");
    const actualJoints = joints.map(joint => {
      const actual = point(joint.carrierLocal,matrix(svg,joint.carrier));
      const mappingResidual = Math.hypot(actual.x-joint.canonical.x,actual.y-joint.canonical.y);
      if (!Number.isFinite(mappingResidual) || mappingResidual>1e-6) throw new Error("Work armature source joint registration drift");
      return {id:joint.id,side:joint.side,kind:joint.kind,parentId:joint.parentId,canonical:joint.canonical,actual,parentLocalOffset:joint.parentLocalOffset,mappingResidual};
    });
    const samples = [...surfaces.flatMap(s => s.contours),...clipBindings.flatMap(s => s.contours)].flatMap(c => c.samples);
    if (!samples.length || joints.length!==6 || parts.length!==8) throw new Error("Work armature audit coverage empty/incomplete");
    const regionWeights = regions.map(region => ({region,min:Math.min(...samples.map(s => s.memberships[region])),max:Math.max(...samples.map(s => s.memberships[region])),sampleCount:samples.length,nonzeroSampleCount:samples.filter(s => s.memberships[region]>1e-9).length}));
    const membershipMaxResidual = Math.max(...samples.map(s => Math.abs(Object.values(s.memberships).reduce((a,b) => a+b,0)-1)));
    if (!Number.isFinite(membershipMaxResidual) || membershipMaxResidual>1e-9 || regionWeights.some(w => !Number.isFinite(w.min) || !Number.isFinite(w.max) || w.nonzeroSampleCount===0)) throw new Error("Work armature regional coverage invalid");
    return {kind:"logical-source-regions",capabilities:{staticRestBound:true,visibleSegmentsSeparated:false,largeAngleCoverageValidated:false,poseEvaluationAvailable:false},
      joints:actualJoints,parts,counts:{joints:joints.length,parts:parts.length,paintSurfaces:surfaces.length,clipConsumers:clipBindings.length,contourSamples:samples.length,stationaryPaths:character.querySelectorAll("path").length-surfaces.length},
      sourcePreserved:{paintAttributes:sameAttrs,painterOrder,transforms,clipReferences},regionWeights,membershipMaxResidual,
      surfaces:surfaces.map(s => ({id:s.id,painterId:s.painterId,role:s.role,contourCount:s.contours.length,sampleCount:s.contours.reduce((n,c) => n+c.samples.length,0),canonicalMatrix:s.canonicalMatrix,inverseCanonicalMatrix:s.inverseCanonicalMatrix,clipBindingIds:s.clipBindingIds})),
      clips:clipBindings.map(b => ({id:b.id,consumerPainterId:b.consumerPainterId,sourceClipId:b.sourceClipId,liveClipId:b.clip.id,affectedSurfaceIds:b.affectedSurfaceIds,sampleCount:b.contours.reduce((n,c) => n+c.samples.length,0),canonicalMatrix:b.canonicalMatrix,inverseCanonicalMatrix:b.inverseCanonicalMatrix})),
      exposureRequirements};
  };
  audit();
  return {kind:"logical-source-regions",bindings:{joints,parts},surfaces,clipBindings,exposureRequirements,audit};
}
