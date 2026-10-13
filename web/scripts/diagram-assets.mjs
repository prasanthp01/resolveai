import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { JSDOM } from "jsdom";

export const output = new URL("../src/diagrams/", import.meta.url);
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

export async function diagramSources() {
  const directory = new URL("../../architecture/versions/", import.meta.url);
  const sources = new Map();
  let count = 0;
  for (const file of (await fs.readdir(directory)).sort()) {
    if (!file.endsWith(".json")) continue;
    const record = JSON.parse(
      await fs.readFile(new URL(file, directory), "utf8"),
    );
    for (const group of [record.high_level, record.low_level]) {
      for (const [key, value] of Object.entries(group)) {
        if (!key.endsWith("diagram")) continue;
        count++;
        sources.set(sha256(value), value);
      }
    }
  }
  return { sources, count };
}

// Only version-controlled diagrams enter this build step. Runtime API text is
// never rendered or inserted as markup; it must match a compiled source exactly.
export function externalizeStyles(raw, id) {
  const dom = new JSDOM(raw, { contentType: "image/svg+xml" });
  const svg = dom.window.document.documentElement;
  if (svg.localName !== "svg" || svg.id !== id)
    throw new Error("Unexpected diagram root");
  const rules = [];
  for (const style of svg.querySelectorAll("style")) {
    rules.push(style.textContent);
    style.remove();
  }
  let index = 0;
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    if (
      ["script", "foreignObject", "iframe", "image", "a", "use"].includes(
        element.localName,
      )
    ) {
      throw new Error(
        `Unsupported active or external SVG element: ${element.localName}`,
      );
    }
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || /href$/i.test(attribute.name)) {
        throw new Error("Unexpected SVG event handler or reference");
      }
    }
    if (!element.hasAttribute("style")) continue;
    // Parse through CSSOM: Mermaid's ER renderer can emit invalid fragments
    // such as "undefined;;;undefined", which browsers discard. Preserve the
    // priority of valid former-inline declarations over Mermaid's selectors.
    const style = Array.from(element.style)
      .map(
        (property) =>
          `${property}:${element.style.getPropertyValue(property)} !important;`,
      )
      .join("");
    element.removeAttribute("style");
    if (!style || element === svg) continue; // The app owns responsive root sizing.
    const className = `${id}-style-${index++}`;
    element.classList.add(className);
    rules.push(`#${id} .${className}{${style}}`);
  }
  const css = rules.join("\n");
  if (/@import|@font-face|javascript:|https?:|data:/i.test(css)) {
    throw new Error("Diagram CSS must not reference external content");
  }
  for (const match of css.matchAll(/url\(([^)]+)\)/g)) {
    if (!/^["']?#[\w-]+["']?$/.test(match[1].trim()))
      throw new Error("Nonlocal SVG paint reference");
  }
  if (svg.querySelector("style,[style]"))
    throw new Error("Inline SVG styling remains");
  if (!svg.getAttribute("viewBox"))
    throw new Error("Diagram has no scalable viewBox");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  const markup = svg.outerHTML;
  dom.window.close();
  return { markup, css };
}
