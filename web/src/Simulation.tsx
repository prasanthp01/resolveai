import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Code2,
  Download,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { api, download, type Scenario } from "./api";
import { simulate, type Fault, type Run, type Saved } from "./simulationEngine";

function JSONBlock({ value }: { value: unknown }) {
  return (
    <pre className="simulation-json">
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  );
}
function template(s: Scenario, suffix = "001") {
  return JSON.stringify(
    {
      event_id: `${s.slug}-${suffix}`,
      service: s.service,
      error_rate: s.error_rate,
      message: s.description,
      mode: "fixture",
      scenario: s.slug,
    },
    null,
    2,
  );
}
export default function Simulation() {
  const [query, setQuery] = useSearchParams();
  const [fixtures, setFixtures] = useState<Scenario[]>([]);
  const [raw, setRaw] = useState("");
  const [scenario, setScenario] = useState(
    query.get("scenario") || "postgres-saturation",
  );
  const [audience, setAudience] = useState("both");
  const [authenticated, setAuthenticated] = useState(true);
  const [fault, setFault] = useState<Fault>("none");
  const [run, setRun] = useState<Run | null>(null);
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState("");
  const [error, setError] = useState("");
  const [trace, setTrace] = useState<unknown>(null);
  const [traceError, setTraceError] = useState("");
  const [loadingTrace, setLoadingTrace] = useState(false);
  const traceRequest = useRef(0);
  const saved = useRef(new Map<string, Saved>());
  const result = useRef<HTMLElement>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (run) {
      stageHeading.current?.focus({ preventScroll: true });
      result.current?.scrollIntoView({ block: "start" });
    }
  }, [step, run]);
  useEffect(() => {
    let active = true;
    api<Scenario[]>("/demo/scenarios")
      .then((list) =>
        Promise.all(
          list.map((s) => api<Scenario>("/demo/scenarios/" + s.slug)),
        ),
      )
      .then((data) => {
        if (!active) return;
        setFixtures(data);
        const selected = data.find((s) => s.slug === scenario) || data[0];
        setScenario(selected.slug);
        setRaw(template(selected));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  function choose(slug: string) {
    traceRequest.current++;
    setLoadingTrace(false);
    const fixture = fixtures.find((s) => s.slug === slug)!;
    setScenario(slug);
    setQuery({ scenario: slug });
    setRaw(template(fixture));
    setFault("none");
    setAuthenticated(true);
    setTrace(null);
    setTraceError("");
    setRun(null);
    setStep(0);
  }
  function newEvent() {
    try {
      setRaw(
        JSON.stringify(
          {
            ...JSON.parse(raw),
            event_id: `${scenario}-${crypto.randomUUID().slice(0, 8)}`,
          },
          null,
          2,
        ),
      );
    } catch {
      setError("Fix the JSON syntax before changing its event ID.");
    }
  }
  function execute() {
    setError("");
    const next = simulate(raw, authenticated, fault, fixtures, saved.current);
    setRun(next);
    setSubmitted(JSON.stringify({ raw, authenticated, fault }));
    setStep(0);
    result.current?.focus();
  }
  function example(kind: "bad-rate" | "bad-json" | "no-evidence" | "reset") {
    const fixture = fixtures.find((s) => s.slug === scenario)!;
    const body = JSON.parse(template(fixture, crypto.randomUUID().slice(0, 8)));
    if (kind === "bad-rate") body.error_rate = 101;
    if (kind === "no-evidence") body.scenario = null;
    setRaw(
      kind === "bad-json"
        ? '{ "event_id": "broken", "error_rate": 32, }'
        : JSON.stringify(body, null, 2),
    );
    setFault("none");
    setAuthenticated(true);
    setError("");
  }
  async function reference() {
    const request = ++traceRequest.current;
    setLoadingTrace(true);
    setTraceError("");
    try {
      const recording = await api("/demo/scenarios/" + scenario + "/trace");
      if (request === traceRequest.current) setTrace(recording);
    } catch (e) {
      if (request === traceRequest.current)
        setTraceError(e instanceof Error ? e.message : "Recording unavailable");
    } finally {
      if (request === traceRequest.current) setLoadingTrace(false);
    }
  }
  const active = run?.stages[step];
  const changed =
    !!run && submitted !== JSON.stringify({ raw, authenticated, fault });
  const final = !!run && step === run.stages.length - 1;
  const showPlain = audience !== "technical";
  const showTech = audience !== "plain";
  return (
    <div className="simulation-page">
      <div className="eyebrow">
        <Play size={15} /> INTERACTIVE SIMULATION LAB
      </div>
      <div className="page-heading">
        <div>
          <h1>
            Send an alert.
            <br />
            Follow every decision.
          </h1>
          <p className="subtitle">
            Edit a request, introduce a fault, and inspect what happens at each
            stage—in plain language and technical detail.
          </p>
        </div>
        <Link className="simulation-link" to="/architecture">
          Architecture guide <ArrowRight size={16} />
        </Link>
      </div>
      <div className="demo-notice">
        <Code2 size={19} />
        <span>
          <strong>Browser simulation · synthetic evidence.</strong> Your input
          stays in this tab. This models private API behavior; it does not
          submit real requests, call AI, or change any service. Use sample data
          only.
        </span>
      </div>
      <section className="simulation-editor" aria-labelledby="input-title">
        <div className="simulation-editor-heading">
          <div>
            <span className="eyebrow">01 / YOUR INPUT</span>
            <h2 id="input-title">Build the request</h2>
          </div>
          <label>
            Sample issue
            <select
              aria-label="Sample issue"
              value={scenario}
              disabled={!fixtures.length}
              onChange={(e) => choose(e.target.value)}
            >
              {fixtures.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!fixtures.length && !error && (
          <p role="status">Loading synthetic scenarios…</p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="simulation-input-grid">
          <div>
            <label className="simulation-editor-label" htmlFor="request-json">
              <code>POST /api/v1/events</code>
              <span>Editable JSON request body</span>
            </label>
            <textarea
              id="request-json"
              spellCheck={false}
              aria-describedby="input-help"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              disabled={!fixtures.length}
            />
            <p id="input-help" className="simulation-help">
              Required: event_id, service, error_rate (0–100), message.
              Optional: fixture mode, scenario, observed_at (ISO time with
              timezone). Unknown fields are rejected. Changing the message does
              not run free-text AI analysis.
            </p>
          </div>
          <div className="simulation-options">
            <label>
              Authentication
              <select
                value={authenticated ? "valid" : "missing"}
                onChange={(e) => setAuthenticated(e.target.value === "valid")}
              >
                <option value="valid">Valid synthetic credential</option>
                <option value="missing">Missing credential → 401</option>
              </select>
            </label>
            <label>
              Worker behavior
              <select
                value={fault}
                onChange={(e) => setFault(e.target.value as Fault)}
              >
                <option value="none">Normal investigation</option>
                <option value="timeout">Timeout on all 3 attempts</option>
                <option value="lease">
                  Expired lease → replacement worker
                </option>
                <option value="citation">Unsupported evidence citation</option>
              </select>
            </label>
            <p className="simulation-help">
              A worker fault is separate from the request body. Use a new event
              ID to start a fresh investigation after changing it.
            </p>
            <div className="simulation-examples">
              <span className="eyebrow">TRY AN EDGE CASE</span>
              <button
                disabled={!fixtures.length}
                onClick={() => example("bad-rate")}
              >
                Error rate = 101
              </button>
              <button
                disabled={!fixtures.length}
                onClick={() => example("bad-json")}
              >
                Broken JSON
              </button>
              <button
                disabled={!fixtures.length}
                onClick={() => example("no-evidence")}
              >
                No evidence scenario
              </button>
            </div>
          </div>
        </div>
        <div className="simulation-actions">
          <button
            className="primary"
            disabled={!fixtures.length}
            onClick={execute}
          >
            <Play size={16} />
            Run simulation
          </button>
          <button disabled={!fixtures.length} onClick={newEvent}>
            New event ID
          </button>
          <button disabled={!fixtures.length} onClick={() => example("reset")}>
            <RotateCcw size={15} />
            Reset input
          </button>
          <button
            onClick={() => {
              saved.current.clear();
              setRun(null);
              setStep(0);
            }}
          >
            Clear session ({saved.current.size})
          </button>
        </div>
        <p className="simulation-help">
          Run an accepted input twice to see deduplication. Keep its event ID
          but change its message to see a 409 conflict. Tab-local incident
          memory resets on refresh or Clear session.
        </p>
      </section>
      <section
        ref={result}
        tabIndex={-1}
        className="simulation-results"
        aria-labelledby="results-title"
      >
        <div className="simulation-result-heading">
          <div>
            <span className="eyebrow">02 / REQUEST JOURNEY</span>
            <h2 id="results-title">
              {run
                ? "Inspect the result, stage by stage"
                : "Your investigation starts here"}
            </h2>
          </div>
          <div
            className="simulation-views"
            role="group"
            aria-label="Explanation style"
          >
            {[
              ["plain", "Non-technical"],
              ["technical", "Technical"],
              ["both", "Both"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={audience === value}
                onClick={() => setAudience(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {!run ? (
          <div className="simulation-empty">
            <Play size={25} />
            <h3>Change the input. Run. Explore.</h3>
            <p>
              Start with the sample above. After running, use the stages to
              inspect the inputs, decisions, state changes and output. Rejected
              requests stop before a job is created.
            </p>
          </div>
        ) : (
          <>
            {changed && (
              <p className="simulation-warning" role="status">
                Input or controls changed. The results below belong to your
                previous run. Run again to apply your changes.
              </p>
            )}
            <div className="simulation-run-summary" aria-live="polite">
              <span className="pill">
                {run.httpStatus
                  ? `Intake HTTP ${run.httpStatus}`
                  : "Lab restriction"}
              </span>
              <strong>
                {run.duplicate
                  ? "Existing incident returned"
                  : run.outcome.replaceAll("_", " ")}
              </strong>
              <span>{run.stages.length} stages · simulated</span>
            </div>
            <div className="simulation-journey">
              <nav
                className="simulation-stepper"
                aria-label="Investigation stages"
              >
                {run.stages.map((s, i) => (
                  <button
                    key={i}
                    aria-current={step === i ? "step" : undefined}
                    onClick={() => setStep(i)}
                  >
                    <span className="simulation-step-number">
                      {i < step ? (
                        <Check size={16} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <span>
                      {s.title}
                      <small>{s.status.replaceAll("_", " ")}</small>
                    </span>
                  </button>
                ))}
              </nav>
              {active && (
                <article className="simulation-stage">
                  <div className="eyebrow">
                    STAGE {step + 1} OF {run.stages.length} ·{" "}
                    {active.status.replaceAll("_", " ")}
                  </div>
                  <h2 ref={stageHeading} tabIndex={-1}>
                    {active.title}
                  </h2>
                  <div
                    className={
                      showPlain && showTech
                        ? "simulation-explanations both"
                        : "simulation-explanations"
                    }
                  >
                    {showPlain && (
                      <div>
                        <h3>In plain language</h3>
                        <p>{active.plain}</p>
                      </div>
                    )}
                    {showTech && (
                      <div>
                        <h3>Under the hood</h3>
                        <p>{active.technical}</p>
                        <p className="simulation-code-ref">
                          <code>{active.code}</code>
                        </p>
                      </div>
                    )}
                  </div>
                  {showTech && (!final || run.duplicate) && (
                    <div className="simulation-io">
                      <div>
                        <h3>Stage input</h3>
                        <JSONBlock value={active.input} />
                      </div>
                      <div>
                        <h3>Stage output</h3>
                        <JSONBlock value={active.output} />
                      </div>
                    </div>
                  )}
                  {showPlain && active.status === "EVIDENCE_READY" && (
                    <div className="simulation-observations">
                      {run.evidence?.map((e) => (
                        <div key={e.id}>
                          <strong>{e.source}</strong>
                          <dl>
                            {Object.entries(e.data).map(([key, value]) => (
                              <div key={key}>
                                <dt>{key.replaceAll("_", " ")}</dt>
                                <dd>{String(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </div>
                  )}
                  {final && run.report && (
                    <div className="simulation-final">
                      <span className="eyebrow">03 / FINAL OUTPUT</span>
                      <h3>{run.report.summary}</h3>
                      <dl>
                        <div>
                          <dt>Reported impact</dt>
                          <dd>{run.report.impact}</dd>
                        </div>
                        <div>
                          <dt>Priority</dt>
                          <dd>{run.report.severity}</dd>
                        </div>
                        <div>
                          <dt>What we know</dt>
                          <dd>
                            {run.report.hypotheses[0]?.rationale ||
                              "There is not enough evidence to identify a cause."}
                          </dd>
                        </div>
                        <div>
                          <dt>What remains unknown</dt>
                          <dd>{run.report.uncertainty}</dd>
                        </div>
                        <div>
                          <dt>Action taken</dt>
                          <dd>
                            Investigation report only. No fix was executed.
                          </dd>
                        </div>
                      </dl>
                      <h3>Recommended next steps · human review</h3>
                      <ol>
                        {run.report.recommended_next_steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      {showTech && (
                        <details>
                          <summary>Full final report JSON</summary>
                          <JSONBlock
                            value={{
                              status: run.outcome,
                              report: run.report,
                              evidence: run.evidence,
                            }}
                          />
                        </details>
                      )}
                      <button
                        onClick={() =>
                          download("resolveai-simulated-report.json", {
                            simulation: true,
                            status: run.outcome,
                            report: run.report,
                            evidence: run.evidence,
                          })
                        }
                      >
                        <Download size={15} />
                        Export result
                      </button>
                    </div>
                  )}
                  {final && !run.report && (
                    <div className="simulation-final">
                      <TriangleAlert size={20} />
                      <h3>
                        {run.outcome === "REJECTED"
                          ? "Request rejected before investigation"
                          : "Investigation needs human review"}
                      </h3>
                      <p>
                        {run.outcome === "REJECTED"
                          ? "Correct the input or authentication setting and run again. No incident or job was created for this rejected request."
                          : "The retry limit was reached. The incident remains available for an operator; no report was saved. In this lab, select Normal investigation and use a new event ID to try a successful run."}
                      </p>
                      {showTech && <JSONBlock value={active.output} />}
                    </div>
                  )}
                  <div className="simulation-stage-controls">
                    <button
                      disabled={step === 0}
                      onClick={() => setStep((s) => s - 1)}
                    >
                      <ChevronLeft size={15} />
                      Previous
                    </button>
                    <button
                      className="primary"
                      disabled={final}
                      onClick={() => setStep((s) => s + 1)}
                    >
                      Next stage <ArrowRight size={15} />
                    </button>
                    {!final && (
                      <button onClick={() => setStep(run.stages.length - 1)}>
                        See final output
                      </button>
                    )}
                  </div>
                </article>
              )}
            </div>
            <button
              className="simulation-trace-export"
              onClick={() =>
                download("resolveai-simulated-trace.json", {
                  simulation: true,
                  execution: "browser-only",
                  ...run,
                })
              }
            >
              <Download size={15} />
              Export full stage trace
            </button>
          </>
        )}
      </section>
      <details className="simulation-reference">
        <summary>How this simulation maps to the real backend</summary>
        <p>
          The browser models common input checks, queue transitions, retries and
          deduplication. It reuses the backend’s synthetic scenario conclusions.
          It does not execute SQL, a real worker, network authentication, rate
          limiting, or live AI. The lab accepts ISO timestamps with a timezone;
          the private API also supports Pydantic’s additional datetime formats.
        </p>
        <p>
          For comparison, download a captured execution of the selected unedited
          sample. Those receipts came from real FastAPI handlers and PostgreSQL,
          with worker stages invoked individually. They include actual 202 / 200
          / 409 / 422 / 401 responses, citation rejection and an expired-lease
          recovery. They are separate from your browser run; local capture times
          are not production performance claims.
        </p>
        <button onClick={reference} disabled={loadingTrace}>
          {loadingTrace
            ? "Loading verification…"
            : "Load verified backend recording"}
        </button>
        {traceError && (
          <p role="alert" className="error">
            {traceError}
          </p>
        )}
        {trace !== null && (
          <>
            <button
              onClick={() =>
                download(scenario + "-verified-backend-trace.json", trace)
              }
            >
              <Download size={15} />
              Download backend recording
            </button>
            <JSONBlock value={trace} />
          </>
        )}
      </details>
    </div>
  );
}
