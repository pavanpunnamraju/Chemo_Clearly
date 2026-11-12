import React from "react";
import type { MotionAction } from "../../lib/video/direction-types";

export { NAVY as INK, CORAL, TEAL, FRAME_BG as CREAM } from "./DirectedTheme";
import { NAVY as INK, CORAL, TEAL, FRAME_BG as CREAM } from "./DirectedTheme";
const SKIN = "#C98965";
const SKIN_LIGHT = "#E4AC87";
type Point = { x: number; y: number };
const blend = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Every pose has connected shoulder, elbow and wrist. Two-bone IK preserves
 * limb lengths; the prop inherits the wrist's transform, rather than guessing
 * the position of separately animated SVG paths. Coordinates remain editable. */
export function armJoints(shoulder: Point, target: Point, bend = 1): { elbow: Point; wrist: Point } {
  const upper = 61;
  const lower = 66;
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const rawDistance = Math.hypot(dx, dy);
  const distance = Math.max(12, Math.min(upper + lower - 1, rawDistance));
  const angle = Math.atan2(dy, dx);
  const offset = Math.acos(Math.max(-1, Math.min(1, (upper ** 2 + distance ** 2 - lower ** 2) / (2 * upper * distance))));
  return {
    elbow: { x: shoulder.x + upper * Math.cos(angle + bend * offset), y: shoulder.y + upper * Math.sin(angle + bend * offset) },
    wrist: { x: shoulder.x + distance * Math.cos(angle), y: shoulder.y + distance * Math.sin(angle) },
  };
}

const Arm: React.FC<{ shoulder: Point; target: Point; bend?: number; sleeve: string; skin?: string; prop?: "glass" | "phone" | "thermometer"; angle?: number }> = ({ shoulder, target, bend = 1, sleeve, skin = SKIN_LIGHT, prop, angle = 0 }) => {
  const { elbow, wrist } = armJoints(shoulder, target, bend);
  const cuff = blend(shoulder, elbow, 0.79);
  return <g data-joint="shoulder-elbow-wrist">
    <path d={`M${shoulder.x},${shoulder.y} L${elbow.x},${elbow.y} L${wrist.x},${wrist.y}`} fill="none" stroke={skin} strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
    <path d={`M${shoulder.x},${shoulder.y} L${cuff.x},${cuff.y}`} fill="none" stroke={sleeve} strokeWidth="34" strokeLinecap="round" />
    <path d={`M${cuff.x - 6},${cuff.y + 3} l10,2`} fill="none" stroke="#ffffff" strokeOpacity=".25" strokeWidth="2" />
    <g transform={`translate(${wrist.x} ${wrist.y}) rotate(${angle})`} data-attachment="wrist-prop">
      {prop === "glass" && <g transform="translate(-25 -34)"><path d="M0 0H33L29 48Q17 53 5 48Z" fill="#EFF8F6" fillOpacity=".88" stroke={TEAL} strokeWidth="2.5" /><path d="M3 17Q16 13 31 17L28 45Q16 49 7 45Z" fill="#A2D6D8" /><path d="M8 7L10 35" stroke="white" strokeWidth="3" strokeLinecap="round" /></g>}
      {prop === "phone" && <g transform="rotate(-10)"><rect x="-13" y="-37" width="27" height="56" rx="7" fill={INK} /><rect x="-9" y="-29" width="19" height="38" rx="3" fill="#A3CBC5" /><circle cx="1" cy="14" r="2" fill={CREAM} /></g>}
      {prop === "thermometer" && <g transform="rotate(-27)"><rect x="-8" y="-44" width="19" height="68" rx="9" fill="#FFFFFF" stroke={TEAL} strokeWidth="2.5" /><rect x="-4" y="-31" width="11" height="18" rx="2" fill="#B7D3C1" /><path d="M-1 -23h5" stroke={TEAL} strokeWidth="2" /><circle cx="1" cy="-5" r="3" fill={CORAL} /><path d="M1 24v15" stroke={INK} strokeWidth="5" strokeLinecap="round" /></g>}
      <ellipse cx="-1" cy="0" rx="13" ry="9" fill={skin} transform="rotate(-20)" />
      <path d="M-5 -5Q3 -13 9 -6" fill="none" stroke={skin} strokeWidth="7" strokeLinecap="round" />
    </g>
  </g>;
};

const Plant: React.FC<{ x?: number; y?: number; scale?: number }> = ({ x = 80, y = 330, scale = 1 }) => <g transform={`translate(${x} ${y}) scale(${scale})`}>
  <path d="M0 66Q-3 9 15 -21M1 38Q-21 10 -31 -5M4 17Q31 -12 42 -14" fill="none" stroke={TEAL} strokeWidth="4" />
  <path d="M13 -5Q-6 -38 22 -46Q34 -20 13 -5M-14 23Q-55 12 -43 -14Q-13 -12 -14 23M14 15Q20 -25 50 -25Q59 5 14 15M-2 54Q-39 52 -39 27Q-8 24 -2 54M6 43Q28 17 48 32Q38 57 6 43" fill="#739E86" />
  <path d="M-28 65H30L24 109Q1 120 -22 109Z" fill="#D6A177" /><path d="M-30 64H32V75H-30Z" fill="#E8BC92" />
</g>;

const Chair: React.FC = () => <g data-layer="chair">
  <path d="M171 239Q164 222 182 215H288Q315 215 319 242L331 349H185Z" fill="#A1BBB0" />
  <path d="M170 248Q157 248 158 266L170 363Q171 378 193 378H337Q351 378 349 362L338 336H188Z" fill="#D5DED1" />
  <path d="M182 378L170 444M331 378L344 444" stroke="#977256" strokeWidth="10" strokeLinecap="round" />
  <path d="M156 327H215M312 327H359" stroke="#829F94" strokeWidth="15" strokeLinecap="round" />
</g>;

const Room: React.FC<{ action: MotionAction; seconds: number; reducedMotion: boolean }> = ({ action, seconds, reducedMotion }) => {
  const wash = action === "wash-hands";
  return <g data-layer="environment">
    <path d="M53 433H456" stroke="#CFCFC1" strokeWidth="2" />
    <path d="M69 89Q69 65 94 65H171V213H69Z" fill="#E3EBDF" />
    <path d="M79 76H160V200H79Z" fill="#F7F8EC" />
    <path d="M120 76V200M80 142H160" stroke="#D5DDCE" strokeWidth="5" />
    <circle cx="147" cy="98" r="17" fill="#E8C988" opacity=".72" />
    <Plant x={76} y={337} scale={.78} />
    {!["walk", "stretch", "wash-hands"].includes(action) && <Chair />}
    {action === "infusion" && <g><path d="M385 110V423M357 429L385 414L413 429M363 112H410" stroke="#90A9A5" strokeWidth="5" strokeLinecap="round" /><path d="M373 112V128" stroke={INK} strokeWidth="2" /><rect x="358" y="127" width="31" height="65" rx="9" fill="#FCFCF5" stroke="#93B6AB" strokeWidth="2" /><path d="M362 157H385V183Q374 190 362 183Z" fill="#9BCBC6" /><path d="M375 193V242Q375 283 330 289L305 289" stroke="#8FB9AD" strokeWidth="2.5" fill="none" /><circle cx="362" cy="436" r="5" fill={INK} /><circle cx="409" cy="436" r="5" fill={INK} /></g>}
    {wash && <g><rect x="314" y="294" width="131" height="135" rx="6" fill="#C6D8CF" /><path d="M310 288H450V311H310Z" fill="#FEFFFA" stroke="#ADC3B8" strokeWidth="2" /><path d="M324 301Q379 346 437 301" fill="#DEEAE4" /><path d="M403 287V259Q403 244 387 244Q373 244 373 263" fill="none" stroke="#7C9A98" strokeWidth="9" strokeLinecap="round" /><path d="M373 268V299" stroke="#96D1D7" strokeWidth="5" strokeDasharray="5 6" strokeDashoffset={reducedMotion ? 0 : -seconds * 22} /><path d="M381 345V411" stroke="#A8C2B4" strokeWidth="2" /><circle cx="368" cy="359" r="3" fill={TEAL} /><rect x="431" y="258" width="17" height="30" rx="4" fill={CORAL} /><path d="M439 259V250H449" stroke={INK} strokeWidth="3" /></g>}
    {action === "drink" && <g><ellipse cx="412" cy="340" rx="34" ry="8" fill="#C7A47C" /><path d="M412 346V422M394 429L412 419L431 429" stroke="#A68969" strokeWidth="7" strokeLinecap="round" /><path d="M397 326H424V339H397Z" fill={TEAL} /><path d="M399 322H425V327H399Z" fill="#E4C687" /></g>}
  </g>;
};

const Face: React.FC<{ seconds: number; reducedMotion: boolean }> = ({ seconds, reducedMotion }) => {
  const blink = !reducedMotion && seconds % 6.7 > 6.51;
  return <g data-layer="head">
    <path d="M210 172Q193 127 217 108Q232 90 263 104Q291 103 298 137L291 184L213 190Z" fill="#2E4245" />
    <path d="M239 179V211Q253 228 270 209L263 177" fill={SKIN} />
    <path d="M219 137Q227 112 257 119Q282 125 280 157L276 176Q268 195 252 197Q234 195 226 176Z" fill={SKIN_LIGHT} />
    <ellipse cx="220" cy="158" rx="8" ry="12" fill={SKIN_LIGHT} />
    <path d="M214 147Q207 116 236 110Q263 99 282 131Q249 136 235 119Q230 144 214 147" fill="#2E4245" />
    <path d="M233 147q5 -3 10 0M260 146q5 -3 9 0" stroke="#533D34" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    {blink ? <path d="M235 155h6M261 154h6" stroke={INK} strokeWidth="2" /> : <g fill={INK}><ellipse cx="239" cy="155" rx="2.2" ry="3" /><ellipse cx="264" cy="154" rx="2.2" ry="3" /></g>}
    <path d="M252 155l-2 12h5M246 178q8 5 15 -2" stroke="#9E6550" strokeWidth="2" strokeLinecap="round" fill="none" />
    <ellipse cx="234" cy="169" rx="7" ry="4" fill="#D88D73" opacity=".4" /><circle cx="220" cy="171" r="3" fill="#D9C28E" />
    <path d="M213 179Q223 190 229 193" stroke="#576362" strokeWidth="2" fill="none" />
  </g>;
};

export const PatientIllustration: React.FC<{ action: MotionAction; seconds: number; cue: number; reducedMotion: boolean; companion?: boolean }> = ({ action, seconds, cue, reducedMotion, companion = false }) => {
  const progress = reducedMotion ? 1 : smooth((seconds - cue) / 1.7);
  const lower = reducedMotion ? 0 : smooth((seconds - cue - 4.5) / 1.8);
  const gesture = progress * (1 - lower);
  const settle = reducedMotion ? 0 : Math.sin(Math.min(seconds, 5) * Math.PI / 5) * 1.8;
  const washPhase = reducedMotion ? 0 : Math.sin(Math.max(0, Math.min(seconds - cue, 4)) * 4) * 5 * progress;
  const standing = ["walk", "stretch", "wash-hands"].includes(action);
  let right = { x: 310, y: 330 };
  let left = { x: 238, y: 320 };
  let prop: "glass" | "phone" | "thermometer" | undefined;
  // The glass rim is 34 units above its wrist attachment. Raising the wrist
  // to the face itself would put that rim at eye level, not at the mouth.
  if (action === "drink") {
    right = blend(right, { x: 290, y: 205 }, gesture);
    // An outward reach arc avoids the shoulder singularity that a straight
    // lap-to-mouth path crosses, keeping the elbow on the body's outer side.
    right.x += 36 * Math.sin(Math.PI * gesture);
    prop = "glass";
  }
  if (action === "call") { right = blend(right, { x: 289, y: 154 }, progress); prop = "phone"; }
  if (action === "temperature") { right = blend(right, { x: 329, y: 222 }, progress); prop = "thermometer"; }
  if (action === "wash-hands") { right = { x: 361 + washPhase, y: 279 }; left = { x: 345 - washPhase, y: 273 }; }
  if (action === "stretch") { right = blend(right, { x: 335, y: 177 }, gesture); left = blend(left, { x: 168, y: 194 }, gesture); }
  if (action === "welcome" || action === "support") right = blend(right, { x: 332, y: 252 }, gesture * .7);
  const walking = action === "walk" && !reducedMotion ? Math.sin(Math.min(Math.max(0, seconds - cue), 5) * 2.5) * 18 : 0;
  if (action === "walk") { right = { x: 307 - walking * .8, y: 301 }; left = { x: 211 + walking * .8, y: 303 }; }
  return <svg viewBox="0 0 500 480" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label={`Illustration: ${action}`}>
    <Room action={action} seconds={seconds} reducedMotion={reducedMotion} />
    {companion && <g transform="translate(125 32) scale(.85)"><path d="M245 311L228 403M271 311L300 401" stroke="#A09888" strokeWidth="30" strokeLinecap="round" /><path d="M221 408h-20M293 406h24" stroke={INK} strokeWidth="13" strokeLinecap="round" /><path d="M219 215Q253 196 279 215L292 311Q250 328 214 307Z" fill={TEAL} /><path d="M260 181V210" stroke="#93634F" strokeWidth="25" /><ellipse cx="253" cy="163" rx="31" ry="39" fill="#AC795A" /><path d="M221 157Q211 114 253 119Q285 116 286 153L272 147L267 132Q242 140 221 157" fill="#475152" /><path d="M239 158h3M262 158h3" stroke={INK} strokeWidth="3" strokeLinecap="round" /><path d="M248 179q7 3 13 -2" stroke="#69483B" strokeWidth="2" /><Arm shoulder={{ x: 222, y: 224 }} target={{ x: 178, y: 251 }} sleeve={TEAL} skin="#AC795A" /></g>}
    <g transform={`translate(0 ${settle})`} data-layer="patient">
      {standing ? <g><path d={`M237 311Q${234 - walking} 364 ${226 + walking} 418`} stroke="#384D56" strokeWidth="36" strokeLinecap="round" /><path d={`M269 311Q${281 + walking} 366 ${279 - walking} 420`} stroke="#506771" strokeWidth="35" strokeLinecap="round" /><path d={`M${226 + walking} 424l-23 5h34M${279 - walking} 426l24 3h-35`} stroke={INK} strokeWidth="14" strokeLinecap="round" /><path d="M230 312H276" stroke="#425963" strokeWidth="32" /></g> : <g><path d="M229 308Q236 331 279 337L295 411" stroke="#384D56" strokeWidth="37" strokeLinecap="round" /><path d="M266 309L311 339L334 414" stroke="#506771" strokeWidth="34" strokeLinecap="round" /><path d="M294 420l25 6h-38M336 422l24 5h-37" stroke={INK} strokeWidth="14" strokeLinecap="round" /></g>}
      <Arm shoulder={{ x: 221, y: 228 }} target={left} bend={action === "stretch" ? -1 : 1} sleeve="#B9604B" />
      <path d="M231 204Q251 214 272 202Q291 212 300 239L286 316Q248 326 214 311L213 244Q212 214 231 204Z" fill={CORAL} />
      <path d="M233 207Q250 226 272 206" stroke="#F2B194" strokeWidth="4" strokeLinecap="round" />
      <path d="M223 278Q240 286 258 282M218 303Q245 313 283 306M280 242L273 273" stroke="#A95743" strokeWidth="2.5" strokeLinecap="round" opacity=".55" />
      <Face seconds={seconds} reducedMotion={reducedMotion} />
      <Arm shoulder={{ x: 282, y: 228 }} target={right} bend={["drink", "temperature", "call", "stretch", "wash-hands", "welcome", "support"].includes(action) ? 1 : -1} sleeve={CORAL} prop={prop} angle={action === "drink" ? gesture * -14 : 0} />
    </g>
  </svg>;
};
