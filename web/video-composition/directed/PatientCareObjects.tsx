import React from "react";
import { contextArtworkRecipe, contextMotion } from "../../lib/video/library-context-motion";

const INK = "#1C2B45", TEAL = "#2FBFA0", CORAL = "#FF6B4A", PAPER = "#FFFFFF", PALE = "#E4EFEB", BLUE = "#8ACCE8";
const line = { stroke: INK, strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Lens: React.FC<{ x?: number; y?: number; motion: number }> = ({ x = 307, y = 224, motion }) => <g data-object-layer="inspection-lens" transform={`translate(${motion} 0)`}>
  <circle cx={x} cy={y} r="47" fill={`${BLUE}33`} {...line} /><path d={`M${x + 34} ${y + 34}l48 48`} stroke={INK} strokeWidth="14" strokeLinecap="round" />
  <path d={`M${x - 24} ${y - 18}q12 -15 30 -12`} fill="none" stroke={PAPER} strokeWidth="5" strokeLinecap="round" />
</g>;
const Notebook: React.FC<{ questions?: boolean }> = ({ questions = false }) => <g data-object-layer="notebook">
  <path d="M110 137q65 -25 140 0q73 -25 140 0v214q-70 -26 -140 0q-75 -26 -140 0Z" fill={PAPER} {...line} />
  <path d="M250 137v214" fill="none" {...line} />
  {[181, 218, 255, 292].map((y) => <g key={y}><path d={`M135 ${y}h88M274 ${y}h85`} stroke={PALE} strokeWidth="7" strokeLinecap="round" /></g>)}
  {questions && <path d="M169 194q-1 -21 20 -21q25 0 20 22q-2 10 -19 17v13M190 240v1" fill="none" stroke={TEAL} strokeWidth="7" strokeLinecap="round" />}
</g>;
const Pen: React.FC<{ attention: number; x?: number; y?: number }> = ({ attention, x = 282, y = 266 }) => <g data-object-layer="pen" transform={`translate(${x + attention * 22} ${y}) rotate(28)`}>
  <path d="M0 0V-111q0 -6 6 -6h10q6 0 6 6V0L11 23Z" fill={CORAL} {...line} /><path d="M0 -93h22M5 12h12" fill="none" {...line} />
</g>;
const Toast = () => <g data-object-layer="plain-toast"><path d="M291 195q-10 -15 1 -29q14 -15 42 -13q32 -2 45 13q11 15 0 29v74h-88Z" fill="#E6C296" {...line} /><path d="M305 202q-9 -15 0 -22q12 -11 29 -9q22 -2 32 9q8 8 0 22v52h-61Z" fill="#F5E0BA" stroke="#B79472" strokeWidth="2" /></g>;
const Bowl = () => <g data-object-layer="small-bowl"><ellipse cx="194" cy="268" rx="88" ry="22" fill={PALE} {...line} /><path d="M106 268q6 78 88 79q82 -1 88 -79" fill={TEAL} {...line} /><ellipse cx="194" cy="268" rx="71" ry="13" fill="#F2E4BD" stroke="#D8C798" strokeWidth="2" /></g>;

/** Object-only illustrations fill specific source-instruction gaps. They show
 * recognizable props and inspection/planning gestures, never dosage, diagnosis,
 * patient findings, a clinical measurement pose or an invented full character. */
export const PatientCareObjects: React.FC<{ artworkId: string; seconds: number; reducedMotion?: boolean; style?: React.CSSProperties; children?: React.ReactNode }> =
  ({ artworkId, seconds, reducedMotion = false, style, children }) => {
    const pose = contextMotion(seconds, reducedMotion);
    const label = contextArtworkRecipe(artworkId)?.semantics;
    let artwork: React.ReactNode;
    switch (artworkId) {
      case "care-oral": artwork = <>
        <g data-object-layer="rinse-cup"><path d="M271 212h120l-15 142h-90Z" fill={PAPER} {...line} /><path d="M282 276h99l-8 65h-84Z" fill={BLUE} /><ellipse cx="331" cy="212" rx="60" ry="12" fill={PALE} {...line} /></g>
        <g data-object-layer="soft-toothbrush" transform={`rotate(${pose.attention * 5} 190 329)`}><path d="M182 340V179q0 -12 11 -12h8q11 0 11 12v161q0 11 -15 11t-15 -11" fill={CORAL} {...line} /><path d="M185 174v-67h31v67Z" fill={PAPER} {...line} />{[111, 122, 133, 144, 155, 166].map((y) => <path key={y} d={`M185 ${y}h31`} stroke={TEAL} strokeWidth="3" />)}</g>
      </>; break;
      case "care-foot-inspection": artwork = <><g data-object-layer="foot-outline"><path d="M194 128q-24 -5 -24 19v35q-5 -25 -18 -23q-12 2 -8 31q-6 -19 -17 -15q-12 4 -4 30q-13 -14 -20 -7q-9 9 5 30q-12 -11 -18 -3q-7 9 16 33q24 29 19 65q-5 45 47 48q54 0 66 -46q8 -33 -6 -66q-12 -28 -10 -69v-33q-1 -26 -28 -29Z" fill="#E3B49D" {...line} /><path d="M165 252q27 32 7 68M154 208q19 12 43 1" fill="none" stroke="#B98975" strokeWidth="3" /></g><Lens motion={pose.scan} x={224} y={256} /></>; break;
      case "care-bland-meal": artwork = <><ellipse cx="253" cy="351" rx="166" ry="18" fill={PALE} /><Toast /><Bowl /><g data-object-layer="spoon" transform={`rotate(${pose.attention * 5} 350 317)`}><path d="M336 344l45 -73" stroke={INK} strokeWidth="9" strokeLinecap="round" /><ellipse cx="388" cy="258" rx="15" ry="24" transform="rotate(31 388 258)" fill={PALE} {...line} /></g></>; break;
      case "care-laundry": artwork = <><g data-object-layer="washing-machine"><rect x="248" y="112" width="180" height="248" rx="13" fill={PAPER} {...line} /><path d="M248 164h180" fill="none" {...line} /><rect x="267" y="129" width="50" height="13" rx="4" fill={PALE} /><circle cx="390" cy="137" r="11" fill={TEAL} {...line} /><circle cx="338" cy="257" r="70" fill={PALE} {...line} /><g transform={`rotate(${pose.attention * 22} 338 257)`}><path d="M282 263q35 -58 77 -12q25 24 35 6q-4 61 -63 57q-42 -3 -49 -51Z" fill={CORAL} /><path d="M299 222q31 11 14 48q-11 19 22 34" fill="none" stroke={PAPER} strokeWidth="12" /></g></g><g data-object-layer="laundry-basket"><path d="M90 249h145l-18 109H108Z" fill={TEAL} {...line} /><path d="M110 249q-20 -25 4 -41l29 3q-10 -31 28 -30l18 37q34 -15 35 31" fill={PALE} {...line} />{[135, 163, 192].map((x) => <path key={x} d={`M${x} 274v61`} stroke={PAPER} strokeWidth="6" strokeLinecap="round" />)}</g></>; break;
      case "care-toilet": artwork = <><g data-object-layer="closed-toilet"><rect x="247" y="111" width="111" height="148" rx="12" fill={PAPER} {...line} /><path d="M137 257h220q-2 68 -76 74l14 45H175l15 -48q-52 -10 -53 -71" fill={PAPER} {...line} /><ellipse cx="247" cy="253" rx="116" ry="29" fill={PALE} {...line} /><ellipse cx="247" cy="248" rx="108" ry="24" fill={PAPER} {...line} /><g data-object-layer="flush-handle" transform={`rotate(${pose.attention * 15} 279 139)`}><path d="M279 139h40" stroke={TEAL} strokeWidth="9" strokeLinecap="round" /><circle cx="279" cy="139" r="7" fill={TEAL} /></g></g></>; break;
      case "care-scalp-sun": artwork = <><g data-object-layer="sun"><circle cx="350" cy="142" r="41" fill="#F3CF7F" />{Array.from({ length: 8 }, (_, i) => <path key={i} d="M350 78v-16" transform={`rotate(${i * 45} 350 142)`} stroke="#D6AF62" strokeWidth="5" strokeLinecap="round" opacity={.65 + .35 * pose.attention} />)}</g><g data-object-layer="sun-hat"><path d="M169 256q-4 -108 74 -111q78 3 73 111Z" fill={PALE} {...line} /><path d="M172 230h142v29H172Z" fill={CORAL} {...line} /><ellipse cx="243" cy="278" rx="146" ry="43" fill={PALE} {...line} /><path d="M158 280q84 31 166 0" fill="none" stroke={TEAL} strokeWidth="4" /></g></>; break;
      case "care-nails": artwork = <><g data-object-layer="fingertips" fill="#E3B49D" {...line}>{[0, 1, 2, 3].map((i) => <g key={i} transform={`translate(${120 + i * 53} ${190 - [0, 30, 18, 3][i]!})`}><path d="M0 160V34q0 -34 22 -34t22 34v126" /><rect x="8" y="14" width="28" height="46" rx="13" fill="#F4D8CC" stroke="#BC8D77" strokeWidth="2" /></g>)}</g><Lens motion={pose.scan} x={285} y={224} /></>; break;
      case "care-journal": artwork = <><Notebook /><Pen attention={pose.attention} /></>; break;
      case "care-thermometer": artwork = <><g data-object-layer="blank-thermometer" transform="rotate(22 250 245)"><path d="M212 153q0 -34 38 -34t38 34v151q0 22 -20 36v33h-36v-33q-20 -14 -20 -36Z" fill={PAPER} {...line} /><rect x="224" y="172" width="52" height="64" rx="7" fill={PALE} {...line} /><circle cx="250" cy="271" r="13" fill={TEAL} /><path d="M232 353h36v20h-36Z" fill={BLUE} {...line} /><path d="M231 188v28" stroke={PAPER} strokeWidth="5" opacity={pose.draw} /></g></>; break;
      case "care-heart": artwork = <><g data-object-layer="heart-schematic"><path d="M246 171q-35 -58 -87 -24q-43 29 -19 82q21 51 108 107q96 -56 117 -112q18 -53 -25 -80q-53 -29 -94 27Z" fill={CORAL} {...line} /><path d="M186 166q-26 7 -24 35" fill="none" stroke="#FFC3B4" strokeWidth="9" strokeLinecap="round" /><path d="M239 99v38M287 108l-11 30" stroke={TEAL} strokeWidth="18" strokeLinecap="round" /></g><path d="M117 333q129 30 252 -1" fill="none" stroke={PALE} strokeWidth="7" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - pose.draw} /></>; break;
      case "care-brain": artwork = <><g data-object-layer="head-and-brain"><path d="M183 363v-58q-43 -23 -51 -73q-12 -95 79 -117q106 -20 129 68l27 43q6 10 -9 13l-12 1v36q0 19 -22 19h-38v68" fill={PALE} {...line} /><path d="M181 220q-30 -11 -19 -39q-3 -24 24 -30q17 -31 43 -12q23 -11 38 10q34 3 32 32q19 33 -9 44q-14 24 -39 8q-26 19 -46 -5q-17 3 -24 -8" fill="#F4CEC1" {...line} /><path d="M203 156q17 9 10 26q-14 17 -1 33M245 154q-10 22 13 28q21 8 8 34M175 188q13 -12 27 2M237 184q-5 22 11 28" fill="none" stroke="#BE8B7C" strokeWidth="3" /></g><Lens motion={pose.scan * .5} x={316} y={258} /></>; break;
      case "care-blood-counts": artwork = <><g data-object-layer="blood-cell-schematic"><path d="M106 207q77 -36 143 3q79 38 147 -3v108q-78 35 -145 -5q-76 -32 -145 6Z" fill="#F9E2DA" stroke="#E5BFB4" strokeWidth="3" />{[{ x: 157, y: 254 }, { x: 242, y: 279 }, { x: 333, y: 244 }].map((cell, i) => <g key={i} transform={`translate(${pose.attention * (i % 2 ? -4 : 4)} 0)`}><ellipse cx={cell.x} cy={cell.y} rx="31" ry="20" fill={CORAL} stroke="#BD6255" strokeWidth="2" /><ellipse cx={cell.x} cy={cell.y} rx="14" ry="8" fill="#FFD0C3" /></g>)}<circle cx="275" cy="172" r="35" fill={PAPER} stroke="#B0C6CE" strokeWidth="3" /><path d="M257 162q11 -19 25 -4q16 3 10 17q-8 17 -26 8q-16 -3 -9 -21" fill="#9FB2CE" />{[154, 192, 218].map((x) => <circle key={x} cx={x} cy={165 + x % 9} r="5" fill={TEAL} />)}</g></>; break;
      case "care-medication-plan": artwork = <>
        <g data-object-layer="breakfast-column" transform="translate(-39.198427294882 0.867411860276) scale(0.891125913891)">
          {/* Keep shared center x=133.68. Stack spans board y=137–347; gap is 20% larger than revision1. */}
          <g transform="translate(-141.369047619 0)"><Toast /></g>
          <g transform="translate(0 41.421639124284)"><Bowl /></g>
        </g>
        <g data-object-layer="blank-medication-checklist"><rect x="278" y="137" width="135" height="210" rx="9" fill={PAPER} {...line} /><rect x="314" y="125" width="63" height="25" rx="5" fill={TEAL} {...line} />{[185, 229, 273].map((y) => <g key={y}><rect x="293" y={y} width="16" height="16" rx="3" fill={PALE} /><path d={`M321 ${y + 8}h71`} stroke={PALE} strokeWidth="5" /></g>)}<path d="M323 311h55" stroke={CORAL} strokeWidth="5" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - pose.draw} /></g>
      </>; break;
      case "care-work-plan": artwork = <><g data-object-layer="work-bag"><rect x="111" y="208" width="220" height="145" rx="14" fill={TEAL} {...line} /><path d="M176 208v-25q0 -13 14 -13h59q14 0 14 13v25" fill="none" {...line} /><path d="M111 260q110 32 220 0" fill="none" {...line} /><rect x="209" y="267" width="25" height="26" rx="4" fill={PAPER} {...line} /></g><g data-object-layer="work-notes" transform={`rotate(${-5 + pose.attention * 2} 342 256)`}><rect x="287" y="119" width="118" height="189" rx="6" fill={PAPER} {...line} />{[166, 205, 244].map((y) => <path key={y} d={`M309 ${y}h72`} stroke={PALE} strokeWidth="6" strokeLinecap="round" />)}</g></>; break;
      case "care-questions-history": artwork = <><path data-object-layer="records-folder" d="M97 123h98l20 23h183v204H97Z" fill={TEAL} {...line} /><g transform="translate(7 34) scale(.96)"><Notebook questions /><Pen attention={pose.attention} x={301} y={270} /></g></>; break;
      case "care-skin": artwork = <><g data-object-layer="forearm-skin"><path d="M113 339q57 -17 102 -65l45 -77q22 -41 53 -28q30 13 7 52l-37 64q-31 47 -114 95Z" fill="#E3B49D" {...line} /><path d="M267 208q17 5 30 17" fill="none" stroke="#BB8B76" strokeWidth="3" /></g><Lens motion={pose.scan} x={239} y={253} /></>; break;
      default: throw new Error(`Unknown patient care object: ${artworkId}`);
    }
    return <svg data-library-artwork={artworkId} viewBox="60 55 390 375" role="img" aria-label={label} width="100%" height="100%" style={style}>
      <ellipse cx="254" cy="384" rx="157" ry="12" fill={PALE} opacity=".65" />{artwork}{children}
    </svg>;
  };
