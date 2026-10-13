import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, BookOpen, Menu, X } from "lucide-react";
import Studio from "./Studio";
import "./studio.css";

export default function CaseStudy() {
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    drawer.current?.close();
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (open) {
      drawer.current?.showModal();
      document.body.style.overflow = "hidden";
    } else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  const links = (
    <>
      <a href="https://github.com/prasanthp01/resolveai">Source &amp; documentation</a>
      <a className="current" href="#project-top">
        ResolveAI <span>01</span>
      </a>
      <a href="https://github.com/prasanthp01/flowops">FlowOps</a>
      <a href="https://github.com/prasanthp01/knowledgeops">KnowledgeOps</a>
      <a href="https://github.com/prasanthp01/agentops">AgentOps</a>
    </>
  );
  return (
    <div className="case-study" id="project-top">
      <a className="skip-link" href="#case-main">
        Skip to content
      </a>
      <aside className="case-sidebar">
        <a className="case-wordmark" href="/projects/resolveai">
          R<span>.</span>
        </a>
        <p className="studio-kicker">ENGINEERING PROJECTS</p>
        <nav aria-label="Project navigation">{links}</nav>
        <div className="case-sidebar-bottom">
          <span className="case-dot" />
          Synthetic sandbox
          <p>
            Study the implementation.
            <br />
            Experiment with the evidence.
          </p>
        </div>
      </aside>
      <dialog
        className="case-drawer"
        aria-label="Project navigation"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button, a[href]",
            ),
          ];
          const first = items[0],
            last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        ref={drawer}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === drawer.current) close();
        }}
      >
        <div>
          <button onClick={close} aria-label="Close project navigation">
            <X />
          </button>
          <nav aria-label="Mobile project navigation" onClick={close}>
            {links}
          </nav>
        </div>
      </dialog>
      <div className="case-content">
        <header className="case-topbar">
          <button
            className="case-menu"
            ref={trigger}
            aria-expanded={open}
            aria-label="Open project navigation"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <span>PROJECT / RESOLVEAI</span>
          <a href="/projects/resolveai/app/architecture">
            <BookOpen size={15} />
            Architecture & versions
          </a>
        </header>
        <main id="case-main">
          <section className="case-hero">
            <div className="case-hero-copy">
              <p className="studio-kicker">
                INCIDENT INVESTIGATION · ENGINEERING CASE STUDY
              </p>
              <img
                className="case-logo"
                src={import.meta.env.BASE_URL + "resolveai-logo.png"}
                alt="ResolveAI"
                width="245"
                height="82"
              />
              <h1>
                From an alert
                <br />
                to a defensible
                <br />
                <em>next step.</em>
              </h1>
              <p>
                Explore how an incident becomes evidence, hypotheses and a
                report a person can act on. Change the inputs. Inspect every
                stage. Test what happens when things fail.
              </p>
              <a className="case-primary" href="#simulation">
                Try the simulation <ArrowDown size={17} />
              </a>
              <a
                className="case-architecture-link"
                href="/projects/resolveai/app/architecture"
              >
                Study the architecture <ArrowRight size={16} />
              </a>
            </div>
            <div className="case-workflow">
              <p className="studio-kicker">THE INVESTIGATION</p>
              {[
                [
                  "01",
                  "Receive & validate",
                  "Bounded input, session ownership, duplicate protection",
                ],
                [
                  "02",
                  "Collect & compare",
                  "Synthetic diagnostics, competing signals, cited evidence",
                ],
                [
                  "03",
                  "Explain & qualify",
                  "Deterministic hypotheses with explicit uncertainty",
                ],
                [
                  "04",
                  "Keep a person in control",
                  "Recommendations only. No automatic remediation.",
                ],
              ].map(([n, title, text]) => (
                <div key={n}>
                  <span>{n}</span>
                  <section>
                    <h2>{title}</h2>
                    <p>{text}</p>
                  </section>
                </div>
              ))}
              <small>
                Public mode · actual server computation · synthetic evidence
              </small>
            </div>
          </section>
          <section className="case-context">
            <div>
              <p className="studio-kicker">THE PROBLEM</p>
              <h2>
                An alert is a starting point.
                <br />
                It is not a root cause.
              </h2>
            </div>
            <p>
              Operators need to separate correlated signals from unrelated
              noise. ResolveAI makes that investigation inspectable: what it
              received, which diagnostic evidence it used, why a hypothesis is
              plausible, and where the evidence stops.
            </p>
          </section>
          <section className="case-architecture">
            <div>
              <p className="studio-kicker">HIGH-LEVEL ARCHITECTURE</p>
              <h2>Two execution boundaries.</h2>
            </div>
            <div className="case-flow">
              <span>Editable input</span>
              <ArrowRight size={18} />
              <span>Isolated sandbox API</span>
              <ArrowRight size={18} />
              <span>Rules + synthetic adapters</span>
              <ArrowRight size={18} />
              <span>Events + cited report</span>
            </div>
            <p>
              The public simulator uses temporary, session-owned runs with no
              private connector access. The separate private application retains
              authenticated ingestion, PostgreSQL-backed durable jobs and
              restricted read-only diagnostic adapters.
            </p>
            <a href="/projects/resolveai/app/architecture">
              Read high-level and low-level diagrams, code references and
              version history <ArrowRight size={16} />
            </a>
          </section>
          <Studio />
          <section className="case-study-notes">
            <div>
              <p className="studio-kicker">WHAT THIS DEMONSTRATES</p>
              <h2>Evidence you can inspect.</h2>
              <p>
                Typed validation, ordered execution events, reproducible rule
                decisions, constrained diagnostics, cancellation, expiry and
                failure handling. The technical view exposes observable actions
                and structured results.
              </p>
            </div>
            <div>
              <h3>What it does not claim</h3>
              <p>
                The public run is not a live LLM diagnosis or a commercial
                production workload. Provider faults are controlled simulations.
                Real model routing is a separate authenticated integration; its
                connection must be independently verified.
              </p>
              <h3>Study exercise</h3>
              <p>
                Run the payment preset. Lower database connections to 20, choose
                a normal log, and run it again. Compare the hypotheses. Then
                select a connector timeout and inspect the partial-evidence
                warning.
              </p>
            </div>
          </section>
          <footer className="case-footer">
            <span>ResolveAI · Synthetic engineering demonstration</span>
            <a href="/projects/resolveai/app/architecture">
              Versioned architecture
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
