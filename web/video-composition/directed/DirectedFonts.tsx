import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

let fontReady: Promise<FontFace> | undefined;
export function loadDirectedFont(): Promise<FontFace> {
  if (!fontReady) {
    const font = new FontFace("Figtree", `url(${staticFile("fonts/figtree-latin-v9.woff2")})`, { weight: "300 900", style: "normal" });
    document.fonts.add(font);
    fontReady = font.load();
  }
  return fontReady;
}
export const DirectedFonts = () => {
  const [handle] = useState(() => delayRender("Loading bundled Figtree font"));
  useEffect(() => {
    loadDirectedFont().then(() => continueRender(handle)).catch(cancelRender);
  }, [handle]);
  return null;
};
