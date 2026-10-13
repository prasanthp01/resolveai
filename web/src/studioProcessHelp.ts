import { terminal, type Step, type Result } from "./studioClient";

export type Explanation = {
  receives: string;
  does: string;
  outputs: string;
  errors: string;
  example: string;
};
export type StageGuide = {
  id: string;
  title: string;
  plain: Explanation;
  technical: Explanation;
};
export const stageGuides: StageGuide[] = [
  {
    id: "received",
    title: "Receive the incident",
    plain: {
      receives:
        "Your edited synthetic incident and the browser session that owns the request.",
      does: "Starts an investigation after the request has passed the entry checks. This is where the accepted run becomes visible in the timeline.",
      outputs:
        "A run identifier and a record of the submitted input. Later stages use this accepted copy, not any edits you make afterwards.",
      errors:
        "Invalid input, an expired session, a request that is too large or a busy server can prevent acceptance. No run starts in that case; the editor keeps your input so you can correct it or retry.",
      example:
        "A payment-api incident with 62% errors is accepted as a new temporary run.",
    },
    technical: {
      receives:
        "SimulationStart envelope: schema_version, project_id, mode, preset_id, input, matching seed and client_correlation_id, with session cookie, Origin and CSRF token.",
      does: "POST /simulations applies schema, identity, mode and admission checks before RunStore.execute emits received events. The checkpoint records input.model_dump().",
      outputs:
        "A new accepted run returns HTTP 202, run_id and Location. The received checkpoint records validated input, connector_kind=synthetic and source=server execution.",
      errors:
        "Admission can return 401/403 (identity/origin), 413 (body over 16 KiB), 422 (input), 409 (request-key conflict) or 429 (limits). These are request failures before the nine-stage workflow, not fabricated FAILED events.",
      example:
        "The received stage's full input is in the final output.step_details entry with step_id=received; SSE carries the canonical reference.",
    },
  },
  {
    id: "validated",
    title: "Validate the input",
    plain: {
      receives:
        "The input that already passed the server's rules for types, ranges and allowed choices.",
      does: "Records that the input is valid and creates a fingerprint of it, so the investigation can be traced back to the exact values supplied.",
      outputs:
        "A validation receipt and input fingerprint. This checkpoint records the earlier check; it does not repair or guess invalid values.",
      errors:
        "A percentage above 100, connections above their maximum or an unknown field is rejected before a run begins. Correct the input; the system does not silently replace it.",
      example:
        "Error rate 120 is rejected. Error rate 62 passes and appears in the accepted input.",
    },
    technical: {
      receives:
        "Strict Pydantic SimulationInput, already validated during request parsing, including numeric limits, enum allowlists and cross-field physical bounds.",
      does: "The validated audit stage records schema_version=1.0 and SHA-256 of the accepted input. It declares arbitrary URLs, SQL and credentials forbidden.",
      outputs:
        "input_sha256 plus schema/capability metadata in output.step_details. No coercion, repair loop or LLM-based validation occurs.",
      errors:
        "FastAPI RequestValidationError becomes a typed 422 response before RunStore.start. Malformed JSON can be caught in the editor first; both paths preserve the input for correction.",
      example:
        "db_connections=101 with db_max_connections=100 fails the physical-bounds validator and produces no run-stage events.",
    },
  },
  {
    id: "deduplicated",
    title: "Prevent duplicate work",
    plain: {
      receives:
        "A request key identifying this submission within your anonymous session.",
      does: "Records the duplicate check performed when the request was accepted. Retrying an identical submission with the same key reuses the original run.",
      outputs:
        "One owned run per request key and identical input. Clicking Run investigation normally creates a new key and a separate experiment.",
      errors:
        "Reusing a key with different input is rejected. An expired run requires a new key; a different browser session cannot retrieve someone else's run.",
      example:
        "A network retry with the same key and input returns the original run instead of investigating twice.",
    },
    technical: {
      receives:
        "client_correlation_id, the full parsed request and the signed anonymous owner identity.",
      does: "RunStore.start checks owner + request key before scheduling. Identical model_dump() reuses the run; the deduplicated checkpoint records scope and key.",
      outputs:
        "HTTP 200 with extensions.x_deduplicated=true for an identical retry; HTTP 202 for new work. A reused run retains its existing history rather than adding another deduplication event.",
      errors:
        "Changed payload under the same key returns 409; expired retained key returns 410. Foreign-run reads return 404. The UI does not automatically retry a POST.",
      example:
        "Retry the same request envelope with correlation key demo-1; changing error_rate while retaining demo-1 produces a conflict.",
    },
  },
  {
    id: "severity",
    title: "Assess severity",
    plain: {
      receives: "The percentage of failed requests.",
      does: "Classifies how serious the incident appears: low, medium, high or critical. It does not decide what caused the failures.",
      outputs: "A severity label used in the final impact report.",
      errors:
        "Out-of-range rates cannot reach this stage. If the run is cancelled or unexpectedly stops here, the system reports that interruption rather than inventing a completed report.",
      example:
        "62% errors gives CRITICAL severity even if there is too little evidence to identify a cause.",
    },
    technical: {
      receives: "Validated input.error_rate only.",
      does: "Calls app.policies.severity: rate >=50 CRITICAL; >=10 HIGH; >=1 MEDIUM; otherwise LOW.",
      outputs:
        "technical.input.error_rate, technical.output.severity and threshold metadata in the final step-details entry.",
      errors:
        "Schema validation excludes invalid/non-finite rates before admission. Cancellation or an unexpected exception terminates at the active stage; no default severity is fabricated.",
      example:
        "49.9 maps to HIGH, 50 maps to CRITICAL. Latency and connection pressure do not alter this severity policy.",
    },
  },
  {
    id: "metrics",
    title: "Collect diagnostic signals",
    plain: {
      receives:
        "The accepted database, cache, error, deployment and upstream values, plus any selected failure scenario.",
      does: "Builds synthetic diagnostic evidence from those values. It does not connect to real databases or services.",
      outputs:
        "Numbered evidence records for the alert, database, cache, deployment and upstream service. Later rules cite these records.",
      errors:
        "Connector timeout removes the database evidence but lets the investigation continue with a warning. Workflow timeout stops the run instead; later stages are not reached.",
      example:
        "96 connections out of 100 appears in database evidence E2. With connector timeout, E2 is absent and database health is unknown.",
    },
    technical: {
      receives:
        "SimulationInput metrics and fault; evidence_for derives E1 alert, E2 PostgreSQL, E3 Redis, E4 deployment and E5 upstream records.",
      does: "Emits fixture-derived evidence with provenance. connector_timeout omits E2 and emits FAILED followed by a successful partial metrics checkpoint. workflow_timeout emits WAITING then hits the run deadline.",
      outputs:
        "Evidence references in canonical events; full data in output.evidence_ledger and output.step_details, with partial=true when database evidence is missing.",
      errors:
        "CONNECTOR_TIMEOUT remains in output.faults even if the workflow succeeds. RUN_TIMEOUT ends the run as FAILED. Generated evidence may remain, but it is not a completed diagnostic report.",
      example:
        "A continued connector-timeout run has metrics statuses FAILED → STARTED → SUCCEEDED; that means partial collection, not a recovered database connection.",
    },
  },
  {
    id: "logs",
    title: "Read the safe log sample",
    plain: {
      receives: "The sample log choice selected in your input.",
      does: "Loads only that prepared synthetic message and treats it as evidence to compare with the numbers. Instructions inside a log are never followed.",
      outputs:
        "Log evidence E6, including the chosen sample and a safe excerpt.",
      errors:
        "Unknown log choices are rejected before the run. The instruction-attempt sample is quarantined; it cannot run commands or change the workflow.",
      example:
        "Normal diagnostics can contradict high database pressure and lower confidence in that hypothesis.",
    },
    technical: {
      receives:
        "Allowlisted input.log_fixture and the E6 record created by evidence_for.",
      does: "Records E6 with trusted=false and instructions_executed=false. injection_attempt resolves to a fixed quarantined marker, not executable text.",
      outputs:
        "E6 fixture key, safe excerpt and provenance. Correlation rules inspect the selected fixture alongside metric evidence.",
      errors:
        "Invalid enum values return 422 before admission. A cancellation/deadline stops at the current stage; there is no arbitrary log-fetch fallback.",
      example:
        "log_fixture=normal is recorded as untrusted evidence and may become a contradicting_evidence_id rather than supporting a hypothesis.",
    },
  },
  {
    id: "tools",
    title: "Check tools and safe fallback",
    plain: {
      receives:
        "The permitted synthetic diagnostic capabilities and your selected mock provider failure.",
      does: "Records the allowed tool boundary and tests that retrying a fake review-ticket operation creates only one in-memory record. Nothing is sent to a real ticket system.",
      outputs:
        "A capability record, a simulated duplicate-operation receipt and any fallback warning. Human approval is still required for real action.",
      errors:
        "A simulated provider rate limit or invalid model output produces a warning and continues using deterministic rules. No second model is called. An unexpected workflow error stops the run.",
      example:
        "Choose Provider rate limit (429): the tools stage shows a blocked mock provider, then the rule-based workflow continues.",
    },
    technical: {
      receives:
        "fault, retry_after_seconds, run_id and the synthetic capability allowlist.",
      does: "SyntheticTickets.create(run_id, review-preview) is invoked twice and checked for one record. Provider faults emit BLOCKED; model_fallback is not attempted and workflow_fallback is deterministic rules.",
      outputs:
        "allowed capabilities, executed_business_actions=[], approval=human review required, and attempts=2/records_created=1/external_actions=0. Provider fault details remain in the final result.",
      errors:
        "PROVIDER_RATE_LIMIT or MODEL_OUTPUT_INVALID triggers safe rule continuation. Retry-After is recorded for the mock 429; there is no paid retry. Unexpected failures end as FAILED.",
      example:
        "BLOCKED → STARTED → SUCCEEDED indicates a workflow fallback with a retained warning, not successful live model inference.",
    },
  },
  {
    id: "correlation",
    title: "Compare evidence and causes",
    plain: {
      receives:
        "Validated signals, the available evidence and the selected log sample.",
      does: "Checks five rule-based explanations, looks for contradictions and excludes unrelated evidence. A plausible explanation is a hypothesis, not proof.",
      outputs:
        "Supported or unsupported rule decisions, evidence citations, competing evidence and qualitative confidence.",
      errors:
        "Missing database evidence cannot establish database health or support a database cause. When no rule is supported, the system asks for more evidence. Unexpected computation errors stop the run.",
      example:
        "96/100 connections supports pressure; normal logs weaken confidence. The unrelated high-CPU decoy E7 never supports this incident.",
    },
    technical: {
      receives:
        "SimulationInput and available evidence IDs from the run; correlate evaluates database-pressure, slow-query, cache-pressure, release-regression and upstream-rate-limit.",
      does: "Requires each rule's supporting evidence to exist, records contradictions, and marks confidence limited when contradictions exist or moderate otherwise. E7 is explicitly excluded.",
      outputs:
        "decisions with rule_id/outcome/rationale, supporting and contradicting IDs, excluded_evidence and rules_version. No hypotheses means abstention, not an exception.",
      errors:
        "Absent E2 prevents database-supported conclusions. Unsupported rules remain NOT_SUPPORTED. The enclosing workflow catches unexpected exceptions and returns a failed terminal record.",
      example:
        "Healthy metrics plus normal logs can yield zero supported hypotheses while the run still completes successfully.",
    },
  },
  {
    id: "report",
    title: "Assemble the report",
    plain: {
      receives:
        "The findings, severity, evidence, uncertainty and suggested human checks.",
      does: "Packages the investigation into a readable report and a structured technical result. It keeps warnings visible and never performs the recommended actions.",
      outputs:
        "A summary, impact, hypotheses with citations, confidence, limitations and next steps. A completed workflow can still say that the cause is unknown.",
      errors:
        "Earlier recoverable faults remain warnings. If a timeout, cancellation or unexpected error stops the run, the final record says no report was completed and retains available evidence.",
      example:
        "A connector-timeout run can produce a report with a missing-database warning; a workflow-timeout run produces an interruption record instead.",
    },
    technical: {
      receives:
        "report_for output and evidence IDs, then Run.finish records the terminal state. wire.result adds canonical references, faults, step_details and version provenance.",
      does: "Publishes the completed output at GET /simulations/{run_id}/result. SUCCEEDED describes execution, not resolution of the incident. safety_status remains REVIEW_REQUIRED.",
      outputs:
        "Typed result with output, evidence, errors, warnings, limitations, usage, cost and measured duration. Full diagnostics remain under output.evidence_ledger and output.step_details.",
      errors:
        "Pending result: 409; expired run: 410; unavailable session/run: 401/404. FAILED/CANCELLED records use a no-report summary; the UI must not display missing hypotheses as a successful abstention.",
      example:
        "output.hypotheses=[] with SUCCEEDED means insufficient evidence; the same absent field with FAILED means the report was not produced.",
    },
  },
];

export const finalGuide: { plain: Explanation; technical: Explanation } = {
  plain: {
    receives:
      "The server's final record for the accepted run: its outcome, findings, available evidence and warnings.",
    does: "Explains what the evidence supports, what remains uncertain and what a person should check next. The result belongs to the submitted input, even if you edit the form afterwards.",
    outputs:
      "A report when the investigation completes, or an interruption record when it stops. Expand evidence to inspect its source and compare successive completed runs.",
    errors:
      "Completed with warnings means the workflow continued with limits; it does not mean the failed dependency was repaired. Stopped or cancelled means no complete report. Expired or inaccessible results must be run again; a browser/network error does not prove the server stopped.",
    example:
      "Critical severity with insufficient evidence means many requests failed but the available signals did not establish a plausible cause.",
  },
  technical: {
    receives:
      "The terminal result and ordered events for the same run_id/project_id/mode. Studio validates identity and event completeness before rendering the result.",
    does: "Presents canonical metadata alongside project-specific output. Event references resolve to output.step_details, while evidence refs/hashes resolve to output.evidence_ledger.",
    outputs:
      "Summary/severity/impact, decisions/hypotheses/citations, faults, uncertainty, human actions, version provenance, measured elapsed time and zero-provider usage. Export JSON contains the result plus observed events.",
    errors:
      "SSE failure falls back to polling; event conflicts or gaps are rejected. FAILED/CANCELLED have no completed report. HTTP 409 pending, 410 expired and ownership errors are separate from project fault codes in output.faults; canonical error enums may be broader.",
    example:
      "A SUCCEEDED result can contain CONNECTOR_TIMEOUT in output.faults. It records partial evidence, not a successful connector retry.",
  },
};

export const resultFieldHelp = [
  {
    name: "Run status",
    plain:
      "Whether the investigation completed, stopped or was cancelled. Completed does not mean the service is fixed.",
    technical:
      "result.status is workflow state. SUCCEEDED has an empty errors array; recovered faults remain in warnings and output.faults. FAILED/CANCELLED retain canonical errors and the available diagnostic evidence.",
  },
  {
    name: "Severity and impact",
    plain:
      "Severity comes from failed-request percentage; impact reports synthetic errors and response time. Real affected-user counts are unknown.",
    technical:
      "output.severity uses the error-rate policy; output.impact reports the accepted metrics. These fields may be absent when no report was completed.",
  },
  {
    name: "Hypotheses and confidence",
    plain:
      "Possible explanations supported by the evidence. Moderate or limited confidence is a rule assessment, not a probability or proven root cause.",
    technical:
      "output.hypotheses lists rationale, evidence_ids, contradicting_evidence_ids and qualitative confidence. An empty list in a completed report means abstention.",
  },
  {
    name: "Evidence and contradictions",
    plain:
      "Numbered records show why a finding is plausible and what weakens it. E7 is an unrelated decoy. Missing evidence is not evidence of a healthy system.",
    technical:
      "Canonical evidence contains reference/SHA-256; full records are in output.evidence_ledger. output.decisions explains all five rules, including NOT_SUPPORTED outcomes.",
  },
  {
    name: "Warnings and limitations",
    plain:
      "What failed, what the investigation could not observe and why a person must review the result. Warnings remain even when processing continues.",
    technical:
      "output.faults preserves project codes and stage receipts preserve failed attempts. warnings retains recovered fault messages; errors describes terminal failure. No-report results contain only available evidence and termination information.",
  },
  {
    name: "Human next steps",
    plain:
      "Checks a person could perform next. The simulator does not restart services, change settings, create real tickets or resolve the incident.",
    technical:
      "output.recommended_next_steps is advisory; output.safety.actions_executed is empty. The tools stage only exercises in-memory fake-ticket idempotency.",
  },
  {
    name: "Timing and cost",
    plain:
      "Elapsed server time includes deliberate checkpoints for event delivery and cancellation. External model spend is zero; hosting is excluded.",
    technical:
      "duration_ms is measured elapsed time, including 60 ms pacing per completed stage. usage has zero provider calls/tokens; cost.kind=NONE. This is not LLM thinking time or a production benchmark.",
  },
  {
    name: "Versions and source",
    plain:
      "Identifies which application, fixtures and rules produced the result. All evidence is synthetic and no live model was used.",
    technical:
      "provenance includes app/fixtures/rules/workflow versions and source_revision; model_version/prompt_version are none. An all-zero revision means unconfigured source provenance.",
  },
  {
    name: "Comparison and export",
    plain:
      "Compare the previous result with the new one, then download the evidence and processing history for study. A changed fingerprint alone does not mean the cause changed.",
    technical:
      "The comparison uses severity, hypothesis titles and output.semantic_sha256. The semantic hash includes report provenance such as seed. Export serializes {result, events}; no-report runs should be compared as incomplete.",
  },
];

export function stageOutcome(
  events: Pick<Step, "status">[],
  runStatus?: string,
) {
  const last = events.at(-1);
  const warning = events.some((e) => ["FAILED", "BLOCKED"].includes(e.status));
  if (!last)
    return {
      label: !runStatus
        ? "Not started"
        : terminal(runStatus)
          ? "Not reached / no events recorded"
          : "Waiting to run",
      warning: false,
    };
  if (last.status === "SUCCEEDED")
    return {
      label: warning ? "Completed with a warning" : "Completed",
      warning,
    };
  if (last.status === "FAILED")
    return { label: "Failed — workflow stopped", warning: true };
  if (last.status === "BLOCKED")
    return {
      label: runStatus === "CANCELLED" ? "Cancelled at this stage" : "Blocked",
      warning: true,
    };
  return {
    label: last.status === "WAITING" ? "Waiting" : "In progress",
    warning,
  };
}

export function hasCompletedReport(result: Result | null) {
  return (
    result?.status === "SUCCEEDED" && typeof result.output.severity === "string"
  );
}
export function resultOutcome(result: Result) {
  if (result.status === "CANCELLED") return "Cancelled — no completed report";
  if (result.status === "EXPIRED") return "Expired — run again";
  if (result.status !== "SUCCEEDED") return "Stopped — no completed report";
  return result.warnings.length || result.output.faults.length
    ? "Completed with warnings — review the gaps"
    : "Completed — human review required";
}

/** Summarize only a recorded successful checkpoint, never the current editor. */
export function observedStageOutput(
  id: string,
  events: Step[],
  result: Result | null,
): string | null {
  const success = events.findLast((e) => e.status === "SUCCEEDED");
  if (!success || !result) return null;
  const data = result.output.step_details.find(
    (d) => d.sequence === success.sequence,
  )?.technical;
  if (!data) return null;
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const input = object(data.input);
  switch (id) {
    case "received":
      return `Accepted ${input.service}: ${input.error_rate}% errors and ${input.latency_ms} ms response time.`;
    case "validated":
      return "The accepted input passed validation and its fingerprint was recorded.";
    case "deduplicated":
      return "This run is tied to one request key within its anonymous session.";
    case "severity":
      return `${input.error_rate}% errors produced ${object(data.output).severity} severity.`;
    case "metrics":
      return `${Array.isArray(data.evidence) ? data.evidence.length : 0} metric evidence records collected.${data.partial ? " Database evidence is missing; other signals remain available." : " The configured synthetic metric sources are represented."}`;
    case "logs": {
      const evidence = Array.isArray(data.evidence) ? data.evidence : [];
      const log = object(object(evidence[0]).data);
      return typeof log.excerpt === "string" ? log.excerpt : null;
    }
    case "tools": {
      const ticket = object(data.simulated_ticket_idempotency);
      return `${ticket.attempts} fake-ticket attempts produced ${ticket.records_created} in-memory record; ${ticket.external_actions} external actions.`;
    }
    case "correlation": {
      const decisions = Array.isArray(data.decisions) ? data.decisions : [];
      return `${decisions.filter((d) => object(d).outcome === "SUPPORTED").length} of ${decisions.length} rules supported a hypothesis. Unrelated evidence was excluded.`;
    }
    case "report":
      return typeof object(data.output).summary === "string"
        ? String(object(data.output).summary)
        : null;
    default:
      return null;
  }
}
