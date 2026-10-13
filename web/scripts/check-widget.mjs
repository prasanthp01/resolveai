import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body><h1>Portfolio</h1></body>", {
  url: "https://portfolio.gappazappa.in/projects/resolveai",
});
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "customElements",
  "location",
]) {
  globalThis[name] = dom.window[name];
}
const requests = [];
globalThis.fetch = (url, options) =>
  new Promise((resolve, reject) => {
    requests.push({ url, ...options });
    options.signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
await import("../dist/widget/resolveai-studio.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
const host = document.createElement("resolveai-studio");
host.innerHTML =
  '<p>Loading. <a href="/projects/resolveai/app/studio#simulation">Full studio</a></p>';
document.body.append(host);
assert.ok(
  host.shadowRoot.querySelector("slot"),
  "Fallback must survive until the stylesheet loads",
);
assert.equal(
  requests.length,
  0,
  "Do not discover or start a run before mounting",
);
host.shadowRoot
  .querySelector("link")
  .dispatchEvent(new dom.window.Event("load"));
await tick();
assert.match(host.shadowRoot.textContent, /Loading input schema/);
host.shadowRoot
  .querySelector("link")
  .dispatchEvent(new dom.window.Event("load"));
await tick();
assert.equal(
  requests.length,
  2,
  "A duplicate stylesheet load must not remount or duplicate discovery",
);
assert.equal(
  document.querySelector(".studio"),
  null,
  "Studio must not leak into host CSS scope",
);
assert.equal(requests.length, 2);
assert.equal(requests[0].url, "/api/projects/resolveai/simulation/schema");
assert.equal(
  requests[0].method,
  "GET",
  "Loading the widget must not create a run",
);
host.remove();
assert.equal(
  requests[0].signal.aborted,
  true,
  "Removing a widget must abort its pending request",
);
document.body.append(host);
host.shadowRoot
  .querySelector("link")
  .dispatchEvent(new dom.window.Event("load"));
await tick();
assert.equal(requests.length, 4, "A reattached widget must mount once");
host.remove();
assert.ok(requests.every((request) => request.signal.aborted));
const failed = document.createElement("resolveai-studio");
document.body.append(failed);
failed.shadowRoot
  .querySelector("link")
  .dispatchEvent(new dom.window.Event("error"));
assert.match(
  failed.shadowRoot.querySelector("[role=alert]").textContent,
  /styles could not load/,
);
assert.equal(
  failed.shadowRoot.querySelector("a").getAttribute("href"),
  "/projects/resolveai/app/studio#simulation",
);
assert.equal(requests.length, 4, "An unstyled widget must not issue requests");
failed.remove();
const css = await readFile("dist/widget/resolveai-studio.css", "utf8");
assert.match(css, /\.studio-field-help/);
assert.match(css, /\.studio-final-guide/);
console.log(
  "PASS: production widget isolation, fallback, discovery-only mount, request cleanup, reattachment and stylesheet failure.",
);
dom.window.close();
