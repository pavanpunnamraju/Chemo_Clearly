import {
  prepareWorkPlanningArmature,
  type WorkPlanningArmature,
  type ArmatureAudit,
  type ArmatureMemberships,
  type ArmaturePoint,
} from './WorkPlanningArmature';

export interface WorkPlanningOwnershipChecks {
  technique: 'source-contour-arc-ownership';
  torsoArc: {start: number; end: number; contourLength: number};
  torsoSampleCount: number;
  torsoMaxSleeveWeight: number;
  torsoMinTorsoWeight: number;
  changedSampleCount: number;
  sourceDUnchanged: boolean;
  jointRegistrationsUnchanged: boolean;
  probes: {name: string; canonical: ArmaturePoint; sourceDistance: number;
    priorFarSleeve: number; priorNearSleeve: number; torso: number; farSleeve: number; nearSleeve: number}[];
  detailScope: 'Shared shirt contour corrected; separate fabric-detail memberships retained';
}
export type WorkPlanningArmatureRevisionAudit = ArmatureAudit & {ownershipChecks: WorkPlanningOwnershipChecks};
export interface WorkPlanningArmatureRevision extends Omit<WorkPlanningArmature, 'audit'> {
  audit(): WorkPlanningArmatureRevisionAudit;
}
const finite = (n: number, label: string) => {
  if (!Number.isFinite(n)) throw new Error(`Work armature revision nonfinite ${label}`);
  return n;
};
const prefixLength = (d: string) => {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return finite(path.getTotalLength(), 'source prefix length');
};
const torsoWeights = (weights: ArmatureMemberships): ArmatureMemberships => {
  const result = {...weights};
  for (const key of Object.keys(result) as (keyof ArmatureMemberships)[]) result[key] = key === 'torso' ? 1 : 0;
  return result;
};

/** Revises actual logical bindings, not annotation colors. The fixed torso is
 * the source arc AFTER the far underarm return and BEFORE the near cuff closes.
 * Cuff/sleeve return edges remain sleeve-owned, including those lower than the
 * armpit. No global y cutoff, geometry rewrite or source transform is introduced.
 * This wrapper preserves the approved base preparation module byte-for-byte. */
export function prepareWorkPlanningArmatureRevision(svg: SVGSVGElement): WorkPlanningArmatureRevision {
  const rig = prepareWorkPlanningArmature(svg);
  const shirts = rig.surfaces.filter(s => s.role === 'shared-shirt-sleeves-torso');
  if (shirts.length !== 1) throw new Error('Work armature revision requires one source shirt owner');
  const shirt = shirts[0]!;
  if (shirt.contours.length !== 1) throw new Error('Work armature revision shirt contour contract changed');
  const contour = shirt.contours[0]!,d = shirt.sourceD;
  const trigger = 'c0,4.79,5,7,5,7';
  const startIndex = d.indexOf(trigger);
  if (startIndex < 0 || d.lastIndexOf(trigger) !== startIndex || !/[Zz]\s*$/.test(d))
    throw new Error('Work armature revision fixed source torso branch changed');
  const start = prefixLength(d.slice(0,startIndex));
  const end = prefixLength(d.replace(/[Zz]\s*$/, ''));
  const contourLength = finite(contour.length,'source contour length');
  if (!(start > 0 && end > start && contourLength > end && contour.samples.length > 1))
    throw new Error('Work armature revision torso arc coverage invalid');
  // Base samples were obtained at uniform source-path arc distances. Keep the
  // original sample array/coordinates and correct its memberships on this arc.
  const corrected: {sample: typeof contour.samples[number];distance: number;prior: ArmatureMemberships}[] = [];
  for (const [i,sample] of contour.samples.entries()) {
    const distance = contourLength*i/(contour.samples.length-1);
    if (distance < start || distance > end) continue;
    const prior = {...sample.memberships};
    sample.memberships = torsoWeights(prior);
    corrected.push({sample,distance,prior});
  }
  if (!corrected.length) throw new Error('Work armature revision empty stationary torso ownership coverage');
  // Part bindings derive from the same real memberships the annotation and
  // later pose tooling consume. No stale sleeve surface membership list remains.
  for (const part of rig.bindings.parts) {
    part.sourceSurfaceIds = rig.surfaces.filter(surface => surface.contours.some(c => c.samples.some(s => s.memberships[part.id] > 1e-9))).map(surface => surface.id);
    if (!part.sourceSurfaceIds.length) throw new Error(`Work armature revision disconnected ${part.id}`);
  }
  const baselineJoints = rig.audit().joints.map(j => ({id:j.id,canonical:{...j.canonical}}));
  const nearest = (target: ArmaturePoint) => corrected.reduce((best,entry) =>
    Math.hypot(entry.sample.canonical.x-target.x,entry.sample.canonical.y-target.y) < Math.hypot(best.sample.canonical.x-target.x,best.sample.canonical.y-target.y) ? entry : best);
  const targets = [
    {name:'far-underarm-torso',point:{x:245.45,y:277}},
    {name:'far-lower-torso',point:{x:247.95,y:279.67}},
    {name:'near-inner-torso',point:{x:292.7,y:278}},
    {name:'near-lower-torso',point:{x:292.5,y:283}},
  ];
  const audit = (): WorkPlanningArmatureRevisionAudit => {
    const source = rig.audit();
    const torsoMaxSleeveWeight = finite(Math.max(...corrected.map(e => Math.max(e.sample.memberships['far-sleeve'],e.sample.memberships['near-sleeve']))),'torso sleeve weight');
    const torsoMinTorsoWeight = finite(Math.min(...corrected.map(e => e.sample.memberships.torso)),'stationary torso weight');
    const sourceDUnchanged = shirt.node.getAttribute('d') === d;
    const jointRegistrationsUnchanged = source.joints.length === baselineJoints.length && source.joints.every((j,i) =>
      j.id === baselineJoints[i]!.id && j.canonical.x === baselineJoints[i]!.canonical.x && j.canonical.y === baselineJoints[i]!.canonical.y);
    if (torsoMaxSleeveWeight !== 0 || torsoMinTorsoWeight !== 1 || !sourceDUnchanged || !jointRegistrationsUnchanged)
      throw new Error('Work armature revision violated stationary torso/source/joint ownership');
    const ownershipChecks: WorkPlanningOwnershipChecks = {
      technique:'source-contour-arc-ownership',torsoArc:{start,end,contourLength},torsoSampleCount:corrected.length,
      torsoMaxSleeveWeight,torsoMinTorsoWeight,
      changedSampleCount:corrected.filter(e => e.prior.torso !== 1 || e.prior['far-sleeve'] !== 0 || e.prior['near-sleeve'] !== 0).length,
      sourceDUnchanged,jointRegistrationsUnchanged,
      probes:targets.map(({name,point}) => {const e=nearest(point);return {
        name,canonical:e.sample.canonical,sourceDistance:e.distance,priorFarSleeve:e.prior['far-sleeve'],priorNearSleeve:e.prior['near-sleeve'],
        torso:e.sample.memberships.torso,farSleeve:e.sample.memberships['far-sleeve'],nearSleeve:e.sample.memberships['near-sleeve'],
      };}),
      detailScope:'Shared shirt contour corrected; separate fabric-detail memberships retained',
    };
    return {...source,ownershipChecks};
  };
  audit();
  return {...rig,audit};
}
