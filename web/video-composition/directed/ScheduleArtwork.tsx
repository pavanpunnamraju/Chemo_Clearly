import React from "react";
import { type ScheduleNumberCue, scheduleNumberState } from "../../lib/video/schedule-number-cues";
import { prepareContextArtwork } from "./LibraryContextArtwork";
import { LibrarySvgArtwork, type LibrarySvgRig } from "./LibrarySvgArtwork";

const SVG_NS = "http://www.w3.org/2000/svg";
const SOURCE_PATH = "illustrations/timeline/timeline__schedule-pana.svg";
const SOURCE_SHA256 = "fda8ba9580aa92af748c801bc8fac04b7041911ae073e0d4a1d61f1c8665769c";

// The blank source screen is x=140..657/y=84..412. These bounds intentionally
// leave the person and browser chrome unchanged while using the large screen
// area to the right of the person for a generic, unlabelled month grid.
const GRID = { x: 240, y: 165, width: 365, height: 210 };
const COLUMNS = 7;
const ROWS = 5;
const DATE_COUNT = 31;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const NAVY = [28, 43, 69] as const;
const TEAL = [47, 191, 160] as const;

const element = <K extends keyof SVGElementTagNameMap>(name: K) =>
  document.createElementNS(SVG_NS, name);
const colorAt = (strength: number) => strength === 0 ? "#1C2B45" : strength === 1 ? "#2FBFA0" :
  `rgb(${NAVY.map((value, index) => Math.round(value + (TEAL[index]! - value) * strength)).join(" ")})`;

export interface ScheduleArtworkProps {
  seconds: number;
  cues: readonly ScheduleNumberCue[];
  reducedMotion?: boolean;
  style?: React.CSSProperties;
}

/** Prepares the original schedule illustration as a still source scene and
 * mounts cue-owned SVG text over its blank screen. The character is never
 * passed through the context rig, so its original geometry and CTM stay fixed. */
export function prepareScheduleArtwork(svg: SVGSVGElement, cues: readonly ScheduleNumberCue[]): LibrarySvgRig {
  if (cues.some(cue => cue.unit !== "day" || cue.numbers.some(value => !Number.isInteger(value) || value < 1 || value > DATE_COUNT)))
    throw new Error("This 31-day calendar requires explicit day cues in 1–31; week cues need a separate mapping");
  // Keep the established source removals and getBBox-derived framing. Its rig
  // deliberately remains unused: this asset's confirmed character direction is still.
  prepareContextArtwork(svg, "context-schedule");
  const schedule = svg.querySelector<SVGGElement>("[id='freepik--Schedule--inject-18']");
  const character = svg.querySelector<SVGGraphicsElement>("[id='freepik--Character--inject-18']");
  if (!schedule || !character) throw new Error("Schedule source anchors changed");

  svg.querySelectorAll("[data-context-layer='blank-source-label-space']").forEach((node) => node.remove());
  character.setAttribute("data-schedule-character", "source-still");
  svg.setAttribute("data-prepared-schedule", "true");

  const display = element("g");
  display.setAttribute("data-schedule-grid", `x=${GRID.x};y=${GRID.y};width=${GRID.width};height=${GRID.height};columns=7;rows=5;first-weekday=Sunday`);
  display.setAttribute("data-schedule-layer", "calendar-dates");
  schedule.append(display);

  const cellWidth = GRID.width / COLUMNS;
  const cellHeight = GRID.height / ROWS;
  WEEKDAYS.forEach((weekday, column) => {
    const heading = element("text");
    heading.textContent = weekday;
    heading.setAttribute("x", String(GRID.x + cellWidth * (column + .5)));
    heading.setAttribute("y", String(GRID.y - 10));
    heading.setAttribute("fill", "#7B8088");
    heading.setAttribute("font-family", "Figtree, Arial, sans-serif");
    heading.setAttribute("font-size", "9.8");
    heading.setAttribute("font-weight", "600");
    heading.setAttribute("text-anchor", "middle");
    heading.setAttribute("data-schedule-weekday", weekday);
    display.append(heading);
  });

  for (let index = 0; index < COLUMNS * ROWS; index++) {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const cell = element("rect");
    cell.setAttribute("x", String(GRID.x + cellWidth * column));
    cell.setAttribute("y", String(GRID.y + cellHeight * row));
    cell.setAttribute("width", String(cellWidth));
    cell.setAttribute("height", String(cellHeight));
    cell.setAttribute("fill", "none");
    cell.setAttribute("data-schedule-coordinate", `row-${row + 1}-column-${column + 1}`);
    if (index < DATE_COUNT) cell.setAttribute("data-schedule-cell", String(index + 1));
    else cell.setAttribute("data-schedule-empty-cell", "true");
    display.append(cell);
  }

  // Each shared grid edge is painted once, keeping the table uniformly faint.
  const lines = element("path");
  const segments = Array.from({length:COLUMNS+1},(_,i)=>`M${GRID.x+cellWidth*i} ${GRID.y}v${GRID.height}`)
    .concat(Array.from({length:ROWS+1},(_,i)=>`M${GRID.x} ${GRID.y+cellHeight*i}h${GRID.width}`));
  lines.setAttribute("d", segments.join(" "));
  lines.setAttribute("fill", "none");
  lines.setAttribute("stroke", "#D8DCE1");
  lines.setAttribute("stroke-width", "0.8");
  lines.setAttribute("data-schedule-grid-lines", "true");
  display.append(lines);

  const numbers = new Map<number, SVGTextElement>();
  for (let value = 1; value <= DATE_COUNT; value++) {
    const index = value - 1;
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const number = element("text");
    number.textContent = String(value);
    const x = GRID.x + cellWidth * (column + .5);
    const y = GRID.y + cellHeight * row + cellHeight * .66;
    number.setAttribute("x", String(x));
    number.setAttribute("y", String(y));
    number.setAttribute("fill", "#1C2B45");
    number.setAttribute("font-family", "Figtree, Arial, sans-serif");
    number.setAttribute("font-size", "20");
    number.setAttribute("font-weight", "700");
    number.setAttribute("text-anchor", "middle");
    number.setAttribute("opacity", "1");
    number.setAttribute("data-schedule-number", String(value));
    number.setAttribute("data-schedule-highlight", "0");
    number.setAttribute("data-schedule-scale", "1");
    number.setAttribute("data-schedule-center-y",String(GRID.y + cellHeight * (row + .5)));
    number.setAttribute("data-schedule-coordinate", `row-${row + 1}-column-${column + 1}`);
    display.append(number);
    numbers.set(value, number);
  }

  return {
    apply(seconds, reducedMotion) {
      const state = scheduleNumberState(cues, seconds, reducedMotion);
      const highlights = new Map(state.numbers.map(({ value, opacity }) => [value, opacity]));
      for (const [value, number] of numbers) {
        const strength = highlights.get(value) ?? 0;
        const scale = reducedMotion ? 1 : 1 + .15 * strength;
        const x = Number(number.getAttribute("x"));
        const y = Number(number.getAttribute("data-schedule-center-y"));
        number.setAttribute("opacity", "1");
        number.setAttribute("fill", colorAt(strength));
        number.setAttribute("transform", scale === 1 ? "" : `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`);
        number.setAttribute("data-schedule-highlight", String(strength));
        number.setAttribute("data-schedule-scale", String(scale));
      }
      svg.setAttribute("data-schedule-seconds", String(seconds));
      svg.setAttribute("data-schedule-unit", state.unit ?? "none");
      svg.setAttribute("data-schedule-week-cue", state.unit === "week" ? "unmapped" : "none");
    },
  };
}

export const ScheduleArtwork: React.FC<ScheduleArtworkProps> = ({ seconds, cues, reducedMotion = false, style }) =>
  <LibrarySvgArtwork artworkId="directed-schedule" publicPath={SOURCE_PATH} expectedSha256={SOURCE_SHA256}
    seconds={seconds} reducedMotion={reducedMotion} style={style}
    prepare={(svg) => prepareScheduleArtwork(svg, cues)} />;
