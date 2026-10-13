import assert from "node:assert/strict";
import { externalizeStyles } from "./diagram-assets.mjs";
const id = "architecture-regression";
const wrap = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" id="${id}" viewBox="0 0 100 100">${content}</svg>`;
const compiled = externalizeStyles(
  wrap(
    `<style>#${id} .node rect{fill:#18333e;stroke:#69b7c4}</style><g class="node"><rect style="fill:red;stroke-width:2px"/><text style="undefined;;;undefined">Readable label</text></g>`,
  ),
  id,
);
assert.ok(!/<style| style=/.test(compiled.markup));
assert.ok(
  compiled.css.includes("fill:red !important"),
  "Former inline styles retain cascade priority",
);
assert.ok(
  !compiled.css.includes("undefined"),
  "Discard the ER renderer's invalid declarations as browsers do",
);
assert.ok(compiled.markup.includes("Readable label"));
for (const unsafe of [
  "<script>alert(1)</script>",
  '<rect onclick="alert(1)"/>',
  '<image href="https://example.invalid/image"/>',
  "<foreignObject/>",
  '<style>@import "https://example.invalid/style.css";</style>',
]) {
  assert.throws(
    () => externalizeStyles(wrap(unsafe), id),
    /Unsupported|Unexpected|external/,
  );
}
console.log(
  "PASS: external diagram styles preserve priority/text, discard invalid declarations, and reject active/external content.",
);
