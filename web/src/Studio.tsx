import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Code,
  Download,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
} from "lucide-react";
import { download } from "./api";
import {
  StudioClient,
  StudioError,
  mergeSteps,
  terminal,
  SANDBOX_API,
  type Descriptor,
  type Input,
  type Preset,
  type Result,
  type State,
  type Step,
} from "./studioClient";
import { inputHelp, allowedInput } from "./studioInputHelp";
import { ProcessingGuide, FinalResultGuide } from "./StudioGuide";
import { hasCompletedReport, resultOutcome } from "./studioProcessHelp";
import "./studio.css";

const groups: [string, string[]][] = [
  ["Incident", ["service", "error_rate", "latency_ms", "incident_context"]],
  [
    "Database",
    [
      "db_connections",
      "db_max_connections",
      "db_cpu_percent",
      "db_lock_waiters",
      "slow_queries",
    ],
  ],
  [
    "Cache & upstream",
    [
      "redis_memory_mb",
      "redis_maxmemory_mb",
      "redis_evictions",
      "upstream_429",
      "retry_after_seconds",
    ],
  ],
  [
    "Deployment & exceptions",
    [
      "recent_deployment",
      "previous_error_rate",
      "log_fixture",
      "fault",
      "seed",
    ],
  ],
];
const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\bdb\b/g, "DB")
    .replace(/\bms\b/g, "(ms)")
    .replace(/\bmb\b/g, "(MiB)");
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
export default function Studio() {
  const client = useRef(new StudioClient()).current;
  const errorBox = useRef<HTMLDivElement>(null);
  const [descriptor, setDescriptor] = useState<Descriptor | null>(null),
    [presets, setPresets] = useState<Preset[]>([]),
    [preset, setPreset] = useState("payment-outage");
  const [input, setInput] = useState<Input>({}),
    [json, setJson] = useState(""),
    [raw, setRaw] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]),
    [run, setRun] = useState<State | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [previous, setPrevious] = useState<Result | null>(null);
  const [error, setError] = useState<StudioError | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [transport, setTransport] = useState("Ready"),
    [technical, setTechnical] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const stream = useRef<EventSource | null>(null),
    poll = useRef<ReturnType<typeof setInterval> | null>(null),
    controller = useRef<AbortController | null>(null),
    eventsRef = useRef<Step[]>([]),
    activeRun = useRef<string | null>(null);
  const clear = () => {
    stream.current?.close();
    stream.current = null;
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  const problem = (e: unknown) =>
    e instanceof StudioError
      ? e
      : new StudioError(
          e instanceof Error
            ? e.message
            : "Unable to reach the server. Retry when connected.",
          "NETWORK_ERROR",
        );
  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const found = await client.discover(signal);
      if (signal?.aborted) return;
      setDescriptor(found.schema);
      setPresets(found.presets);
      const first = found.presets[0];
      setPreset(first.id);
      setInput(first.input);
      setJson(pretty(first.input));
      setError(null);
    } catch (e) {
      if (!signal?.aborted) setError(problem(e));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => {
      c.abort();
      clear();
      controller.current?.abort();
    };
  }, []);
  function choose(id: string) {
    const found = presets.find((p) => p.id === id);
    if (found) {
      setPreset(id);
      setInput(found.input);
      setJson(pretty(found.input));
      setError(null);
    }
  }
  function change(key: string, value: string | number | boolean) {
    const updated = { ...input, [key]: value };
    setInput(updated);
    setJson(pretty(updated));
  }
  const accept = (incoming: Step[], id: string) => {
    if (activeRun.current !== id) return;
    eventsRef.current = mergeSteps(eventsRef.current, incoming, id);
    setSteps(eventsRef.current);
  };
  async function start() {
    setError(null);
    let value: Input;
    try {
      value = raw ? JSON.parse(json) : input;
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
    } catch {
      setError(
        new StudioError(
          "Enter a valid JSON object. Your input is preserved.",
          "INVALID_JSON",
        ),
      );
      return;
    }
    clear();
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setBusy(true);
    if (result) setPrevious(result);
    setResult(null);
    setRun(null);
    setSteps([]);
    eventsRef.current = [];
    setSelected(null);
    setTransport("Submitting to server");
    try {
      // Refresh the short-lived cookie and CSRF token before a mutation, without changing editor state.
      await client.request("/simulation/schema", undefined, signal);
      const next = await client.request<State>(
        "/simulations",
        {
          schema_version: "1.0",
          project_id: "resolveai",
          mode: "SANDBOX_DETERMINISTIC",
          preset_id: preset,
          input: value,
          seed: value.seed,
          client_correlation_id: crypto.randomUUID(),
        },
        signal,
      );
      setRun(next);
      activeRun.current = next.run_id;
      const id = next.run_id;
      const eventSource = new EventSource(
        `${SANDBOX_API}/simulations/${id}/events`,
      );
      stream.current = eventSource;
      eventSource.onopen = () => setTransport("Server events · SSE");
      eventSource.addEventListener("step", (e) => {
        try {
          accept([JSON.parse((e as MessageEvent).data)], id);
        } catch (err) {
          clear();
          setError(problem(err));
          setBusy(false);
        }
      });
      eventSource.onerror = () => {
        eventSource.close();
        stream.current = null;
        setTransport("Server events · polling fallback");
      };
      let inFlight = false;
      const started = Date.now();
      const update = async () => {
        if (inFlight || signal.aborted) return;
        inFlight = true;
        try {
          if (Date.now() - started > 30000)
            throw new StudioError(
              "The display timed out. The server applies its own run deadline.",
              "DISPLAY_TIMEOUT",
            );
          const state = await client.request<State>(
            `/simulations/${id}`,
            undefined,
            signal,
          );
          setRun(state);
          if (!stream.current || terminal(state.status)) {
            const batch = await client.request<{ events: Step[] }>(
              `/simulations/${id}/events?after=0`,
              undefined,
              signal,
            );
            accept(batch.events, id);
          }
          if (terminal(state.status)) {
            clear();
            if (
              eventsRef.current.length !== state.event_count ||
              eventsRef.current.some((e, i) => e.sequence !== i + 1)
            )
              throw new StudioError(
                "The event history is incomplete.",
                "EVENT_GAP",
              );
            const final = await client.request<Result>(
              `/simulations/${id}/result`,
              undefined,
              signal,
            );
            if (
              final.run_id !== id ||
              final.project_id !== "resolveai" ||
              final.mode !== "SANDBOX_DETERMINISTIC" ||
              !terminal(final.status)
            )
              throw new StudioError(
                "Incompatible final result.",
                "RESULT_CONTRACT",
              );
            setResult(final);
            setBusy(false);
            setTransport(resultOutcome(final));
          }
        } catch (err) {
          if (!signal.aborted) {
            clear();
            setError(problem(err));
            setBusy(false);
            setTransport("Updates unavailable — check the error below");
          }
        } finally {
          inFlight = false;
        }
      };
      poll.current = setInterval(() => void update(), 500);
      eventSource.addEventListener("end", () => void update());
      void update();
    } catch (e) {
      if (!signal.aborted) {
        setError(problem(e));
        setBusy(false);
        setTransport("Request rejected");
      }
    }
  }
  async function cancel() {
    if (!run) return;
    try {
      await client.request(`/simulations/${run.run_id}/cancel`, {});
    } catch (e) {
      setError(problem(e));
    }
  }
  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);
  const completedReport = hasCompletedReport(result);
  return (
    <section className="studio" id="simulation" aria-labelledby="studio-title">
      <div className="studio-heading">
        <div>
          <p className="studio-kicker">INTERACTIVE INCIDENT STUDIO</p>
          <h2 id="studio-title">
            Change the signal.
            <br />
            Follow the investigation.
          </h2>
          <p>
            Edit a synthetic incident, run the real server workflow, and inspect
            how the findings change.
          </p>
        </div>
        <span className="studio-mode">
          SANDBOX_DETERMINISTIC<span>No API key · no live connections</span>
        </span>
      </div>
      {loading ? <p role="status">Loading input schema and presets…</p> : null}
      {error ? (
        <div className="studio-error" role="alert" tabIndex={-1} ref={errorBox}>
          <TriangleAlert size={19} />
          <div>
            <strong>{error.code.replaceAll("_", " ")}</strong>
            <p>{error.message}</p>
            {error.fields.map((f) => (
              <p key={f.field}>
                <code>{f.field.replace("body.input.", "")}</code>:{" "}
                {f.message || f.type.replaceAll("_", " ")}
              </p>
            ))}
            <small>
              Input is preserved. Correct the fields or retry the connection.
            </small>
            {!descriptor ? (
              <button onClick={() => void load()}>Retry connection</button>
            ) : null}
          </div>
        </div>
      ) : null}
      {descriptor ? (
        <>
          <div className="studio-preset">
            <label htmlFor="studio-preset">Start with a scenario</label>
            <select
              id="studio-preset"
              value={preset}
              onChange={(e) => choose(e.target.value)}
              disabled={busy}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p>{presets.find((p) => p.id === preset)?.description}</p>
          </div>
          <div className="studio-workbench">
            <div className="studio-editor">
              <div className="studio-panel-title">
                <h3>
                  <span>01</span> Editable input
                </h3>
                <button
                  className="studio-text-button"
                  onClick={() => {
                    if (raw) {
                      try {
                        const v = JSON.parse(json);
                        if (v && typeof v === "object" && !Array.isArray(v))
                          setInput(v);
                        else throw Error();
                      } catch {
                        setError(
                          new StudioError(
                            "Fix JSON before switching to fields.",
                            "INVALID_JSON",
                          ),
                        );
                        return;
                      }
                    }
                    setRaw(!raw);
                  }}
                  disabled={busy}
                >
                  <Code size={16} />
                  {raw ? "Form fields" : "JSON editor"}
                </button>
              </div>
              <p className="studio-input-intro">
                Start with a scenario, then change one signal at a time. These
                are synthetic values you supply, not measurements collected from
                your systems. Expand a group for examples and guidance.
              </p>
              {raw ? (
                <>
                  <label className="sr-only" htmlFor="request-json">
                    Editable simulation input JSON
                  </label>
                  <textarea
                    id="request-json"
                    className="studio-json-editor"
                    spellCheck={false}
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    disabled={busy}
                    aria-describedby="json-input-help"
                  />
                  <p className="studio-hint" id="json-input-help">
                    Use the exact field names in the input guide below. Numbers
                    must be JSON numbers, not quoted text. Try an error rate of
                    120 to inspect server validation; your input is preserved.
                  </p>
                </>
              ) : null}
              <div className={raw ? "studio-json-guide" : undefined}>
                {raw ? <h4>Input guide · examples and valid values</h4> : null}
                {groups.map(([title, keys], i) => (
                  <details
                    key={title}
                    open={i === 0}
                    className="studio-field-group"
                  >
                    <summary>
                      {title}
                      <ChevronDown size={16} aria-hidden="true" />
                    </summary>
                    <div className="studio-fields">
                      {keys.map((key) => {
                        const field = descriptor.input_schema.properties[key];
                        const help = inputHelp[key];
                        if (!field || !help) return null;
                        const id = "field-" + key;
                        const descriptionId = id + "-description";
                        const selectedHelp = help.options?.[String(input[key])];
                        return (
                          <div className="studio-field" key={key}>
                            <div className="studio-field-heading">
                              {raw ? (
                                <strong>{help.label}</strong>
                              ) : (
                                <label htmlFor={id}>{help.label}</label>
                              )}
                              <code>{key}</code>
                            </div>
                            <p
                              className="studio-field-meaning"
                              id={id + "-meaning"}
                            >
                              {help.meaning}
                            </p>
                            {!raw ? (
                              field.enum ? (
                                <select
                                  id={id}
                                  aria-describedby={
                                    id + "-meaning " + descriptionId
                                  }
                                  value={String(input[key])}
                                  onChange={(e) => change(key, e.target.value)}
                                  disabled={busy}
                                >
                                  {field.enum.map((v) => (
                                    <option key={v} value={v}>
                                      {help.options?.[v]?.label ?? label(v)}
                                    </option>
                                  ))}
                                </select>
                              ) : field.type === "boolean" ? (
                                <div className="studio-boolean-control">
                                  <input
                                    id={id}
                                    type="checkbox"
                                    aria-describedby={
                                      id + "-meaning " + descriptionId
                                    }
                                    checked={Boolean(input[key])}
                                    onChange={(e) =>
                                      change(key, e.target.checked)
                                    }
                                    disabled={busy}
                                  />
                                  <span aria-hidden="true">
                                    {input[key] ? "Yes" : "No"}
                                  </span>
                                </div>
                              ) : (
                                <input
                                  id={id}
                                  aria-describedby={
                                    id + "-meaning " + descriptionId
                                  }
                                  type={
                                    field.type === "string" ? "text" : "number"
                                  }
                                  value={String(input[key] ?? "")}
                                  min={field.minimum}
                                  max={field.maximum}
                                  minLength={field.minLength}
                                  maxLength={field.maxLength}
                                  step={field.type === "number" ? "any" : 1}
                                  onChange={(e) =>
                                    change(
                                      key,
                                      field.type === "string"
                                        ? e.target.value
                                        : e.target.value === ""
                                          ? ""
                                          : Number(e.target.value),
                                    )
                                  }
                                  disabled={busy}
                                />
                              )
                            ) : null}
                            <div
                              className="studio-field-help"
                              id={descriptionId}
                            >
                              <p>
                                <strong>Example:</strong> {help.example}
                              </p>
                              <p>
                                <strong>Valid input:</strong>{" "}
                                {allowedInput(field, help)}
                              </p>
                              <p className="studio-field-effect">
                                <strong>Effect on result:</strong> {help.effect}
                              </p>
                              {help.options ? (
                                raw ? (
                                  <ul className="studio-option-guide">
                                    {field.enum?.map((v) => (
                                      <li key={v}>
                                        <code>{v}</code> —{" "}
                                        {help.options?.[v]?.effect}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="studio-selected-help">
                                    <strong>
                                      Selected: {selectedHelp?.label}
                                    </strong>{" "}
                                    {selectedHelp?.effect}
                                  </p>
                                )
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
              <div className="studio-run-actions">
                <button
                  className="studio-run"
                  onClick={() => void start()}
                  disabled={busy}
                >
                  <Play size={16} />
                  {busy ? "Investigating…" : "Run investigation"}
                </button>
                {busy ? (
                  <button
                    onClick={() => void cancel()}
                    disabled={!run || terminal(run.status)}
                    className="studio-secondary"
                  >
                    <Square size={14} />
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={() => choose(preset)}
                    className="studio-secondary"
                    aria-label="Reset input to preset"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
              <p className="studio-hint">
                Runs expire after{" "}
                {Math.round(descriptor.limits.retention_seconds / 60)} minutes.
                Server checkpoints allow cancellation; their time is included in
                the measured duration.
              </p>
              <details className="studio-schema">
                <summary>Request contract & limits</summary>
                <pre tabIndex={0}>
                  {pretty({
                    endpoint: "POST " + SANDBOX_API + "/simulations",
                    limits: descriptor.limits,
                    input_schema: descriptor.input_schema,
                  })}
                </pre>
              </details>
            </div>
            <ProcessingGuide
              steps={steps}
              result={result}
              runStatus={run?.status}
              technical={technical}
              onViewChange={setTechnical}
              selected={selected}
              onSelect={setSelected}
              transport={transport}
            />
          </div>
          <FinalResultGuide
            result={result}
            technical={technical}
            onViewChange={setTechnical}
          />
          {result ? (
            <div className="studio-result" id="studio-result">
              <div className="studio-panel-title">
                <h3>
                  <span>03</span> Final result
                </h3>
                <div>
                  <span className="studio-status">
                    {resultOutcome(result)} · {result.duration_ms.toFixed(1)} ms
                  </span>
                  <button
                    className="studio-text-button"
                    onClick={() =>
                      download("resolveai-" + result.run_id + ".json", {
                        result,
                        events: steps,
                      })
                    }
                  >
                    <Download size={16} />
                    Export JSON
                  </button>
                </div>
              </div>
              <div className="studio-result-summary">
                <span className="studio-severity">
                  {result.output.severity || result.status}
                </span>
                <p className="studio-hint">
                  {completedReport
                    ? "Severity describes the incident, not whether its cause is known or the service is fixed."
                    : "This is an interruption record. A complete diagnostic report was not produced."}
                </p>
                <h3>{result.output.summary}</h3>
                {result.output.impact ? <p>{result.output.impact}</p> : null}
                {result.output.uncertainty ? (
                  <p>{result.output.uncertainty}</p>
                ) : null}
              </div>
              {result.output.faults.length ? (
                <div className="studio-error">
                  <TriangleAlert size={18} />
                  <div>
                    <strong>
                      {completedReport
                        ? "Warnings retained after continuation"
                        : "Why the run stopped"}
                    </strong>
                    {result.output.faults.map((e) => (
                      <p key={e.code}>
                        <code>{e.code}</code> — {e.message}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="studio-report-columns">
                <div>
                  <h4>Supported hypotheses</h4>
                  <p className="studio-hint">
                    {technical
                      ? "output.hypotheses contains rule-supported explanations and citation IDs. Confidence is qualitative, not a calibrated probability."
                      : "Possible explanations backed by evidence. They are not proven root causes; conflicting evidence lowers confidence."}
                  </p>
                  {result.output.hypotheses?.length ? (
                    result.output.hypotheses.map((h) => (
                      <article key={h.title}>
                        <h4>{h.title}</h4>
                        <p>{h.rationale}</p>
                        <small>
                          Confidence: {h.confidence} · Evidence:{" "}
                          {h.evidence_ids.join(", ")}
                        </small>
                        {h.contradicting_evidence_ids.length ? (
                          <p className="studio-caution">
                            Competing evidence:{" "}
                            {h.contradicting_evidence_ids.join(", ")}
                          </p>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <p>
                      {completedReport
                        ? "No supported cause. The completed investigation asks for more evidence."
                        : "No completed assessment is available. This is not a finding that the cause is unknown; the run ended before a report was ready."}
                    </p>
                  )}
                  <h4>Next steps for a person</h4>
                  <p className="studio-hint">
                    {completedReport
                      ? "Suggested checks for a person to review. ResolveAI has not performed them."
                      : "Review the interruption details, correct the input or selected fault, and start a new run when ready. No remediation was performed."}
                  </p>
                  <ol>
                    {result.output.recommended_next_steps?.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <p className="studio-hint">
                    No remediation, ticket or external action was executed.
                  </p>
                </div>
                <div>
                  <h4>Evidence ledger</h4>
                  <p className="studio-hint">
                    {technical
                      ? "Expand output.evidence_ledger records referenced by canonical evidence IDs and SHA-256 hashes. Retained evidence does not imply that every stage completed."
                      : "Expand a record to see the synthetic observations used in this run. Missing records are gaps in knowledge, not proof that a system is healthy."}
                  </p>
                  {!result.output.evidence_ledger.length ? (
                    <p>No evidence was retained for this run.</p>
                  ) : null}
                  {result.output.evidence_ledger.map((e) => (
                    <details key={e.id}>
                      <summary>
                        <code>{e.id}</code> {e.source}
                      </summary>
                      <pre tabIndex={0}>{pretty(e.data)}</pre>
                    </details>
                  ))}
                  {result.output.evidence_ledger.some((e) => e.id === "E7") ? (
                    <p className="studio-hint">
                      E7 is a deliberate decoy from a different service and time
                      window. It cannot support this incident.
                    </p>
                  ) : null}
                </div>
              </div>
              {previous ? (
                <div className="studio-comparison">
                  <h4>Compare with your previous run</h4>
                  <p className="studio-hint">
                    Compare accepted inputs and their resulting findings. A
                    changed fingerprint can reflect provenance changes,
                    including the seed; it does not by itself prove a different
                    cause.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Finding</th>
                        <th>Previous</th>
                        <th>Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>Run outcome</th>
                        <td>{resultOutcome(previous)}</td>
                        <td>{resultOutcome(result)}</td>
                      </tr>
                      <tr>
                        <th>Severity</th>
                        <td>{previous.output.severity || "Not reported"}</td>
                        <td>{result.output.severity || "Not reported"}</td>
                      </tr>
                      <tr>
                        <th>Hypotheses</th>
                        <td>
                          {previous.output.hypotheses
                            ?.map((h) => h.title)
                            .join("; ") ||
                            (hasCompletedReport(previous)
                              ? "None supported"
                              : "No completed assessment")}
                        </td>
                        <td>
                          {result.output.hypotheses
                            ?.map((h) => h.title)
                            .join("; ") ||
                            (completedReport
                              ? "None supported"
                              : "No completed assessment")}
                        </td>
                      </tr>
                      <tr>
                        <th>Semantic result</th>
                        <td colSpan={2}>
                          {!hasCompletedReport(previous) || !completedReport
                            ? "A run did not produce a complete report; compare its outcome and warnings."
                            : previous.output.semantic_sha256 &&
                                previous.output.semantic_sha256 ===
                                  result.output.semantic_sha256
                              ? "Unchanged: the deterministic result is reproducible."
                              : "Changed: inspect the evidence and rule decisions above."}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="studio-result-meta">
                <span>
                  App {result.app_version} · fixtures {result.fixtures_version}
                </span>
                <span>
                  External model spend: {result.cost.value}{" "}
                  {result.cost.currency} · hosting excluded
                </span>
              </div>
              <details>
                <summary>Complete technical result</summary>
                <pre tabIndex={0}>{pretty(result)}</pre>
              </details>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
