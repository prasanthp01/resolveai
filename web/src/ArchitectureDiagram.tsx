import { useRef, useState } from "react";
import manifest from "./diagrams/manifest.json";
import "./diagrams/diagrams.css";

const assets = import.meta.glob<string>("./diagrams/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

function DiagramCanvas({ source, title }: { source: string; title: string }) {
  const [zoom, setZoom] = useState(100);
  const viewport = useRef<HTMLDivElement>(null);
  const asset = Object.values(manifest.diagrams).find(
    (item) => item.source === source,
  );
  const svg = asset ? assets[`./diagrams/${asset.file}`] : undefined;
  return (
    <section className="diagram-wrap" aria-label={`${title} diagram`}>
      {!svg ? (
        <p role="alert">
          Diagram is unavailable for this architecture version. Read its source
          and explanation below.
        </p>
      ) : (
        <>
          <div
            className="diagram-controls"
            role="group"
            aria-label={`${title} zoom controls`}
          >
            <button
              onClick={() => setZoom((value) => Math.max(100, value - 25))}
              disabled={zoom === 100}
              aria-label="Zoom out diagram"
            >
              −
            </button>
            <span aria-live="polite">{zoom}%</span>
            <button
              onClick={() => setZoom((value) => Math.min(500, value + 25))}
              disabled={zoom === 500}
              aria-label="Zoom in diagram"
            >
              +
            </button>
            <button
              onClick={() => {
                setZoom(100);
                viewport.current?.scrollTo({ left: 0, top: 0 });
              }}
            >
              Fit
            </button>
          </div>
          <p className="diagram-help">
            Zoom to read labels, then scroll within the diagram. Fit returns to
            the available width.
          </p>
          <div
            className="diagram"
            ref={viewport}
            tabIndex={0}
            role="region"
            aria-label={`${title} scrollable diagram`}
          >
            {/* Build-validated repository assets only; never render API source as HTML. */}
            <div
              className="diagram-canvas"
              data-zoom={zoom}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </>
      )}
      <details>
        <summary>View diagram source</summary>
        <pre>{source}</pre>
      </details>
    </section>
  );
}

export default function ArchitectureDiagram(props: {
  source: string;
  title: string;
}) {
  // A changed snapshot starts at Fit and cannot retain another diagram's state.
  return <DiagramCanvas key={props.source} {...props} />;
}
