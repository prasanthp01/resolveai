import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  GitBranch,
  Layers,
  Workflow,
} from "lucide-react";
import { api } from "./api";
import Diagram from "./ArchitectureDiagram";
type Section = {
  title: string;
  summary: string;
  explanation: string[];
  code: { path: string; symbol: string; purpose: string }[];
};
type Architecture = {
  version: string;
  app_version: string;
  date: string;
  source_commit: string;
  source_fingerprint: string;
  summary: string;
  changes: string[];
  high_level: { diagram: string; public_diagram?: string; sections: Section[] };
  low_level: { diagram: string; data_diagram: string; sections: Section[] };
  walkthroughs: {
    title: string;
    steps: { title: string; explanation: string; code: string }[];
  }[];
  tradeoffs: { decision: string; reason: string; alternative: string }[];
};
function Sections({ items }: { items: Section[] }) {
  return (
    <div className="architecture-sections">
      {items.map((s, i) => (
        <section key={s.title} className="chapter">
          <span className="chapter-number">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <h2>{s.title}</h2>
            <p className="lead-small">{s.summary}</p>
            {s.explanation.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <div className="code-references">
              {s.code.map((c) => (
                <div key={c.symbol}>
                  <code>
                    {c.path} · {c.symbol}
                  </code>
                  <span>{c.purpose}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
export default function ArchitecturePage() {
  const [query, setQuery] = useSearchParams();
  const [index, setIndex] = useState<{
    current: string;
    versions: { version: string; date: string; summary: string }[];
  } | null>(null);
  const [data, setData] = useState<Architecture | null>(null);
  const [error, setError] = useState("");
  const tab = query.get("view") || "high";
  const version = query.get("version") || index?.current;
  useEffect(() => {
    api<typeof index>("/architecture")
      .then(setIndex)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (version) {
      setData(null);
      api<Architecture>("/architecture/" + version)
        .then(setData)
        .catch((e) => setError(e.message));
    }
  }, [version]);
  function choose(view: string, v = version) {
    setQuery({ view, ...(v ? { version: v } : {}) });
  }
  return (
    <>
      <div className="eyebrow">
        <BookOpen size={15} /> ARCHITECTURE FIELD GUIDE
      </div>
      <div className="page-heading">
        <div>
          <h1>Understand the system.</h1>
          <p className="subtitle">
            From the first alert to the final evidence. Explore how ResolveAI
            works, and why.
          </p>
        </div>
        <label className="version-picker">
          Architecture version
          <select
            value={version || ""}
            onChange={(e) => choose(tab, e.target.value)}
          >
            {index?.versions.map((v) => (
              <option key={v.version}>{v.version}</option>
            ))}
          </select>
        </label>
      </div>
      <Link
        className="simulation-link architecture-simulation"
        to="/simulation"
      >
        Try an editable incident simulation <ArrowRight size={16} />
      </Link>
      <div className="tabs" aria-label="Architecture views">
        {[
          ["high", "High level", Layers],
          ["low", "Low level", Workflow],
          ["walkthroughs", "Walkthroughs", BookOpen],
          ["history", "Version history", GitBranch],
        ].map(([key, label, Icon]) => (
          <button
            key={String(key)}
            className={tab === key ? "active" : ""}
            onClick={() => choose(String(key))}
          >
            {typeof Icon !== "string" && <Icon size={17} />} {String(label)}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p className="loading">Loading architecture…</p>}
      {data && (
        <>
          <div className="version-meta">
            <span>APP v{data.app_version}</span>
            <span>ARCHITECTURE v{data.version}</span>
            <span>Updated {data.date}</span>
            <span title={data.source_commit}>
              Source {data.source_commit.slice(0, 10)}
            </span>
          </div>
          {tab === "high" && (
            <>
              <div className="section-intro">
                <span className="tag">THE BIG PICTURE</span>
                <h2>One application. Clear boundaries.</h2>
                <p>{data.summary}</p>
              </div>
              <h3>Private investigation pipeline</h3>
              <Diagram
                source={data.high_level.diagram}
                title="Private investigation pipeline"
              />
              {data.high_level.public_diagram && (
                <>
                  <h3>Public synthetic demo</h3>
                  <Diagram
                    source={data.high_level.public_diagram}
                    title="Public synthetic demo"
                  />
                </>
              )}
              <Sections items={data.high_level.sections} />
              <h2>Why these choices?</h2>
              <div className="tradeoffs">
                {data.tradeoffs.map((t) => (
                  <article key={t.decision}>
                    <h3>{t.decision}</h3>
                    <p>{t.reason}</p>
                    <small>Alternative considered: {t.alternative}</small>
                  </article>
                ))}
              </div>
              <button className="primary" onClick={() => choose("low")}>
                Explore the implementation <ArrowRight size={16} />
              </button>
            </>
          )}
          {tab === "low" && (
            <>
              <div className="section-intro">
                <span className="tag">INSIDE THE REQUEST</span>
                <h2>Follow acceptance and execution.</h2>
                <p>
                  Follow the run lifecycle, then study the separate private data
                  model and its durable execution guarantees.
                </p>
              </div>
              <Diagram
                source={data.low_level.diagram}
                title="Acceptance and execution"
              />
              <h2>Private investigation data model</h2>
              <Diagram
                source={data.low_level.data_diagram}
                title="Private investigation data model"
              />
              <Sections items={data.low_level.sections} />
            </>
          )}
          {tab === "walkthroughs" && (
            <>
              {data.walkthroughs.map((w, i) => (
                <section className="walkthrough" key={w.title}>
                  <div className="eyebrow">STUDY PATH {i + 1}</div>
                  <h2>{w.title}</h2>
                  <ol>
                    {w.steps.map((s) => (
                      <li key={s.title}>
                        <h3>{s.title}</h3>
                        <p>{s.explanation}</p>
                        <code>{s.code}</code>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </>
          )}
          {tab === "history" && (
            <>
              <div className="section-intro">
                <h2>A record that moves with the code.</h2>
                <p>
                  Published snapshots are retained. Architecture-affecting
                  source changes fail the consistency check until a reviewed
                  snapshot is added. A matching fingerprint detects drift; it
                  does not replace review.
                </p>
              </div>
              <div className="history-entry">
                <span className="tag">v{data.version}</span>
                <h2>{data.date}</h2>
                <ul>
                  {data.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <p>Application version: {data.app_version}</p>
                <p className="hash">
                  Source commit: <code>{data.source_commit}</code>
                </p>
                <p className="hash">
                  Source fingerprint: <code>{data.source_fingerprint}</code>
                </p>
              </div>
              {index?.versions.map((v) => (
                <button
                  className="history-link"
                  key={v.version}
                  onClick={() => choose("high", v.version)}
                >
                  <strong>{v.version}</strong>
                  <span>{v.summary}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
