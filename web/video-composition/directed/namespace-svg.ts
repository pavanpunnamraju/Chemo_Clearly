/** Scope imported SVG definitions to one mounted artwork instance.
 * Run after source selectors/preparation, before the first rendered frame.
 */
export function namespaceSvgIds(svg: SVGSVGElement, instanceId: string) {
  const prefix = instanceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const elements = [svg, ...svg.querySelectorAll<SVGElement>("*")];
  const ids = new Map<string, string>();
  for (const element of elements) {
    const id = element.getAttribute("id");
    if (id) ids.set(id, `${prefix}-${id}`);
  }
  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      let value = attribute.value;
      if (attribute.name === "id") value = ids.get(value) ?? value;
      else if (attribute.localName === "href" && value.startsWith("#")) {
        value = `#${ids.get(value.slice(1)) ?? value.slice(1)}`;
      } else if (attribute.name === "aria-labelledby" || attribute.name === "aria-describedby") {
        value = value.split(/\s+/).map((id) => ids.get(id) ?? id).join(" ");
      } else {
        value = value.replace(/url\(\s*(['"]?)#([^\s)'"]+)\1\s*\)/g,
          (match, _quote: string, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : match);
      }
      if (value !== attribute.value) element.setAttributeNS(attribute.namespaceURI, attribute.name, value);
    }
  }
}
