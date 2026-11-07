// Links inside a drawn diagram. Mermaid writes them as <a xlink:href>, which `getAttribute("href")` doesn't see.

/** The target of the link `target` is in: its href, or an SVG link's xlink:href; undefined when it isn't in a link. */
export function linkTarget(target: Element) {
  const link = target.closest("a");
  return link ? (link.getAttribute("href") ?? link.getAttribute("xlink:href") ?? "") : undefined;
}
