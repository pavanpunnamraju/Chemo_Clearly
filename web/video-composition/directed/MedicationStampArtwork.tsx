import React from "react";
import {
  MEDICATION_STAMP_FOOTPRINT,
  medicationStampMotion,
  type MedicationStampCue,
} from "../../lib/video/medication-stamp-motion";
import {PatientCareObjects} from "./PatientCareObjects";

export type {MedicationStampCue} from "../../lib/video/medication-stamp-motion";

type MedicationStampArtworkProps = {
  seconds: number;
  cue: MedicationStampCue;
  reducedMotion?: boolean;
  style?: React.CSSProperties;
};

const INK = "#1C2B45";
const TEAL = "#2FBFA0";
const CORAL = "#FF6B4A";
const PAPER = "#FFFFFF";
const PALE = "#F4F7F6";
const SKIN = "#E3B49D";
const SKIN_SHADOW = "#B98975";

export const MedicationStampArtwork: React.FC<MedicationStampArtworkProps> = ({
  seconds,
  cue,
  reducedMotion = false,
  style,
}) => {
  const pose = medicationStampMotion(seconds, cue, reducedMotion);
  const footprint = MEDICATION_STAMP_FOOTPRINT;
  const message = cue.lines.join(" / ");
  const assemblyTransform = `translate(${pose.assemblyX} ${pose.assemblyY}) translate(${footprint.x + footprint.width / 2} ${footprint.y + footprint.height / 2}) scale(${pose.assemblyScale}) translate(${-footprint.x - footprint.width / 2} ${-footprint.y - footprint.height / 2})`;
  const compressionTransform = `translate(${-5 * pose.compression} ${5 * pose.compression})`;
  // Widen the complete connected anatomy around the grip; stamp hardware stays fixed.
  const anatomyTransform = "translate(0 178) scale(1 1.15) translate(0 -178)";
  const shadowTransform = `translate(${pose.assemblyX + pose.shadowOffsetX} ${pose.assemblyY + pose.shadowOffsetY}) translate(${footprint.x + footprint.width / 2} ${footprint.y + footprint.height / 2}) scale(${pose.assemblyScale}) translate(${-footprint.x - footprint.width / 2} ${-footprint.y - footprint.height / 2})`;

  return (
    <PatientCareObjects artworkId="care-medication-plan" seconds={0} reducedMotion style={style}>
      <g data-medication-stamp-root="true" data-stamp-seconds={seconds.toFixed(3)} data-stamp-phase={pose.phase} data-stamp-message={message} data-stamp-source-ref={cue.sourceRef}>
        <rect data-stamp-paper-clear="true" x="284" y="153" width="123" height="184" rx="5" fill={PAPER} />

        <svg
          data-stamp-shadow-receiver="paper"
          x="284"
          y="153"
          width="123"
          height="184"
          viewBox="284 153 123 184"
          overflow="hidden"
        >
          <rect
            data-stamp-shadow={JSON.stringify({transform: shadowTransform, offsetX: pose.shadowOffsetX, offsetY: pose.shadowOffsetY, opacity: pose.shadowOpacity})}
            x={footprint.x}
            y={footprint.y}
            width={footprint.width}
            height={footprint.height}
            rx={footprint.radius}
            fill={INK}
            opacity={pose.shadowOpacity}
            transform={shadowTransform}
          />
        </svg>

        <g data-stamp-imprint={JSON.stringify({opacity: pose.imprintOpacity, footprint})} opacity={pose.imprintOpacity}>
          <rect x={footprint.x} y={footprint.y} width={footprint.width} height={footprint.height} rx={footprint.radius} fill="none" stroke={TEAL} strokeWidth="3.5" />
          {cue.lines.map((line, index) => (
            <text
              key={`${index}-${line}`}
              x={footprint.x + footprint.width / 2}
              y={cue.lines.length === 1 ? footprint.y + 39 : footprint.y + 27 + index * 23}
              fill={TEAL}
              fontFamily="Figtree, Arial, sans-serif"
              fontSize="14"
              fontWeight="800"
              letterSpacing="-.35"
              textAnchor="middle"
            >
              {line}
            </text>
          ))}
        </g>

        {pose.hardwareVisible ? (
          <g data-stamp-hardware="true" transform={assemblyTransform}>
            <g data-stamp-pad={JSON.stringify({footprint, contact: pose.contact})}>
              <rect x={footprint.x} y={footprint.y} width={footprint.width} height={footprint.height} rx={footprint.radius} fill={INK} stroke={INK} strokeWidth="4" />
              <path d="M297 276h97" fill="none" stroke={TEAL} strokeWidth="4" strokeLinecap="round" />
            </g>

            <g data-stamp-body={JSON.stringify({assemblyTransform, compressionTransform, footprint})}>
              <rect x="298" y="205" width="102" height="67" rx="7" fill={PALE} stroke={INK} strokeWidth="3" />
              <path d="M298 205l8-8h101v67l-7 8v-67Z" fill={PAPER} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
              <rect x="306" y="208" width="86" height="53" rx="4" fill={PALE} stroke="#C9DAD5" strokeWidth="3" />
              <path d="M310 218h78M310 251h78" fill="none" stroke="#C9DAD5" strokeWidth="3" strokeLinecap="round" />
            </g>

            <g data-stamp-grip={compressionTransform} transform={compressionTransform}>
              <path d="M329 205l7-30h37l12 30" fill={CORAL} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
              <rect x="326" y="158" width="58" height="24" rx="11" fill={INK} />
              <path d="M337 182l3 19M373 182l5 19" stroke={INK} strokeWidth="5" strokeLinecap="round" />
              <path d="M344 185v13M369 185v13" stroke={TEAL} strokeWidth="3" strokeLinecap="round" />

              <g data-stamp-hand="connected-gripping-hand">
                <g data-stamp-anatomy="hand" transform={anatomyTransform}>
                <path d="M455 196l-32-1q-10 1-18 6q-21 10-45 1q-12-6-17-19q-12 5-18-3q-5-7 1-14q5-6 14-2q-1-5 3-9q7-8 19-4q7-11 22-10q14 0 23 9q8 8 18 9l35 1" fill={SKIN} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
                <path d="M377 149q10 1 18 7M361 157q10 2 18 8M345 166q9 2 17 9" fill="none" stroke={SKIN_SHADOW} strokeWidth="2.5" strokeLinecap="round" />
                <path data-stamp-thumb-crease="short-lower-arc" d="M337 181q5 2 9 1" transform="rotate(10 337 181)" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
                </g>
              </g>

              <g data-stamp-forearm="continuous-to-right-crop">
                <g data-stamp-anatomy="forearm" transform={anatomyTransform}>
                <path d="M460 160l540 15v55l-545-34q8-18 5-36Z" fill={CORAL} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
                <path d="M465 168q10 11 9 26" fill="none" stroke="#D95036" strokeWidth="3" strokeLinecap="round" />
                </g>
              </g>
            </g>

          </g>
        ) : null}

        <metadata
          data-stamp-contact={JSON.stringify({active: pose.contact, contactSeconds: cue.contactSeconds, footprint})}
          data-stamp-compression={pose.compression.toFixed(4)}
        />
      </g>
    </PatientCareObjects>
  );
};
