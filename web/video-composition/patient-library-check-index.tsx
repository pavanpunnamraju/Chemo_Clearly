import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Composition, continueRender, delayRender, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { PATIENT_ARTWORK_RECIPES } from "../lib/video/library-patient-motion";
import { LibraryPatientArtwork } from "./directed/LibraryPatientArtwork";

const PatientLibraryCheck: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const root = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const recipes = Object.values(PATIENT_ARTWORK_RECIPES);
  useLayoutEffect(() => {
    const handle = delayRender("Patient library DOM QA");
    let cancelled = false;
    let released = false;
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    const inspect = async () => {
      for (let attempt = 0; attempt < 300; attempt++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        const hosts = [...(root.current?.querySelectorAll<HTMLDivElement>("[data-library-artwork]") ?? [])];
        if (hosts.length !== recipes.length || root.current!.getBoundingClientRect().width < 1 || hosts.some((host) => !host.querySelector("[data-patient-motion-layer]"))) continue;
        // A second layout pass lets each loaded rig apply the requested pose.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const ids = [...root.current!.querySelectorAll("[id]")].map((node) => node.id);
        const instances = hosts.map((host) => {
          const svg = host.querySelector("svg")!;
          const id = host.dataset.libraryArtwork!;
          const layers = [...svg.querySelectorAll("[data-patient-motion-layer]")].map((node) => ({ name: node.getAttribute("data-patient-motion-layer"), transform: node.getAttribute("transform"), opacity: node.getAttribute("opacity") }));
          const unsafeGroups = [...svg.querySelectorAll("[id]")].map((node) => node.id).filter((name) => /--(?:Analysis|background|Shape|Hair|Clouds|Trees|Window|Plant|Desk)--/i.test(name));
          return { id, viewBox: svg.getAttribute("viewBox"), layers, unsafeGroups };
        });
        console.log(`PATIENT_LIBRARY_QA ${JSON.stringify({ frame, uniqueIds: new Set(ids).size === ids.length, instances })}`);
        return;
      }
      throw new Error("Patient library rigs failed to become ready");
    };
    inspect().catch((error: unknown) => console.log(`PATIENT_LIBRARY_QA ${JSON.stringify({ frame, error: String(error) })}`)).finally(release);
    return () => { cancelled = true; release(); };
  }, [frame]);
  return <AbsoluteFill ref={root} style={{ backgroundColor: "#F4F7F6" }}>
    {recipes.map((recipe, index) => <div key={recipe.id} style={{ position: "absolute", left: index % 3 * 640, top: Math.floor(index / 3) * 480, width: 640, height: 480, overflow: "hidden", border: "1px solid #ccd8d5", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", top: 12, left: 20, color: "#1C2B45", fontFamily: "Arial", fontSize: 22 }}>{recipe.id}</div>
      <LibraryPatientArtwork artworkId={recipe.id} seconds={frame / fps} reducedMotion={reducedMotion} style={{ position: "absolute", left: 20, top: 48, width: 600, height: 432 }} />
    </div>)}
  </AbsoluteFill>;
};
registerRoot(() => <Composition id="PatientLibraryCheck" component={PatientLibraryCheck} width={1920} height={1440} fps={30} durationInFrames={361} defaultProps={{ reducedMotion: false }} />);
