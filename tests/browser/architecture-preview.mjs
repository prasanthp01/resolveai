// Local-only static preview with the independent review's unmodified CSP.
// No production routes/configuration are changed by this helper.
import { createServer, request } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const portfolio = resolve(process.env.PORTFOLIO_ROOT);
const assets = resolve(process.env.APP_ASSET_ROOT || "web/dist");
const port = Number(process.env.PORT || 21480);
const apiPort = Number(process.env.API_PORT || 21436);
const faultFile = process.env.ARCHITECTURE_FAULT_FILE;
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
const probe = `const violations=[];
const update=()=>{const out=document.getElementById('architecture-csp-receipt');if(out)out.textContent=JSON.stringify({violations});};
document.addEventListener('securitypolicyviolation',event=>{violations.push({directive:event.effectiveDirective,blocked_uri:event.blockedURI,disposition:event.disposition,source_file:event.sourceFile,line:event.lineNumber,column:event.columnNumber,sample:event.sample});update();});
document.addEventListener('DOMContentLoaded',()=>{const out=document.createElement('output');out.id='architecture-csp-receipt';out.setAttribute('aria-label','Local CSP verification');document.body.append(out);update();});`;

createServer(async (req, res) => {
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path === "/__architecture_qa/control") {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
    res.end(
      '<!doctype html><html><head><title>CSP control</title><script src="/__architecture_qa/probe.js"></script></head><body><h1>CSP control: no application scripts or styles</h1></body></html>',
    );
    return;
  }
  if (path === "/__architecture_qa/probe.js") {
    res.writeHead(200, {
      "Content-Type": "text/javascript",
      "Cache-Control": "no-store",
    });
    res.end(probe);
    return;
  }
  if (path.startsWith("/api/projects/resolveai/")) {
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: apiPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      async (response) => {
        if (
          faultFile &&
          /\/architecture\/[^/]+$/.test(path) &&
          (await stat(faultFile).then(
            () => true,
            () => false,
          ))
        ) {
          const chunks = [];
          for await (const chunk of response) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString());
          body.high_level.diagram =
            "UNCOMPILED LOCAL TEST: <script>not executable</script>";
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(body));
          return;
        }
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(503);
      res.end("Local API unavailable");
    });
    req.pipe(upstream);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const prefix = "/projects/resolveai/app/";
    const isApp = path.startsWith(prefix);
    const root = isApp ? assets : portfolio;
    const relative = isApp ? path.slice(prefix.length) : path;
    let filename = resolve(
      root,
      "." + (relative.startsWith("/") ? relative : "/" + relative),
    );
    if (isApp && !extname(relative)) filename = resolve(root, "index.html");
    if (filename !== root && !filename.startsWith(root + sep))
      throw new Error();
    if ((await stat(filename)).isDirectory())
      filename = resolve(filename, "index.html");
    let data = await readFile(filename);
    if (extname(filename) === ".html")
      data = Buffer.from(
        data
          .toString()
          .replace(
            "<head>",
            '<head><script src="/__architecture_qa/probe.js"></script>',
          ),
      );
    res.writeHead(200, {
      "Content-Type": mime[extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Strict-CSP architecture preview on loopback port ${port}`),
);
