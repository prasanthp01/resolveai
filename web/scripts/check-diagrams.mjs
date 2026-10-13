import fs from "node:fs/promises";
import { JSDOM } from "jsdom";
const dom = new JSDOM("");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const mermaid = (await import("mermaid")).default;
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
});
const root = new URL("../../architecture/versions/", import.meta.url);
let count = 0;
for (const file of await fs.readdir(root)) {
  if (!file.endsWith(".json")) continue;
  const record = JSON.parse(await fs.readFile(new URL(file, root), "utf8"));
  for (const group of [record.high_level, record.low_level]) {
    for (const [key, value] of Object.entries(group)) {
      if (key.endsWith("diagram")) {
        await mermaid.parse(value);
        count++;
      }
    }
  }
}
console.log(`Validated ${count} versioned Mermaid diagrams.`);
