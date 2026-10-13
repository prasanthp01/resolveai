import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  diagramSources,
  externalizeStyles,
  output,
  sha256,
} from "./diagram-assets.mjs";

const browser = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!browser)
  throw new Error(
    "Set PUPPETEER_EXECUTABLE_PATH to an installed Chromium executable. No browser is downloaded by this command.",
  );
await fs.access(browser);
const temporary = new URL("../work/diagram-render/", import.meta.url);
await fs.mkdir(temporary, { recursive: true });
await fs.mkdir(output, { recursive: true });
const config = {
  startOnLoad: false,
  suppressErrorRendering: true,
  securityLevel: "strict",
  deterministicIds: true,
  theme: "base",
  htmlLabels: false,
  themeVariables: {
    primaryColor: "#18333e",
    secondaryColor: "#1b3340",
    tertiaryColor: "#11232d",
    clusterBkg: "#152831",
    clusterBorder: "#416778",
    edgeLabelBackground: "#162d38",
    primaryTextColor: "#ebf4f8",
    lineColor: "#69b7c4",
    signalColor: "#9cdace",
    signalTextColor: "#ebf4f8",
    actorBorder: "#69b7c4",
    actorTextColor: "#ebf4f8",
    actorLineColor: "#416778",
    fontFamily: "Arial, sans-serif",
    fontSize: "15px",
  },
  flowchart: { htmlLabels: false },
};
const configPath = new URL("mermaid.json", temporary);
const browserPath = new URL("browser.json", temporary);
await fs.writeFile(configPath, JSON.stringify(config));
await fs.writeFile(
  browserPath,
  JSON.stringify({
    executablePath: browser,
    args: ["--disable-background-networking"],
  }),
);
const { sources, count } = await diagramSources();
const manifest = { format: 1, diagrams: {}, stylesheet_sha256: "" };
const styles = [];
const execute = promisify(execFile);
for (const [hash, source] of sources) {
  const input = new URL(`${hash}.mmd`, temporary);
  const raw = new URL(`${hash}.svg`, temporary);
  const id = `architecture-${hash}`;
  await fs.writeFile(input, source);
  await execute(
    fileURLToPath(new URL("../node_modules/.bin/mmdc", import.meta.url)),
    [
      "-i",
      fileURLToPath(input),
      "-o",
      fileURLToPath(raw),
      "-I",
      id,
      "-c",
      fileURLToPath(configPath),
      "-p",
      fileURLToPath(browserPath),
      "-b",
      "transparent",
      "-q",
    ],
    { timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  const { markup, css } = externalizeStyles(await fs.readFile(raw, "utf8"), id);
  await fs.writeFile(new URL(`${hash}.svg`, output), markup + "\n");
  styles.push(css);
  manifest.diagrams[hash] = {
    source,
    file: `${hash}.svg`,
    svg_sha256: sha256(markup + "\n"),
  };
  console.log(`Compiled ${hash.slice(0, 12)}`);
}
const stylesheet = styles.join("\n") + "\n";
manifest.stylesheet_sha256 = sha256(stylesheet);
await fs.writeFile(new URL("diagrams.css", output), stylesheet);
await fs.writeFile(
  new URL("manifest.json", output),
  JSON.stringify(manifest, null, 2) + "\n",
);
// Remove only obsolete generated diagram files, never source or other assets.
for (const filename of await fs.readdir(output)) {
  if (
    /^[a-f0-9]{64}\.svg$/.test(filename) &&
    !manifest.diagrams[filename.slice(0, -4)]
  ) {
    await fs.unlink(new URL(filename, output));
  }
}
console.log(
  `Generated ${sources.size} distinct assets for ${count} versioned diagrams.`,
);
