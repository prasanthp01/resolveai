import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { JSDOM } from "jsdom";
import { diagramSources, output, sha256 } from "./diagram-assets.mjs";

const { sources, count } = await diagramSources();
const manifest = JSON.parse(
  await fs.readFile(new URL("manifest.json", output), "utf8"),
);
const css = await fs.readFile(new URL("diagrams.css", output), "utf8");
assert.equal(
  sha256(css),
  manifest.stylesheet_sha256,
  "Generated diagram CSS changed; regenerate assets",
);
assert.deepEqual(
  Object.keys(manifest.diagrams).sort(),
  [...sources.keys()].sort(),
  "Architecture diagrams changed; run npm run diagrams:generate",
);
for (const [hash, source] of sources) {
  const item = manifest.diagrams[hash];
  assert.equal(item.source, source);
  assert.equal(item.file, `${hash}.svg`);
  const svg = await fs.readFile(new URL(item.file, output), "utf8");
  assert.equal(sha256(svg), item.svg_sha256);
  const dom = new JSDOM(svg, { contentType: "image/svg+xml" });
  const root = dom.window.document.documentElement;
  assert.equal(root.id, `architecture-${hash}`);
  assert.equal(
    root.querySelectorAll(
      "style,[style],script,foreignObject,iframe,image,a,use",
    ).length,
    0,
    "SVG must contain no inline styles or active/external content",
  );
  assert.ok(
    root.querySelector("text"),
    "Diagram must retain readable SVG text",
  );
  assert.ok(
    css.includes(`#${root.id}`),
    "Diagram needs matching external styles",
  );
  assert.ok(root.getAttribute("viewBox"));
  dom.window.close();
}
console.log(
  `PASS: ${count} versioned diagrams map to ${sources.size} checksum-pinned SVGs with external CSS and no inline styling.`,
);
