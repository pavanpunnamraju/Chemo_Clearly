import React from "react";
import { CORAL, NAVY, TEAL } from "./DirectedTheme";

export const ADDITIONAL_CARE_ARTWORK = [
  "care-alert-staff", "care-thoughts", "care-headwear", "care-bruising",
  "care-warm-compress", "care-bowel", "care-treatment-history", "care-warning",
] as const;

/** Object-only cutaways. No patient identity, reading, dose or fabricated text.
 * Physical objects remain supported; motion emphasizes a relevant detail. */
export const AdditionalCareArtwork: React.FC<{ artworkId: string; seconds: number; reducedMotion?: boolean; style?: React.CSSProperties }> = ({ artworkId, seconds, reducedMotion = false, style }) => {
  const t = Math.max(0, seconds) % 10;
  const smooth = (n: number) => { const x = Math.max(0, Math.min(1, n)); return x * x * (3 - 2 * x); };
  const attention = reducedMotion ? 0 : smooth((t - 1) / 2) * (1 - smooth((t - 5) / 2));
  const outline = { stroke: NAVY, strokeWidth: 2.8, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const title: Record<string, string> = {
    "care-alert-staff": "Alert the nearby infusion staff",
    "care-thoughts": "A moment to find words and organize thoughts",
    "care-headwear": "Optional hat and scarf",
    "care-bruising": "Gentle observation of the skin",
    "care-warm-compress": "Warm compress as a comfort measure",
    "care-bowel": "Bowel changes",
    "care-treatment-history": "Discuss treatment history with the care team",
    "care-warning": "Recognize symptoms that need prompt attention",
  };
  if (!title[artworkId]) throw new Error(`Unknown additional care artwork: ${artworkId}`);
  return <svg data-library-artwork={artworkId} viewBox="0 0 600 540" role="img" aria-label={title[artworkId]} style={{ width: "100%", height: "100%", ...style }}>
    <ellipse cx="300" cy="456" rx="217" ry="22" fill={TEAL} opacity=".09" />
    {artworkId === "care-alert-staff" && <g {...outline}>
      <rect x="340" y="145" width="137" height="205" rx="22" fill="#FFFFFF" />
      <path d="M375 146V112Q406 75 440 112V146" fill="none" stroke={TEAL} strokeWidth="11" />
      <circle cx="408" cy="205" r="28" fill="#CCEAE4" stroke="none" />
      <path d="M374 275Q378 237 407 237Q440 237 443 275" fill={TEAL} stroke="none" />
      <path d="M381 303H433M389 318H425" stroke="#B6CFC9" />
      <path d="M105 366Q106 255 213 255Q310 255 312 366Z" fill={CORAL} />
      <path d="M111 351Q117 284 175 273" fill="none" stroke="#FFD0C5" strokeWidth="10" />
      <rect x="92" y="366" width="235" height="29" rx="12" fill="#FFFFFF" />
      <path d="M210 253V227M193 225H228" strokeWidth="8" />
      <g opacity={.2 + .8 * attention} stroke={TEAL} fill="none" strokeWidth="6"><path d="M135 209L118 189M179 186L173 162M239 187L245 165" /></g>
    </g>}
    {artworkId === "care-thoughts" && <g {...outline}>
      <path d="M109 177Q109 137 153 137H345Q389 137 389 182V285Q389 319 352 319H213L162 361V319H151Q109 319 109 279Z" fill="#FFFFFF" />
      <path d="M298 274Q298 249 332 249H455Q490 249 490 280V355Q490 386 458 386H426V424L378 386H332Q298 386 298 352Z" fill="#CBEAE3" />
      {[0, 1, 2].map((i) => <circle key={i} cx={180 + i * 72} cy={225 - attention * (i === 1 ? 10 : 4)} r="11" fill={CORAL} stroke="none" />)}
      <path d="M343 306H446M343 333H416" fill="none" stroke={TEAL} strokeWidth="8" />
    </g>}
    {artworkId === "care-headwear" && <g {...outline}>
      <path d="M153 273Q173 155 290 157Q403 157 428 273Z" fill="#FFB29F" />
      <path d="M164 251Q291 283 417 251L428 283Q290 317 153 283Z" fill={CORAL} />
      <ellipse cx="292" cy="298" rx="210" ry="44" fill="#FFE2D8" />
      <path d="M210 338Q267 345 347 336L414 429Q380 451 356 436L298 380L258 455Q226 461 205 445Z" fill={TEAL} />
      <path d="M278 350L241 436M320 353L378 423" fill="none" stroke="#8DD6C7" strokeWidth="8" />
      <path d="M204 205Q230 178 262 181" stroke="#FFFFFF" strokeWidth="8" fill="none" opacity={.5 + attention * .5} />
    </g>}
    {artworkId === "care-bruising" && <g {...outline}>
      <path d="M102 406L170 270Q197 237 246 250L415 317Q451 335 433 373Q416 400 382 390L242 346L201 448Z" fill="#DFA184" />
      <path d="M106 395L203 436L191 461L93 419Z" fill={CORAL} />
      <path d="M248 282L386 336" fill="none" stroke="#F6C8AD" strokeWidth="12" />
      <g transform={`translate(${attention * 8} ${-attention * 6})`}>
        <circle cx="335" cy="236" r="78" fill="#DDF1F480" stroke={TEAL} strokeWidth="12" />
        <path d="M389 291L453 360" stroke={NAVY} strokeWidth="21" />
        <path d="M293 202Q310 183 332 187" fill="none" stroke="#FFFFFF" strokeWidth="10" />
      </g>
    </g>}
    {artworkId === "care-warm-compress" && <g {...outline}>
      <path d="M120 389Q117 363 153 357L429 351Q474 353 482 389L464 423H140Z" fill="#CCEAE4" />
      <path d="M149 308Q145 285 172 276L416 270Q446 271 453 299L430 373L166 380Z" fill="#FFB9A7" />
      <path d="M174 326L413 319M171 343L408 336" stroke={CORAL} strokeWidth="9" />
      <path d="M253 276L242 354M347 274L336 352" stroke="#FFE4DA" strokeWidth="5" />
      <g fill="none" stroke={TEAL} opacity={.3 + .5 * attention} transform={`translate(0 ${-8 * attention})`}>
        <path d="M229 228Q207 209 229 188Q249 169 229 149M301 228Q279 209 301 188Q321 169 301 149M373 228Q351 209 373 188Q393 169 373 149" strokeWidth="6" />
      </g>
    </g>}
    {artworkId === "care-bowel" && <g {...outline}>
      <path d="M204 118Q300 145 396 118L420 234Q439 311 408 430Q300 457 192 430Q161 311 180 234Z" fill="#F6C5AD" />
      <path d="M218 222H376Q393 222 393 242V349Q393 367 373 367H352V401" fill="none" stroke={CORAL} strokeWidth="29" />
      <path d="M218 222V356" fill="none" stroke={CORAL} strokeWidth="29" />
      <path d="M256 265H347Q367 265 365 286Q365 306 343 306H263Q242 306 243 327Q243 344 265 344H336" fill="none" stroke={TEAL} strokeWidth="14" opacity={.65 + attention * .3} />
    </g>}
    {artworkId === "care-treatment-history" && <g {...outline}>
      <path d="M104 217Q104 194 130 194H239L264 218H465Q490 218 490 243V422H104Z" fill={TEAL} />
      <g transform={`rotate(${-2 * attention} 310 352)`}>
        <rect x="164" y="113" width="243" height="284" rx="13" fill="#FFFFFF" />
        <rect x="234" y="97" width="102" height="38" rx="9" fill={CORAL} />
        <path d="M208 181H364M208 217H344M208 253H364M208 289H327" stroke="#C5D6D2" strokeWidth="10" />
      </g>
      <path d="M95 319Q95 299 119 299H471Q498 299 495 324L478 438H113Z" fill="#91D8C9" />
      <path d="M151 335H237" fill="none" stroke="#FFFFFF" strokeWidth="8" />
    </g>}
    {artworkId === "care-warning" && <g {...outline}>
      <path d="M274 122Q300 77 326 122L494 399Q515 433 472 435H128Q86 433 106 399Z" fill="#FFD5C9" />
      <path d="M298 206V317" fill="none" stroke={CORAL} strokeWidth="24" />
      <circle cx="298" cy="365" r="14" fill={NAVY} stroke="none" />
      <path d="M141 206L118 192M171 143L155 115M459 199L484 185" stroke={TEAL} strokeWidth="7" opacity={.2 + .8 * attention} />
    </g>}
  </svg>;
};
