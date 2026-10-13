import { useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Result, Step } from "./studioClient";
import {
  stageGuides,
  stageOutcome,
  observedStageOutput,
  finalGuide,
  resultFieldHelp,
  resultOutcome,
  type Explanation,
} from "./studioProcessHelp";

export function ExplanationView({
  technical,
  onChange,
  label,
}: {
  technical: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <div className="studio-view-controls" role="group" aria-label={label}>
      <button
        className={!technical ? "active" : ""}
        aria-pressed={!technical}
        onClick={() => onChange(false)}
      >
        Plain language
      </button>
      <button
        className={technical ? "active" : ""}
        aria-pressed={technical}
        onClick={() => onChange(true)}
      >
        Technical details
      </button>
    </div>
  );
}

function GuideContent({ guide }: { guide: Explanation }) {
  return (
    <>
      <dl className="studio-guide-steps">
        <div>
          <dt>What it receives</dt>
          <dd>{guide.receives}</dd>
        </div>
        <div>
          <dt>What it does</dt>
          <dd>{guide.does}</dd>
        </div>
        <div>
          <dt>What it outputs</dt>
          <dd>{guide.outputs}</dd>
        </div>
        <div className="studio-guide-errors">
          <dt>How it handles errors</dt>
          <dd>{guide.errors}</dd>
        </div>
      </dl>
      <p className="studio-guide-example">
        <strong>Example:</strong> {guide.example}
      </p>
    </>
  );
}

export function ProcessingGuide({
  steps,
  result,
  runStatus,
  technical,
  onViewChange,
  selected,
  onSelect,
  transport,
}: {
  steps: Step[];
  result: Result | null;
  runStatus?: string;
  technical: boolean;
  onViewChange: (value: boolean) => void;
  selected: string | null;
  onSelect: (value: string) => void;
  transport: string;
}) {
  const guidePanel = useRef<HTMLElement>(null);
  const stageList = useRef<HTMLOListElement>(null);
  const activeId = selected || steps.at(-1)?.step_id || "received";
  const guide = stageGuides.find((g) => g.id === activeId) || stageGuides[0];
  const events = steps.filter((s) => s.step_id === guide.id);
  const outcome = stageOutcome(events, runStatus);
  const observation = observedStageOutput(guide.id, events, result);
  return (
    <div className="studio-process">
      <div className="studio-panel-title">
        <h3>
          <span>02</span> Server processing
        </h3>
        <span className="studio-status" role="status" aria-live="polite">
          {transport}
        </span>
      </div>
      <p className="studio-guide-intro">
        Select any stage to study its inputs, work, outputs and failure
        handling. The guide is available before a run; completion labels and
        observations come only from server events.
      </p>
      <ExplanationView
        technical={technical}
        onChange={onViewChange}
        label="Processing explanation view"
      />
      <ol
        className="studio-timeline"
        id="studio-stage-list"
        ref={stageList}
        aria-label="Investigation stages"
      >
        {stageGuides.map((g, i) => {
          const history = steps.filter((s) => s.step_id === g.id);
          const stage = history.at(-1);
          const state = stageOutcome(history, runStatus);
          return (
            <li key={g.id}>
              <button
                className={state.warning ? "warning" : ""}
                onClick={() => {
                  onSelect(g.id);
                  requestAnimationFrame(() => guidePanel.current?.focus());
                }}
                aria-pressed={guide.id === g.id}
                aria-controls="studio-stage-guide"
              >
                <span className="studio-step-num" aria-hidden="true">
                  {stage?.status === "SUCCEEDED" ? (
                    <Check size={15} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span>
                  <strong>{g.title}</strong>
                  <small>
                    {state.label}
                    {technical && stage
                      ? ` · ${stage.status} · ${typeof stage.duration_ms === "number" ? stage.duration_ms + " ms" : "no duration recorded"}`
                      : ""}
                  </small>
                </span>
                <ChevronDown
                  className="studio-step-arrow"
                  size={16}
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ol>
      <section
        className="studio-inspector studio-stage-guide"
        id="studio-stage-guide"
        ref={guidePanel}
        tabIndex={-1}
        aria-labelledby="studio-stage-guide-title"
      >
        <p className="studio-guide-eyebrow">
          {technical ? "Technical stage guide" : "Plain-language stage guide"}
        </p>
        <h4 id="studio-stage-guide-title">{guide.title}</h4>
        <a
          className="studio-guide-back"
          href="#studio-stage-list"
          onClick={(event) => {
            event.preventDefault();
            stageList.current
              ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
              ?.focus();
            stageList.current?.scrollIntoView({ block: "nearest" });
          }}
        >
          Back to the nine stages
        </a>
        <GuideContent guide={technical ? guide.technical : guide.plain} />
        <div className="studio-observed">
          <h4>Observed in this run</h4>
          <p>
            <strong>{outcome.label}.</strong>{" "}
            {!events.length
              ? "No server events are recorded for this stage. The guide above describes intended behavior, not work that has happened."
              : "These observations describe the accepted run, not unsent edits in the form."}
          </p>
          {observation ? (
            <p className="studio-observation-value">
              <strong>Recorded output:</strong> {observation}
            </p>
          ) : null}
          {events.length ? (
            <>
              <ul>
                {[...new Set(events.map((e) => e.overview))].map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              {technical ? (
                <details className="studio-observed-data" open>
                  <summary>Recorded events and stage data</summary>
                  <pre tabIndex={0}>
                    {JSON.stringify(
                      events.map((s) => ({
                        sequence: s.sequence,
                        status: s.status,
                        duration_ms: s.duration_ms,
                        technical: s.technical,
                        details: result?.output.step_details.find(
                          (d) => d.sequence === s.sequence,
                        )?.technical,
                      })),
                      null,
                      2,
                    )}
                  </pre>
                  <p className="studio-hint">
                    Full stage data arrives with the terminal result. Until
                    then, events expose canonical references and decisions.
                    Timing includes server checkpoints; no private model
                    reasoning is shown.
                  </p>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function FinalResultGuide({
  result,
  technical,
  onViewChange,
}: {
  result: Result | null;
  technical: boolean;
  onViewChange: (value: boolean) => void;
}) {
  return (
    <section
      className="studio-final-guide"
      aria-labelledby="studio-final-guide-title"
    >
      <div className="studio-panel-title">
        <h3 id="studio-final-guide-title">Understand the final result</h3>
        <ExplanationView
          technical={technical}
          onChange={onViewChange}
          label="Final result explanation view"
        />
      </div>
      <p className="studio-guide-intro">
        {result
          ? resultOutcome(result) + ". The observed result appears below."
          : "No final result yet. This guide explains what a completed or interrupted run will return."}
      </p>
      <GuideContent
        guide={technical ? finalGuide.technical : finalGuide.plain}
      />
      <details className="studio-result-glossary">
        <summary>What each part of the result means</summary>
        <dl>
          {resultFieldHelp.map((field) => (
            <div key={field.name}>
              <dt>{field.name}</dt>
              <dd>{technical ? field.technical : field.plain}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
