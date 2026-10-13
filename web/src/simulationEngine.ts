import type { Evidence, Report, Scenario } from "./api";

export type Fault = "none" | "timeout" | "lease" | "citation";
export type Stage = {
  title: string;
  status: string;
  plain: string;
  technical: string;
  input: unknown;
  output: unknown;
  code: string;
};
export type Run = {
  id: string;
  outcome: string;
  httpStatus: number | null;
  stages: Stage[];
  report?: Report;
  evidence?: Evidence[];
  incidentId?: string;
  duplicate?: boolean;
};
export type Saved = { canonical: string; run: Run };
type Payload = {
  event_id: string;
  service: string;
  message: string;
  error_rate: number;
  mode?: string;
  scenario?: string | null;
  observed_at?: string;
};
type Field = { field: string; type: string };
const id = () => crypto.randomUUID();
export const severity = (rate: number) =>
  rate >= 50 ? "CRITICAL" : rate >= 10 ? "HIGH" : rate >= 1 ? "MEDIUM" : "LOW";

export function redact(value: string) {
  return value
    .replace(
      /("(?:password|api[_-]?key|token|secret)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[REDACTED]"',
    )
    .replace(/(bearer\s+)[\w.\-]+/gi, "$1[REDACTED]")
    .replace(
      /((?:password|api[_-]?key|token|secret)\s*[=:]\s*)[^\s,;"}]+/gi,
      "$1[REDACTED]",
    )
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(
      /\b(?:postgres(?:ql)?|redis|https?):\/\/[^\s"<>]+/g,
      "[URL REDACTED]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[API KEY]")
    .slice(0, 12000);
}

export function simulate(
  raw: string,
  authenticated: boolean,
  fault: Fault,
  fixtures: Scenario[],
  saved: Map<string, Saved>,
): Run {
  const requestId = id();
  const stages: Stage[] = [
    {
      title: "Receive the alert",
      status: "RECEIVED",
      plain:
        "A monitoring tool reports a problem. This lab keeps the edited request in this browser tab. Clicking Run does not send it to a server.",
      technical:
        "The private integration contract is POST /api/v1/events with JSON and a scoped Bearer credential. This browser models that contract using a synthetic identity.",
      input: {
        method: "POST",
        path: "/api/v1/events",
        redacted_request_body: redact(raw),
        authentication: authenticated
          ? "Synthetic valid credential"
          : "Missing credential",
      },
      output: {
        request_id: requestId,
        body_bytes: new TextEncoder().encode(raw).length,
      },
      code: "app/main.py · guards / events",
    },
  ];
  function rejected(
    status: number | null,
    code: string,
    message: string,
    fields: Field[] = [],
  ): Run {
    const hints = fields
      .map(({ field, type }) => {
        const name =
          field.replace(/^body\.?/, "").replaceAll("_", " ") || "request";
        if (type === "json_invalid")
          return "The JSON has a syntax error; check its quotes, commas and brackets.";
        if (field === "body.error_rate")
          return "Error rate must be a number from 0 to 100.";
        if (type === "missing") return `Add the required ${name} field.`;
        if (type === "string_too_short") return `${name} cannot be empty.`;
        if (type === "string_too_long")
          return `${name} exceeds its maximum length.`;
        if (type === "extra_forbidden")
          return `${name} is not an allowed request field; remove it.`;
        if (field === "body.observed_at")
          return "Use a valid ISO date and time with a timezone, such as 2026-01-15T12:00:00Z.";
        if (type === "literal_error")
          return `Choose a supported ${name} value from the sample input.`;
        return `Check the type and value of ${name}.`;
      })
      .join(" ");
    stages.push({
      title: "Check the request",
      status: "REJECTED",
      plain: `${hints || (status === 409 ? "This event ID already belongs to a different alert. Use New event ID for the changed request." : status === 401 ? "No access credential was supplied. Select a valid synthetic credential." : message + ".")} No new incident or investigation job is created. Fix the input and run again.`,
      technical:
        status === null
          ? "This is a lab restriction, not a private API response. Live mode needs separately configured private connectors and a model."
          : `The modeled handler returns ${status}. No worker is claimed. Field errors identify the rejected input; the API does not echo sensitive values.`,
      input: { submitted_fields: fields.map((f) => f.field) },
      output: {
        http_status: status,
        body: {
          code,
          message,
          ...(fields.length ? { fields } : {}),
          request_id: requestId,
        },
      },
      code: "app/schemas/contracts.py · IncidentCreate; app/main.py · validation_error",
    });
    return { id: requestId, outcome: "REJECTED", httpStatus: status, stages };
  }
  if (new TextEncoder().encode(raw).length > 32768)
    return rejected(413, "413", "Request body too large");
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    return rejected(422, "VALIDATION_ERROR", "Invalid request fields", [
      { field: "body", type: "json_invalid" },
    ]);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return rejected(422, "VALIDATION_ERROR", "Invalid request fields", [
      { field: "body", type: "model_attributes_type" },
    ]);
  }
  const fields: Field[] = [];
  const allowed = [
    "event_id",
    "service",
    "message",
    "error_rate",
    "mode",
    "scenario",
    "observed_at",
  ];
  const error = (key: string, type: string) =>
    fields.push({ field: "body." + key, type });
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) error(key, "extra_forbidden");
  for (const [key, max] of [
    ["event_id", 100],
    ["service", 100],
    ["message", 2000],
  ] as const) {
    if (!(key in value)) error(key, "missing");
    else if (typeof value[key] !== "string") error(key, "string_type");
    else {
      value[key] = value[key].trim();
      const length = [...(value[key] as string)].length;
      if (!length) error(key, "string_too_short");
      if (length > max) error(key, "string_too_long");
    }
  }
  if (!("error_rate" in value)) error("error_rate", "missing");
  else {
    const rate = value.error_rate;
    const number =
      typeof rate === "number" ||
      typeof rate === "boolean" ||
      (typeof rate === "string" && rate.trim())
        ? Number(rate)
        : NaN;
    if (!Number.isFinite(number)) error("error_rate", "float_parsing");
    else if (number < 0) error("error_rate", "greater_than_equal");
    else if (number > 100) error("error_rate", "less_than_equal");
    else value.error_rate = number;
  }
  if ("mode" in value && !["fixture", "live"].includes(value.mode as string))
    error("mode", "literal_error");
  if (
    value.scenario !== undefined &&
    value.scenario !== null &&
    !fixtures.some((s) => s.slug === value.scenario)
  )
    error("scenario", "literal_error");
  if ("observed_at" in value) {
    // The lab intentionally accepts only explicit ISO timestamps, documented in the editor.
    if (
      typeof value.observed_at !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(
        value.observed_at,
      ) ||
      !Number.isFinite(Date.parse(value.observed_at)) ||
      Number(value.observed_at.slice(11, 13)) > 23 ||
      Number(value.observed_at.slice(14, 16)) > 59 ||
      Number(value.observed_at.slice(17, 19).replace(/\D/g, "") || 0) > 59 ||
      Number(value.observed_at.slice(8, 10)) >
        new Date(
          Date.UTC(
            Number(value.observed_at.slice(0, 4)),
            Number(value.observed_at.slice(5, 7)),
            0,
          ),
        ).getUTCDate()
    ) {
      error("observed_at", "timezone_aware_iso_required_by_lab");
    } else value.observed_at = new Date(value.observed_at).toISOString();
  }
  if (fields.length)
    return rejected(422, "VALIDATION_ERROR", "Invalid request fields", fields);
  if (!authenticated) return rejected(401, "401", "Integration token required");
  const payload = value as Payload;
  if (payload.mode === "live")
    return rejected(
      null,
      "LAB_MODE_DISABLED",
      "Use fixture mode in this public lab",
    );
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, value[k]]),
    ),
  );
  const previous = saved.get(payload.event_id);
  if (previous) {
    if (previous.canonical !== canonical)
      return rejected(409, "409", "Event ID reused with a different payload");
    stages.push({
      title: "Reuse the existing incident",
      status: "DUPLICATE",
      plain:
        "This exact alert was already accepted in this tab. ResolveAI returns the original incident instead of scheduling the same work again.",
      technical:
        "Deduplication is scoped to the integration source and event_id. The normalized payload matches. The lab's tab-local map stands in for the database unique constraint and payload hash.",
      input: { event_id: payload.event_id },
      output: {
        http_status: 200,
        body: {
          id: previous.run.incidentId,
          status: previous.run.outcome,
          duplicate: true,
        },
      },
      code: "app/services/incidents.py · ingest",
    });
    return {
      ...previous.run,
      id: requestId,
      httpStatus: 200,
      stages,
      duplicate: true,
    };
  }
  const incidentId = id();
  const jobId = id();
  const level = severity(payload.error_rate);
  const stamp = new Date().toISOString();
  const fixture = fixtures.find((s) => s.slug === payload.scenario);
  stages.push({
    title: "Validate and queue",
    status: "QUEUED",
    plain: `The alert is accepted and marked ${level.toLowerCase()} priority because it reports a ${payload.error_rate}% error rate. Saving a job means the request can finish before the investigation does.`,
    technical:
      "After field validation and credential scope checks, ingest assigns severity and atomically commits Incident, Job and INCIDENT_ACCEPTED. Only then does the private API return 202. Secrets in service/message are redacted.",
    input: {
      ...payload,
      service: redact(payload.service),
      message: redact(payload.message),
    },
    output: {
      http_status: 202,
      body: { id: incidentId, status: "QUEUED", duplicate: false },
      persisted: { job_id: jobId, job_status: "PENDING", severity: level },
      severity_rule: "<1 LOW; 1–<10 MEDIUM; 10–<50 HIGH; ≥50 CRITICAL",
    },
    code: "app/services/incidents.py · ingest; app/agents/investigate.py · severity",
  });
  stages.push({
    title: "Claim the work",
    status: "INVESTIGATING",
    plain:
      fault === "lease"
        ? "The first worker loses its reservation. A replacement takes over, and the old worker is prevented from saving a second answer."
        : "A worker reserves the job so two workers do not process it at the same time. The alert now has an investigation in progress.",
    technical:
      "The real worker uses SELECT … FOR UPDATE SKIP LOCKED, a 60-second lease, an owner and incrementing claim_version. Fenced writes require the current owner, version, CLAIMED status and an unexpired lease. This lab models these transitions without running SQL.",
    input: { job_id: jobId, job_status: "PENDING" },
    output: {
      incident_status: "INVESTIGATING",
      job_status: "CLAIMED",
      claim_version: fault === "lease" ? 2 : 1,
      attempts: fault === "lease" ? 2 : 1,
      lease_seconds: 60,
      ...(fault === "lease"
        ? {
            injected_fault: "Expired lease",
            stale_worker_saved: false,
            replacement_worker: "lab-worker-2",
          }
        : {}),
    },
    code: "app/jobs/worker.py · claim / fence / complete",
  });
  function failed(
    code: string,
    stageTitle: string,
    observations: Evidence[] = [],
  ): Run {
    stages.push({
      title: stageTitle,
      status: "NEEDS_REVIEW",
      plain:
        (code === "ValueError"
          ? "The answer refers to evidence that was never collected, so ResolveAI rejects it. "
          : "The worker does not finish within its 50-second limit. ") +
        "The investigation fails three times. ResolveAI stops automatic attempts and asks an operator to review the incident. No report is saved and no corrective action is taken.",
      technical:
        (code === "ValueError"
          ? "The injected report cites an evidence ID that does not exist. validate_report rejects it with ValueError. "
          : "The injected investigation exceeds the worker timeout. ") +
        "run_once catches the exception and fail persists its safe class name. Attempts 1–2 become RETRY_SCHEDULED; attempt 3 becomes DEAD_LETTER. This simulation compresses waiting into one step; it does not wait 50 seconds per timeout.",
      input: { injected_exception: code, job_id: jobId },
      output: {
        attempts: [
          {
            attempt: 1,
            job_status: "RETRY_SCHEDULED",
            delay: "2 seconds + jitter (0–1 second)",
          },
          {
            attempt: 2,
            job_status: "RETRY_SCHEDULED",
            delay: "4 seconds + jitter (0–1 second)",
          },
          { attempt: 3, job_status: "DEAD_LETTER" },
        ],
        incident_status: "NEEDS_REVIEW",
        report: null,
        error: code,
      },
      code: "app/jobs/worker.py · run_once / fail",
    });
    const run: Run = {
      id: requestId,
      outcome: "NEEDS_REVIEW",
      httpStatus: 202,
      stages,
      incidentId,
      evidence: observations,
    };
    saved.set(payload.event_id, { canonical, run });
    return run;
  }
  if (fault === "timeout")
    return failed("TimeoutError", "Handle the worker timeout");
  const evidence = (fixture?.evidence || []).map((e) => ({
    ...e,
    id: id(),
    observed_at: payload.observed_at || stamp,
  }));
  const refMap = new Map(
    fixture?.evidence.map((e, i) => [e.id, evidence[i].id]),
  );
  stages.push({
    title: "Collect evidence",
    status: "EVIDENCE_READY",
    plain: evidence.length
      ? `The investigation has ${evidence.length} observations from the chosen sample incident. These are fixed synthetic measurements. Editing the alert changes the reported problem, but does not change these measurements.`
      : "No sample scenario was selected, so there is no evidence to support a cause. The investigation can still return an honest, incomplete result.",
    technical:
      "Fixture-mode gather reads only the selected allowlisted scenario and attaches evidence IDs and observed_at. PostgreSQL/Redis connectors and the LLM are not called. Metrics retain their original fixture values even if the alert error_rate is edited.",
    input: { scenario: payload.scenario || null, mode: "fixture" },
    output: { evidence, connector_calls: 0, model_calls: 0 },
    code: "app/jobs/worker.py · gather; demo/scenarios.json",
  });
  if (fault === "citation")
    return failed("ValueError", "Reject an unsupported citation", evidence);
  const hypotheses = (fixture?.report.hypotheses || []).map((h) => ({
    ...h,
    evidence_ids: h.evidence_ids.map((ref) => refMap.get(ref)!),
  }));
  const report: Report = {
    summary: `${redact(payload.service)}: ${hypotheses.length ? "Evidence supports " + hypotheses[0].title.toLowerCase() + "." : "Insufficient evidence to identify a plausible cause."}`,
    severity: level,
    impact: `${payload.error_rate}% reported error rate; affected user count is unknown.`,
    hypotheses,
    supporting_evidence_ids: (
      fixture?.report.supporting_evidence_ids || []
    ).map((ref) => refMap.get(ref)!),
    contradicting_evidence_ids: [],
    uncertainty:
      "Synthetic evidence and deterministic analysis do not establish a production root cause. Alternative causes remain possible.",
    recommended_next_steps: [
      "Compare the incident time window against independent application telemetry.",
      "Have an operator review the evidence and proposed response before making changes.",
    ],
    investigation_mode: "fixture",
    started_at: stamp,
    completed_at: new Date().toISOString(),
  };
  stages.push({
    title: "Check the explanation",
    status: hypotheses.length
      ? "HYPOTHESIS_SUPPORTED"
      : "INSUFFICIENT_EVIDENCE",
    plain: hypotheses.length
      ? `The evidence supports a possible explanation: ${hypotheses[0].title.toLowerCase()}. It is a lead to investigate, not a confirmed cause. Every claim points back to a recorded observation.`
      : "Without supporting observations, ResolveAI avoids inventing a cause. It records the uncertainty and asks for human review.",
    technical:
      "The lab reuses the deterministic rule result returned by the scenario endpoint, remaps its evidence IDs and recalculates severity/impact for the edited alert. The real recorded_report validates schema and citations; no free-text LLM reasoning runs here.",
    input: {
      evidence_ids: evidence.map((e) => e.id),
      error_rate: payload.error_rate,
    },
    output: {
      hypotheses,
      supporting_evidence_ids: report.supporting_evidence_ids,
      citations_valid: hypotheses.every((h) =>
        h.evidence_ids.every((ref) => evidence.some((e) => e.id === ref)),
      ),
    },
    code: "app/agents/investigate.py · recorded_report / validate_report",
  });
  const outcome = hypotheses.length ? "REPORT_READY" : "NEEDS_REVIEW";
  stages.push({
    title: "Return the final result",
    status: outcome,
    plain:
      outcome === "REPORT_READY"
        ? "An operator receives the impact, a supported explanation, the evidence and suggested next checks. The report is ready; the underlying problem has not been fixed automatically."
        : "The investigation completed but could not identify a supported cause. The operator receives an incomplete report and a request to collect more evidence.",
    technical:
      "complete checks the lease fence and commits evidence, report, COMPLETED run and REPORT_SAVED audit together. The private report GET returns this shape. Here, the result is saved only in this tab's memory; refreshing clears it.",
    input: { job_id: jobId, fence: "current owner + version + valid lease" },
    output: {
      http_status: 200,
      method: "GET",
      path: `/api/v1/incidents/${incidentId}/report`,
      body: { status: outcome, report, evidence },
      job_status: "SUCCEEDED",
      run_status: "COMPLETED",
      audit_action: "REPORT_SAVED",
    },
    code: "app/jobs/worker.py · complete; app/main.py · report",
  });
  const run: Run = {
    id: requestId,
    outcome,
    httpStatus: 202,
    stages,
    report,
    evidence,
    incidentId,
  };
  saved.set(payload.event_id, { canonical, run });
  return run;
}
