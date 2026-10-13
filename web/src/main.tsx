import React, {
  useEffect,
  useState,
  createContext,
  useContext,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Link,
  Routes,
  Route,
  useParams,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  LogIn,
  Menu,
  Play,
  Plug,
  Shield,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, download, Scenario, Report, Evidence, Incident } from "./api";
import "./styles.css";
const Architecture = lazy(() => import("./Architecture"));
const Simulation = lazy(() => import("./Studio"));
const CaseStudy = lazy(() => import("./CaseStudy"));
const Config = createContext({
  demo: true,
  version: "0.3.0",
  build_sha: "development",
  live_ai_enabled: false,
});
function Pill({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"pill " + tone}>{children}</span>;
}
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
function App() {
  const [config, setConfig] = useState({
    demo: true,
    version: "0.3.0",
    build_sha: "development",
    live_ai_enabled: false,
  });
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<typeof config>("/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Config.Provider value={config}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <aside className={menu ? "sidebar open" : "sidebar"}>
          <button
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          >
            <X size={18} />
          </button>
          <Link to="/" className="brand" aria-label="ResolveAI home">
            <img
              src={import.meta.env.BASE_URL + "resolveai-logo.png"}
              alt="ResolveAI"
              width="183"
              height="61"
            />
          </Link>
          <div className="workspace">
            <span className="workspace-symbol">R</span>
            <div>
              ResolveAI workspace
              <small>
                {config.demo ? "Public sandbox" : "Private workspace"}
              </small>
            </div>
          </div>
          <div className="nav-caption">WORKSPACE</div>
          <nav>
            {[
              ["/", "Overview", LayoutDashboard],
              ["/incidents", "Incidents", Activity],
              ["/simulation", "Simulation", Play],
              ["/integrations", "Integrations", Plug],
              ["/operations", "Operations", Shield],
              ["/architecture", "Architecture", BookOpen],
            ].map(([path, label, Icon]) => (
              <NavLink
                end={path === "/"}
                onClick={() => setMenu(false)}
                key={String(path)}
                to={String(path)}
              >
                {typeof Icon !== "string" && <Icon size={18} />}
                <span>{String(label)}</span>
                {path === "/architecture" && (
                  <span className="new-label">LEARN</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="status-dot" />{" "}
            {config.demo ? "Synthetic data only" : "Authenticated environment"}
            <small>
              ResolveAI v{config.version}
              <br />
              Evidence-first investigation
            </small>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="menu-button"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
              aria-label={menu ? "Close navigation" : "Open navigation"}
            >
              {menu ? <X /> : <Menu />}
            </button>
            <span>
              <span className="status-dot" />
              {config.demo ? "SYNTHETIC DEMONSTRATION" : "PRIVATE WORKSPACE"}
            </span>
            <div>
              <Link to="/architecture">
                How it works <ArrowRight size={14} />
              </Link>
              {!config.demo && (
                <Link to="/login">
                  <LogIn size={16} /> Sign in
                </Link>
              )}
            </div>
          </header>
          <main id="main">
            <ErrorMessage message={error} />
            <Suspense fallback={<p className="loading">Loading view…</p>}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/incidents" element={<Incidents />} />
                <Route path="/demo/:slug" element={<DemoDetail />} />
                <Route path="/incidents/:id" element={<PrivateDetail />} />
                <Route path="/architecture" element={<Architecture />} />
                <Route path="/simulation" element={<Simulation />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/operations" element={<Operations />} />
                <Route path="/login" element={<Login />} />
                <Route
                  path="*"
                  element={
                    <div className="empty">
                      <h1>Page not found</h1>
                      <Link to="/">Return to overview</Link>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
            <footer>
              ResolveAI · Investigation supports a decision. It does not execute
              a response.
              <Link to="/architecture?view=history">
                Architecture & release history
              </Link>
            </footer>
          </main>
        </div>
      </div>
    </Config.Provider>
  );
}
function useScenarios() {
  const [items, setItems] = useState<Scenario[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Scenario[]>("/demo/scenarios")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  return { items, error };
}
function Overview() {
  const { items, error } = useScenarios();
  const cfg = useContext(Config);
  return (
    <>
      <div className="eyebrow">
        <Activity size={15} /> INCIDENT INVESTIGATION
      </div>
      <section className="hero">
        <div>
          <h1>
            Evidence before
            <br />
            <span>action.</span>
          </h1>
          <p>
            Turn an alert into a clear, traceable investigation. Inspect the
            signals, understand the hypotheses, and decide what happens next.
          </p>
          <div className="hero-actions">
            <Link className="primary" to="/demo/postgres-saturation">
              <Play size={16} /> Explore a sample incident
            </Link>
            <Link className="text-link" to="/architecture">
              Study the architecture <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-note">
            <Shield size={15} />{" "}
            {cfg.demo
              ? "Read-only sandbox. No live connections or AI charges."
              : "Sample incidents are synthetic. Private investigations require authentication."}
          </div>
        </div>
        <div className="pipeline-preview">
          <div className="preview-caption">
            <span className="status-dot" /> THE INVESTIGATION PATH
          </div>
          {[
            [
              "01",
              "Receive an alert",
              "Validate identity and commit durable work",
              Activity,
            ],
            [
              "02",
              "Collect the evidence",
              "Read-only diagnostics within explicit limits",
              Database,
            ],
            [
              "03",
              "Explain the findings",
              "Citations, alternatives, and uncertainty",
              FileText,
            ],
            [
              "04",
              "Put the operator in control",
              "Recommendations await human review",
              Shield,
            ],
          ].map(([n, title, desc, Icon]) => (
            <div className="pipeline-step" key={String(n)}>
              <span>{String(n)}</span>
              <div>
                <strong>{String(title)}</strong>
                <small>{String(desc)}</small>
              </div>
              {typeof Icon !== "string" && <Icon size={18} />}
            </div>
          ))}
        </div>
      </section>
      <div className="metrics-strip">
        <div>
          <strong>04</strong>
          <span>Reproducible scenarios</span>
        </div>
        <div>
          <strong>Read-only</strong>
          <span>Diagnostic capabilities</span>
        </div>
        <div>
          <strong>Traceable</strong>
          <span>Evidence and recommendations</span>
        </div>
        <div>
          <strong>Versioned</strong>
          <span>Architecture learning guide</span>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">EXPLORE THE SANDBOX</span>
          <h2>Start with a signal.</h2>
        </div>
        <Pill tone="teal">Synthetic / deterministic replay</Pill>
      </div>
      <ErrorMessage message={error} />
      <div className="scenario-grid">
        {items.map((s, i) => (
          <Link to={"/demo/" + s.slug} className="scenario-card" key={s.slug}>
            <div className="scenario-top">
              <span className="scenario-index">0{i + 1}</span>
              <Pill tone="amber">{s.severity}</Pill>
            </div>
            <h3>{s.title}</h3>
            <p>{s.description}</p>
            <div className="scenario-bottom">
              <code>{s.service}</code>
              <span>
                Investigate <ArrowRight size={16} />
              </span>
            </div>
          </Link>
        ))}
      </div>
      <section className="learning-banner">
        <BookOpen size={28} />
        <div>
          <h2>Read the system, layer by layer.</h2>
          <p>
            Interactive diagrams, real code references, and guided walkthroughs.
            Understand the decisions behind the implementation.
          </p>
        </div>
        <Link className="secondary" to="/architecture">
          Open architecture <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
function Incidents() {
  const cfg = useContext(Config);
  const { items, error: demoError } = useScenarios();
  const [data, setData] = useState<Incident[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [severity, setSeverity] = useState("");
  useEffect(() => {
    if (!cfg.demo)
      api<Incident[]>("/incidents?offset=" + offset + "&severity=" + severity)
        .then(setData)
        .catch((e) => setError(e.message));
  }, [cfg.demo, offset, severity]);
  const rows = cfg.demo
    ? items.map((s) => ({
        id: s.slug,
        service: s.service,
        message: s.title,
        severity: s.severity,
        status: "RECORDED",
        mode: "fixture",
        created_at: "2026-01-15",
      }))
    : data;
  return (
    <>
      <div className="eyebrow">INVESTIGATION WORKSPACE</div>
      <h1>Incidents</h1>
      <p className="subtitle">
        {cfg.demo
          ? "Four controlled scenarios. Every finding has an evidence trail."
          : "Review accepted incidents and their investigation state."}
      </p>
      <div className="toolbar">
        <label>
          Find a service
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search services"
          />
        </label>
        <label>
          Severity
          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All severities</option>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <ErrorMessage message={error || demoError} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Incident / service</th>
              <th>Severity</th>
              <th>Investigation</th>
              <th>Mode</th>
              <th>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(
                (r) =>
                  r.service.includes(q) &&
                  (!severity || r.severity === severity),
              )
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={(cfg.demo ? "/demo/" : "/incidents/") + r.id}>
                      <strong>{r.message}</strong>
                      <small>{r.service}</small>
                    </Link>
                  </td>
                  <td>
                    <Pill tone="amber">{r.severity}</Pill>
                  </td>
                  <td>
                    <Pill>{r.status.replaceAll("_", " ")}</Pill>
                  </td>
                  <td>
                    {r.mode === "fixture" ? "Synthetic" : "Live requested"}
                  </td>
                  <td>
                    <Link
                      aria-label={"Open " + r.service}
                      to={(cfg.demo ? "/demo/" : "/incidents/") + r.id}
                    >
                      <ChevronRight size={20} />
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!rows.length && !error && (
        <div className="empty">
          <Activity />
          <h2>No incidents yet</h2>
          <p>
            Register an application and credential, then send your first
            authenticated event.
          </p>
          <Link to="/integrations" className="secondary">
            Configure an integration
          </Link>
        </div>
      )}
      {!cfg.demo && (
        <div className="pagination">
          <button
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            Previous
          </button>
          <span>Page {offset / 25 + 1}</span>
          <button
            disabled={data.length < 25}
            onClick={() => setOffset(offset + 25)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
function ReportView({
  report,
  evidence,
}: {
  report: Report;
  evidence: Evidence[];
}) {
  return (
    <>
      <div className="report-summary">
        <div className="eyebrow">
          <FileText size={15} /> INVESTIGATION REPORT
        </div>
        <h2>{report.summary}</h2>
        <p>{report.impact}</p>
        <Pill tone="teal">
          {report.investigation_mode === "fixture"
            ? "Deterministic synthetic analysis"
            : report.investigation_mode.replaceAll("_", " ")}
        </Pill>
      </div>
      <div className="report-grid">
        <div>
          <h2>Plausible causes</h2>
          {report.hypotheses.length ? (
            report.hypotheses.map((h, i) => (
              <article className="hypothesis" key={h.title}>
                <span className="chapter-number">0{i + 1}</span>
                <div>
                  <h3>{h.title}</h3>
                  <p>{h.rationale}</p>
                  <div className="evidence-links">
                    {h.evidence_ids.map((id) => (
                      <a href={"#" + id} key={id}>
                        Evidence {evidence.findIndex((e) => e.id === id) + 1}{" "}
                        <ArrowRight size={12} />
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p>
              Insufficient evidence. Collect more diagnostic signals before
              proposing a cause.
            </p>
          )}
          <div className="uncertainty">
            <TriangleAlert size={20} />
            <div>
              <h3>What we cannot conclude</h3>
              <p>{report.uncertainty}</p>
            </div>
          </div>
          <h2>Recommended next steps</h2>
          <ol className="recommendations">
            {report.recommended_next_steps.map((s) => (
              <li key={s}>
                {s}
                <small>Human review required · Not executed</small>
              </li>
            ))}
          </ol>
        </div>
        <aside className="evidence-panel">
          <h2>
            Evidence ledger <span>{evidence.length}</span>
          </h2>
          {evidence.map((e, i) => (
            <article id={e.id} key={e.id}>
              <div className="eyebrow">EVIDENCE {i + 1}</div>
              <h3>{e.source}</h3>
              <dl>
                {Object.entries(e.data).map(([key, value]) => (
                  <React.Fragment key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>{String(value)}</dd>
                  </React.Fragment>
                ))}
              </dl>
              <small>{new Date(e.observed_at).toLocaleString()}</small>
            </article>
          ))}
        </aside>
      </div>
    </>
  );
}
function DemoDetail() {
  const { slug } = useParams();
  const [data, setData] = useState<Scenario | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(5);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState("report");
  useEffect(() => {
    setData(null);
    setPlaying(false);
    setStep(5);
    api<Scenario>("/demo/scenarios/" + slug)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [slug]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setStep((s) => {
          if (s >= 4) {
            setPlaying(false);
            return 5;
          }
          return s + 1;
        }),
      850,
    );
    return () => clearInterval(timer);
  }, [playing]);
  return (
    <>
      <Link className="back" to="/incidents">
        ← All incidents
      </Link>
      <ErrorMessage message={error} />
      {!data && !error && <p className="loading">Loading investigation…</p>}
      {data && (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">SYNTHETIC INCIDENT · {data.service}</div>
              <h1 className="detail-title">{data.title}</h1>
              <p className="subtitle">{data.description}</p>
            </div>
            <Pill tone="amber">{data.severity}</Pill>
          </div>
          <div className="demo-notice">
            <Shield size={18} />
            <span>
              Recorded simulation. Evidence and timing are synthetic. No live
              model or connector is called.
            </span>
          </div>
          <div className="toolbar compact">
            <Link
              className="simulation-link"
              to={"/simulation?scenario=" + data.slug}
            >
              Study each stage <ArrowRight size={15} />
            </Link>
            <button
              className="primary"
              disabled={playing}
              onClick={() => {
                setStep(0);
                setPlaying(true);
                setTab("timeline");
              }}
            >
              <Play size={15} />
              {playing ? "Replaying…" : "Replay investigation"}
            </button>
            <button
              onClick={() => download(data.slug + "-report.json", data.report)}
            >
              <FileText size={15} /> Export report
            </button>
            <span className="muted">
              <Clock size={15} /> {data.duration} simulated
            </span>
          </div>
          <div className="tabs">
            <button
              className={tab === "report" ? "active" : ""}
              onClick={() => setTab("report")}
            >
              Report & evidence
            </button>
            <button
              className={tab === "timeline" ? "active" : ""}
              onClick={() => setTab("timeline")}
            >
              Investigation timeline
            </button>
          </div>
          {tab === "report" ? (
            <ReportView report={data.report} evidence={data.evidence} />
          ) : (
            <div className="timeline">
              {data.timeline.slice(0, step).map((s, i) => (
                <article key={s.action}>
                  <div className="timeline-marker">
                    <Check size={16} />
                  </div>
                  <div>
                    <span className="eyebrow">
                      T+{s.offset}s · STEP {i + 1}
                    </span>
                    <h3>{s.action}</h3>
                    <p>{s.description}</p>
                  </div>
                </article>
              ))}
              {playing && (
                <p role="status">Replaying the next recorded step…</p>
              )}
              {!playing && (
                <button className="primary" onClick={() => setTab("report")}>
                  Read the report <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
function PrivateDetail() {
  const { id } = useParams();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [result, setResult] = useState<{
    report: Report | null;
    evidence: Evidence[];
  } | null>(null);
  const [timeline, setTimeline] = useState<
    { id: string; action: string; created_at: string }[]
  >([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  async function refresh() {
    try {
      const [i, r, t] = await Promise.all([
        api<Incident>("/incidents/" + id),
        api<typeof result>("/incidents/" + id + "/report"),
        api<typeof timeline>("/incidents/" + id + "/timeline"),
      ]);
      setIncident(i);
      setResult(r);
      setTimeline(t);
      setNote(i.note);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, [id]);
  return (
    <>
      <Link className="back" to="/incidents">
        ← All incidents
      </Link>
      <ErrorMessage message={error} />
      {incident && (
        <>
          <h1>{incident.service}</h1>
          <p>{incident.message}</p>
          <div className="toolbar compact">
            <Pill>{incident.status}</Pill>
            <button onClick={refresh}>Refresh</button>
            <button
              onClick={async () => {
                try {
                  await api("/incidents/" + id + "/investigations", {
                    method: "POST",
                  });
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Request safe retry
            </button>
            {result?.report && (
              <button
                onClick={() => download(id + "-report.json", result.report)}
              >
                Export report
              </button>
            )}
          </div>
          {result?.report ? (
            <ReportView report={result.report} evidence={result.evidence} />
          ) : (
            <p className="empty">
              The report is not ready. Investigation status: {incident.status}.
            </p>
          )}
          <h2>Audit timeline</h2>
          <ul>
            {timeline.map((t) => (
              <li key={t.id}>
                {t.action.replaceAll("_", " ")} ·{" "}
                {new Date(t.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
          <label>
            Operator notes
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
          </label>
          <button
            onClick={async () => {
              try {
                await api("/incidents/" + id + "/note", {
                  method: "PATCH",
                  body: JSON.stringify({ note }),
                });
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save note
          </button>
        </>
      )}
    </>
  );
}
function Login() {
  const cfg = useContext(Config);
  const nav = useNavigate();
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-panel">
      <div className="eyebrow">PRIVATE WORKSPACE</div>
      <h1>Owner sign in</h1>
      <p>
        Administrator access is created through the local bootstrap command.
        Public registration is unavailable.
      </p>
      {cfg.demo ? (
        <div className="demo-notice">
          This instance is a read-only synthetic demo.
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const result = await api<{ csrf_token: string }>("/auth/login", {
                method: "POST",
                body: JSON.stringify({ username, password }),
              });
              sessionStorage.setItem("csrf", result.csrf_token);
              nav("/integrations");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <ErrorMessage message={error} />
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
type AppRecord = {
  id: string;
  name: string;
  slug: string;
  environments: { id: string; name: string }[];
};
type CredentialRecord = {
  id: string;
  name: string;
  environment_id: string;
  revoked: boolean;
  expires_at: string;
};
type ConnectorRecord = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  last_health: string;
};
function Integrations() {
  const cfg = useContext(Config);
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secret, setSecret] = useState<{
    token: string;
    webhook_secret: string | null;
    id: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const [a, c, x] = await Promise.all([
        api<AppRecord[]>("/applications"),
        api<CredentialRecord[]>("/credentials"),
        api<ConnectorRecord[]>("/connectors"),
      ]);
      setApps(a);
      setCredentials(c);
      setConnectors(x);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!cfg.demo) refresh();
  }, [cfg.demo]);
  async function submit(
    e: React.FormEvent<HTMLFormElement>,
    path: string,
    transform: (d: FormData) => unknown,
    showSecret = false,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        token: string;
        webhook_secret: string | null;
        id: string;
      }>(path, {
        method: "POST",
        body: JSON.stringify(transform(new FormData(form))),
      });
      if (showSecret) setSecret(result);
      form.reset();
      setNotice("Saved successfully.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const envs = apps.flatMap((a) =>
    a.environments.map((e) => ({ ...e, app: a.name })),
  );
  function EnvSelect() {
    return (
      <label>
        Environment
        <select name="environment_id" required>
          <option value="">Select an environment</option>
          {envs.map((e) => (
            <option value={e.id} key={e.id}>
              {e.app} / {e.name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <>
      <div className="eyebrow">CONTROLLED CONNECTIONS</div>
      <h1>Integrations</h1>
      <p className="subtitle">
        Identity first. Explicit scope. Read-only evidence collection.
      </p>
      {cfg.demo ? (
        <>
          <div className="demo-notice">
            <Shield size={18} /> Public visitors cannot register destinations,
            reveal credentials, or contact live systems.
          </div>
          <div className="integration-catalog">
            {[
              [
                "Generic webhook",
                "Authenticated event intake with HMAC signatures, timestamp checks, and replay protection.",
                Activity,
              ],
              [
                "PostgreSQL",
                "Fixed aggregate queries for connection counts and lock waits. No application rows or arbitrary SQL.",
                Database,
              ],
              [
                "Redis",
                "Selected memory and eviction metrics through restricted ACL commands. No cached business values.",
                Plug,
              ],
            ].map(([title, desc, Icon]) => (
              <article key={String(title)}>
                {typeof Icon !== "string" && <Icon size={28} />}
                <div>
                  <h2>{String(title)}</h2>
                  <p>{String(desc)}</p>
                  <Pill>Fixture equivalent in this demo</Pill>
                </div>
              </article>
            ))}
          </div>
          <Link className="secondary" to="/architecture?view=low">
            Study connector boundaries <ArrowRight size={16} />
          </Link>
        </>
      ) : (
        <>
          <ErrorMessage message={error} />
          {error.includes("login") && (
            <Link className="primary" to="/login">
              Sign in
            </Link>
          )}
          {notice && (
            <p role="status" className="success">
              {notice}
            </p>
          )}
          {secret && (
            <section className="secret-panel">
              <h2>Save these credentials now</h2>
              <p>They are disclosed once. Store them in your secret manager.</p>
              <label>
                Integration ID
                <input readOnly value={secret.id} />
              </label>
              <label>
                Bearer token
                <input readOnly value={secret.token} />
              </label>
              {secret.webhook_secret && (
                <label>
                  Webhook signing secret
                  <input readOnly value={secret.webhook_secret} />
                </label>
              )}
              <button onClick={() => setSecret(null)}>
                I have saved them · Hide
              </button>
            </section>
          )}
          <div className="form-grid">
            <form
              onSubmit={(e) =>
                submit(e, "/applications", (d) => ({
                  name: d.get("name"),
                  slug: d.get("slug"),
                }))
              }
            >
              <h2>1. Register an application</h2>
              <label>
                Application name
                <input name="name" required maxLength={100} />
              </label>
              <label>
                URL-safe slug
                <input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,79}" />
              </label>
              <button disabled={busy} className="primary">
                Create application
              </button>
            </form>
            <form
              onSubmit={(e) => {
                const d = new FormData(e.currentTarget);
                return submit(
                  e,
                  "/applications/" + d.get("app") + "/environments",
                  (d) => ({ name: d.get("name") }),
                );
              }}
            >
              <h2>2. Add an environment</h2>
              <label>
                Application
                <select name="app" required>
                  <option value="">Select application</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Environment name
                <input
                  name="name"
                  placeholder="staging"
                  required
                  maxLength={60}
                />
              </label>
              <button disabled={busy} className="primary">
                Create environment
              </button>
            </form>
            <form
              onSubmit={(e) =>
                submit(
                  e,
                  "/credentials",
                  (d) => ({
                    name: d.get("name"),
                    environment_id: d.get("environment_id"),
                  }),
                  true,
                )
              }
            >
              <h2>3. Issue a scoped credential</h2>
              <EnvSelect />
              <label>
                Credential label
                <input name="name" required maxLength={80} />
              </label>
              <p className="muted">
                Read and ingest incidents from this source. Expires after 90
                days.
              </p>
              <button disabled={busy} className="primary">
                Create credential
              </button>
            </form>
            <form
              onSubmit={(e) =>
                submit(e, "/connectors", (d) => ({
                  name: d.get("name"),
                  environment_id: d.get("environment_id"),
                  kind: d.get("kind"),
                  host: d.get("host"),
                  port: Number(d.get("port")),
                  database: d.get("database"),
                  username: d.get("username"),
                  password: d.get("password"),
                  tls: d.get("tls") === "on",
                }))
              }
            >
              <h2>4. Register a diagnostic connector</h2>
              <EnvSelect />
              <label>
                Label
                <input name="name" required />
              </label>
              <div className="two-fields">
                <label>
                  Type
                  <select name="kind">
                    <option value="postgres">PostgreSQL</option>
                    <option value="redis">Redis</option>
                  </select>
                </label>
                <label>
                  Port
                  <input
                    name="port"
                    type="number"
                    min="1"
                    max="65535"
                    required
                  />
                </label>
              </div>
              <label>
                Approved IP address
                <input name="host" required />
              </label>
              <p className="muted">
                The operator must first configure an exact destination network
                allowlist.
              </p>
              <label>
                Database name
                <input name="database" defaultValue="postgres" required />
              </label>
              <label>
                Monitoring username
                <input name="username" required />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="check-label">
                <input name="tls" type="checkbox" defaultChecked /> Require
                verified TLS
              </label>
              <button disabled={busy} className="primary">
                Register connector
              </button>
            </form>
          </div>
          <h2>Credentials</h2>
          {credentials.map((c) => (
            <div className="resource-row" key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <small>
                  Expires {new Date(c.expires_at).toLocaleDateString()}
                </small>
              </div>
              <Pill>{c.revoked ? "Revoked" : "Active"}</Pill>
              <button
                disabled={c.revoked}
                onClick={async () => {
                  try {
                    await api("/credentials/" + c.id, { method: "DELETE" });
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Revoke
              </button>
            </div>
          ))}
          <h2>Diagnostic connectors</h2>
          {!connectors.length && (
            <p className="muted">
              No connectors registered. Synthetic investigations work without
              them.
            </p>
          )}
          {connectors.map((c) => (
            <div className="resource-row" key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <small>{c.kind}</small>
              </div>
              <Pill>{c.last_health}</Pill>
              <button
                disabled={!c.enabled}
                onClick={async () => {
                  try {
                    await api("/connectors/" + c.id + "/test", {
                      method: "POST",
                    });
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Test connection
              </button>
              <button
                disabled={!c.enabled}
                onClick={async () => {
                  try {
                    await api("/connectors/" + c.id, { method: "DELETE" });
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Disable
              </button>
            </div>
          ))}
        </>
      )}
    </>
  );
}
function Operations() {
  const cfg = useContext(Config);
  const [data, setData] = useState<{
    jobs: Record<string, number>;
    model_requests_today: number;
    daily_model_request_limit: number;
  } | null>(null);
  const [audit, setAudit] = useState<
    { id: string; action: string; created_at: string }[]
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!cfg.demo)
      Promise.all([
        api<typeof data>("/operations"),
        api<typeof audit>("/audit"),
      ])
        .then(([d, a]) => {
          setData(d);
          setAudit(a);
        })
        .catch((e) => setError(e.message));
  }, [cfg.demo]);
  return (
    <>
      <div className="eyebrow">VISIBILITY & LIMITS</div>
      <h1>Operations</h1>
      <p className="subtitle">
        Understand the operating mode, execution limits, and recovery behavior.
      </p>
      <ErrorMessage message={error} />
      <div className="operations-grid">
        <article>
          <Shield size={25} />
          <h2>{cfg.demo ? "Synthetic public instance" : "Private instance"}</h2>
          <p>
            {cfg.demo
              ? "Public requests read bounded fixture assets. No private database, live connector, or paid inference is required."
              : "An administrator manages scoped ingestion and diagnostic connectors. Model usage requires explicit server configuration."}
          </p>
        </article>
        <article>
          <GitBranch size={25} />
          <h2>Durable investigation jobs</h2>
          <p>
            Private mode uses a PostgreSQL queue, expiring ownership leases, and
            fenced completion writes. Exhausted retries remain visible for
            operator review.
          </p>
        </article>
        <article>
          <Terminal size={25} />
          <h2>Human-controlled response</h2>
          <p>
            Tools collect diagnostic metrics. Reports explain findings and
            suggest next steps. No shell execution, database mutation, or
            automatic rollback is available.
          </p>
        </article>
      </div>
      {data && (
        <>
          <h2>Current job states</h2>
          <div className="metrics-strip">
            {Object.entries(data.jobs).map(([k, v]) => (
              <div key={k}>
                <strong>{v}</strong>
                <span>{k}</span>
              </div>
            ))}
            <div>
              <strong>
                {data.model_requests_today} / {data.daily_model_request_limit}
              </strong>
              <span>Model requests today</span>
            </div>
          </div>
          <h2>Audit events</h2>
          <ul className="audit-list">
            {audit.map((a) => (
              <li key={a.id}>
                <span>{a.action.replaceAll("_", " ")}</span>
                <small>{new Date(a.created_at).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </>
      )}
      <section className="learning-banner">
        <BookOpen size={28} />
        <div>
          <h2>Study a failure, before it happens.</h2>
          <p>
            Follow worker recovery, duplicate-event handling, and connector
            denial in the architecture walkthroughs.
          </p>
        </div>
        <Link className="secondary" to="/architecture?view=walkthroughs">
          Open walkthroughs <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter
    basename={
      location.pathname.startsWith("/projects/resolveai/app")
        ? "/projects/resolveai/app"
        : "/"
    }
  >
    {["/projects/resolveai", "/projects/resolveai/app/studio"].includes(
      location.pathname.replace(/\/$/, ""),
    ) ? (
      <Suspense fallback={<p>Loading ResolveAI…</p>}>
        <CaseStudy />
      </Suspense>
    ) : (
      <App />
    )}
  </BrowserRouter>,
);
