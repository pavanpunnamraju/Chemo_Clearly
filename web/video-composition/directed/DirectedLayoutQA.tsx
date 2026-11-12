import { useLayoutEffect, useRef } from "react";
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { loadDirectedFont } from "./DirectedFonts";

/** Reports measured layout from the actual rendering browser, after its fonts
 * settle. QA reads this console event through Remotion's onBrowserLog hook. */
export const DirectedLayoutQA = () => {
  const marker = useRef<HTMLSpanElement>(null);
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  useLayoutEffect(() => {
    const handle = delayRender("Directed layout QA: awaiting fonts and layout");
    let cancelled = false;
    let released = false;
    const release = () => { if (!released) { continueRender(handle); released = true; } };
    loadDirectedFont().then(() => document.fonts.ready).then(async () => {
      if (cancelled) return;
      const root = marker.current?.closest<HTMLElement>("[data-directed-root]");
      if (!root) throw new Error("Directed layout QA: composition root missing");
      // Remotion can mount hidden composition copies before applying their
      // viewport. Measure our own instance only, once its layout is visible.
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        if (root.getBoundingClientRect().width > 1 && root.getBoundingClientRect().height > 1) break;
      }
      const viewport = root.getBoundingClientRect();
      if (viewport.width <= 1 || viewport.height <= 1) throw new Error("Directed layout QA: composition viewport remained hidden");
      const factor = width / viewport.width;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-qa-text]"));
      const texts = nodes.map((node, index) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const box = { x: (rect.x - viewport.x) * factor, y: (rect.y - viewport.y) * factor, width: rect.width * factor, height: rect.height * factor };
        return {
          index,
          role: node.getAttribute("data-qa-text"),
          region: node.closest("[data-qa-region]")?.getAttribute("data-qa-region"),
          text: node.textContent ?? "",
          rect: box,
          fontSize: parseFloat(style.fontSize),
          lineHeight: style.lineHeight,
          fontFamily: style.fontFamily,
          color: style.color,
          overflowX: /hidden|clip|auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 3,
          overflowY: /hidden|clip|auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 3,
          outsideViewport: box.x < -.5 || box.y < -.5 || box.x + box.width > width + .5 || box.y + box.height > height + .5,
        };
      });
      const overlaps: { a: number; b: number; kind: "caption-scene" | "text-text"; width: number; height: number }[] = [];
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i]!;
        const b = texts[j]!;
        const overlapWidth = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x);
        const overlapHeight = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y);
        if (overlapWidth > 1 && overlapHeight > 1) overlaps.push({ a: i, b: j, kind: a.region === "captions" || b.region === "captions" ? "caption-scene" : "text-text", width: overlapWidth, height: overlapHeight });
      }
      const attributes = (selector: string, attribute: string) => [...root.querySelectorAll(selector)].map((node) => node.getAttribute(attribute));
      console.log(`DIRECTED_LAYOUT_QA ${JSON.stringify({ frame, viewport: { width, height }, texts, overlaps,
        artworkBeats: attributes("[data-artwork-beat]", "data-artwork-beat"),
        libraryArtwork: attributes("[data-library-artwork]", "data-library-artwork"),
        approvedArtwork: attributes("[data-approved-artwork]", "data-approved-artwork"),
        genericRigCount: root.querySelectorAll('[data-joint="shoulder-elbow-wrist"]').length })}`);
    }).catch((error: unknown) => {
      console.log(`DIRECTED_LAYOUT_QA ${JSON.stringify({ frame, error: String(error) })}`);
    }).finally(release);
    return () => { cancelled = true; release(); };
  }, [frame, width, height]);
  return <span ref={marker} style={{ display: "none" }} />;
};
