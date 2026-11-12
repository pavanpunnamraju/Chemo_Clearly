import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { namespaceSvgIds } from "./namespace-svg";

export interface LibrarySvgRig { apply: (seconds: number, reducedMotion: boolean) => void }
export interface LibrarySvgArtworkProps {
  artworkId: string;
  publicPath: string;
  expectedSha256?: string;
  seconds: number;
  reducedMotion?: boolean;
  prepare: (svg: SVGSVGElement) => LibrarySvgRig;
  style?: React.CSSProperties;
}

/** Local SVG loading shared by the library recipes. Preparation runs while the
 * SVG is mounted (getBBox and path lengths work); animation runs before render
 * is released. The caller owns source-specific layer selection and camera. */
export const LibrarySvgArtwork: React.FC<LibrarySvgArtworkProps> = ({ artworkId, publicPath, expectedSha256,
  seconds, reducedMotion = false, prepare, style }) => {
  const instance = useId();
  const host = useRef<HTMLDivElement>(null);
  const rig = useRef<LibrarySvgRig | null>(null);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const handle = useRef<number | null>(null);
  const [ready, setReady] = useState(0);
  useLayoutEffect(() => {
    let cancelled = false;
    const waiting = delayRender(`Preparing library artwork: ${artworkId}`);
    handle.current = waiting;
    rig.current = null;
    fetch(staticFile(publicPath)).then(async (response) => {
      if (!response.ok) throw new Error(`Missing library artwork: ${publicPath}`);
      const bytes = await response.arrayBuffer();
      if (expectedSha256) {
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        if (hash !== expectedSha256) throw new Error(`Library source changed; inspect its rig before rendering: ${artworkId}`);
      }
      return new TextDecoder().decode(bytes);
    }).then((source) => {
      if (cancelled) return;
      const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
      if (parsed.querySelector("parsererror")) throw new Error(`Invalid SVG: ${artworkId}`);
      const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
      host.current!.replaceChildren(svg);
      rig.current = prepareRef.current(svg);
      // Some supplied Storyset groups share original IDs. Preserve selector and
      // paint-order behavior during preparation, then make mounted IDs unique.
      const seen = new Map<string, number>();
      for (const node of [svg, ...svg.querySelectorAll<SVGElement>("[id]")]) {
        const id = node.id;
        if (!id) continue;
        const count = seen.get(id) ?? 0;
        seen.set(id, count + 1);
        if (count) node.id = `${id}-duplicate-${count}`;
      }
      namespaceSvgIds(svg, `library-${artworkId}-${instance}`);
      svg.style.width = "100%"; svg.style.height = "100%";
      svg.setAttribute("role", "img");
      setReady((value) => value + 1);
    }).catch((error) => { if (!cancelled) cancelRender(error); });
    return () => { cancelled = true; continueRender(waiting); };
  }, [artworkId, publicPath, expectedSha256, instance]);
  useLayoutEffect(() => {
    if (!rig.current) return;
    rig.current.apply(seconds, reducedMotion);
    if (handle.current !== null) continueRender(handle.current);
  }, [ready, seconds, reducedMotion]);
  return <div ref={host} data-library-artwork={artworkId} style={{ width: "100%", height: "100%", ...style }} />;
};
