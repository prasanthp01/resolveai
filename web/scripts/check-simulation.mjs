// Browser-model contract checks against captured backend receipts; no browser required.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/simulationEngine.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
});
const { simulate, severity } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const scenarios = JSON.parse(await readFile("../demo/scenarios.json", "utf8"));
const receipts = await Promise.all(
  scenarios.map(async (s) =>
    JSON.parse(await readFile(`../demo/simulations/${s.slug}.json`, "utf8")),
  ),
);
const fixtures = scenarios.map((s, i) => ({
  ...s,
  evidence: receipts[i].evidence,
  report: receipts[i].analysis.report,
}));
let checks = 0;
function eq(a, b) {
  assert.deepEqual(a, b);
  checks++;
}
function run(payload, options = {}) {
  return simulate(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    options.auth ?? true,
    options.fault || "none",
    fixtures,
    options.saved || new Map(),
  );
}
for (let i = 0; i < receipts.length; i++) {
  const capture = receipts[i];
  const body = capture.request.body;
  const memory = new Map();
  const first = run(body, { saved: memory });
  eq(first.httpStatus, capture.accepted.http_status);
  eq(first.outcome, capture.final_response.body.status);
  eq(
    first.stages.map((s) => s.status),
    [
      "RECEIVED",
      "QUEUED",
      "INVESTIGATING",
      "EVIDENCE_READY",
      "HYPOTHESIS_SUPPORTED",
      "REPORT_READY",
    ],
  );
  for (const key of [
    "summary",
    "severity",
    "impact",
    "uncertainty",
    "recommended_next_steps",
    "investigation_mode",
  ])
    eq(first.report[key], capture.analysis.report[key]);
  eq(
    first.report.hypotheses.map((h) => [h.title, h.rationale]),
    capture.analysis.report.hypotheses.map((h) => [h.title, h.rationale]),
  );
  eq(
    first.evidence.map((e) => [e.source, e.data]),
    capture.evidence.map((e) => [e.source, e.data]),
  );
  eq(
    first.report.hypotheses.every((h) =>
      h.evidence_ids.every((ref) => first.evidence.some((e) => e.id === ref)),
    ),
    true,
  );
  const duplicate = run(body, { saved: memory });
  eq(duplicate.httpStatus, capture.edge_cases.duplicate.http_status);
  eq(duplicate.incidentId, first.incidentId);
  eq(memory.size, 1);
  eq(
    run({ ...body, message: "changed" }, { saved: memory }).httpStatus,
    capture.edge_cases.conflict.http_status,
  );
  eq(
    run({ ...body, error_rate: 101 }).httpStatus,
    capture.edge_cases.invalid.http_status,
  );
  eq(
    run(body, { auth: false }).httpStatus,
    capture.edge_cases.unauthorized.http_status,
  );
  const lease = run(body, { fault: "lease" });
  eq(
    lease.stages[2].output.stale_worker_saved,
    capture.edge_cases.lease_recovery.stale_worker_saved,
  );
  eq(
    lease.stages[2].output.claim_version,
    capture.edge_cases.lease_recovery.new_claim_version,
  );
  eq(lease.outcome, "REPORT_READY");
  for (const fault of ["timeout", "citation"]) {
    const failed = run(body, { fault });
    eq(failed.outcome, "NEEDS_REVIEW");
    eq(failed.report, undefined);
    eq(
      failed.stages.at(-1).output.attempts.map((a) => a.job_status),
      ["RETRY_SCHEDULED", "RETRY_SCHEDULED", "DEAD_LETTER"],
    );
  }
}
const body = receipts[0].request.body;
for (const [rate, expected] of [
  [0, "LOW"],
  [0.5, "LOW"],
  [1, "MEDIUM"],
  [9.9, "MEDIUM"],
  [10, "HIGH"],
  [49.9, "HIGH"],
  [50, "CRITICAL"],
  [100, "CRITICAL"],
]) {
  eq(severity(rate), expected);
  eq(run({ ...body, error_rate: rate }).report.severity, expected);
}
for (const bad of [
  { error_rate: -1 },
  { error_rate: null },
  { error_rate: "oops" },
  { service: " " },
  { message: "x".repeat(2001) },
  { event_id: "" },
  { arbitrary_url: "https://example.invalid" },
  { scenario: "nope" },
  { mode: "unknown" },
  { observed_at: "2026-01-01T12:00:00" },
]) {
  const memory = new Map();
  const invalid = run({ ...body, ...bad }, { saved: memory });
  eq(invalid.httpStatus, 422);
  eq(invalid.stages.length, 2);
  eq(memory.size, 0);
}
eq(run('{ "broken": }').httpStatus, 422);
eq(run("null").httpStatus, 422);
eq(run("[]").httpStatus, 422);
eq(run("x".repeat(32769)).httpStatus, 413);
eq(run({ ...body, scenario: null }).outcome, "NEEDS_REVIEW");
eq(run({ ...body, scenario: null }).report.hypotheses, []);
eq(run({ ...body, mode: "live" }).httpStatus, null);
eq(run({ ...body, error_rate: "32" }).report.severity, "HIGH");
const redacted = JSON.stringify(
  run({
    ...body,
    service: "test@example.invalid",
    message: "password=do-not-export Bearer confidential-token",
  }),
);
eq(redacted.includes("test@example.invalid"), false);
eq(redacted.includes("do-not-export"), false);
eq(redacted.includes("confidential-token"), false);
console.log(
  `PASS: ${checks} simulation assertions; 4 captured backend comparisons, validation, states, citations, faults and redaction.`,
);
