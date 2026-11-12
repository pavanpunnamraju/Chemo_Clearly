export type ArmZoomAnchor = {
  sourceRef: string;
  initialCenter: [number, number];
  initialHeight: number;
  forearmCenter: [number, number];
  forearmHeight: number;
  microscopicHeight: number;
  forearmAngleDegrees?: number;
};

const smooth = (n: number) => {const t = Math.max(0, Math.min(1, n));return t*t*(3-2*t);};
const blend = (a:number,b:number,t:number)=>a+(b-a)*t;
const optical = (a:number,b:number,t:number)=>Math.exp(blend(Math.log(a),Math.log(b),t));

/** Camera-only approach. The source character has no moving anatomical layers. */
export function armMicroscopeState(seconds:number, anchor:ArmZoomAnchor, entrySeconds=3.2, reducedMotion=false){
  if(!anchor.sourceRef.trim()||[anchor.initialHeight,anchor.forearmHeight,anchor.microscopicHeight,entrySeconds].some(n=>!Number.isFinite(n)||n<=0))throw new Error('Valid source-bound arm zoom anchor required');
  const now=Math.max(0,seconds);
  const approach=smooth((now-entrySeconds*.13)/(entrySeconds*.4));
  const penetration=smooth((now-entrySeconds*.64)/(entrySeconds*.36));
  const center:[number,number]=[
    blend(anchor.initialCenter[0],anchor.forearmCenter[0],approach),
    blend(anchor.initialCenter[1],anchor.forearmCenter[1],approach),
  ];
  const height=optical(optical(anchor.initialHeight,anchor.forearmHeight,approach),anchor.microscopicHeight,penetration);
  const vesselReveal=smooth((now-entrySeconds*.43)/(entrySeconds*.13));
  const microscopicOpacity=reducedMotion?1:smooth((now-entrySeconds*.86)/(entrySeconds*.14));
  const rotation=(anchor.forearmAngleDegrees??0)*penetration;
  return {center,height,rotation,vesselReveal,openingOpacity:reducedMotion?0:1-microscopicOpacity,microscopicOpacity,
    phase:reducedMotion||now>=entrySeconds?'microscopic':now<entrySeconds*.43?'approach':now<entrySeconds*.64?'translucent-reveal':'enter-vessel'};
}
