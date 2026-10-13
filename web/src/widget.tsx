import { Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import Studio from "./Studio";
import "./widget.css";

declare const __WIDGET_VERSION__: string;
const fullApp = "/projects/resolveai/app/studio#simulation";

class WidgetBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">
        The simulation could not be displayed. Reload to try again or{" "}
        <a href={fullApp}>open the full ResolveAI studio</a>.
      </p>
    ) : (
      this.props.children
    );
  }
}

/** One owned Studio implementation; Shadow DOM prevents host CSS collisions. */
class ResolveAIStudio extends HTMLElement {
  private root?: Root;
  private generation = 0;

  connectedCallback() {
    const generation = ++this.generation;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    // Emitted beside this module by the widget build; no remote or inline CSS.
    stylesheet.href = new URL(
      /* @vite-ignore */ "./resolveai-studio.css",
      import.meta.url,
    ).href;
    const fallback = document.createElement("slot");
    shadow.replaceChildren(stylesheet, fallback);
    this.dataset.widgetVersion = __WIDGET_VERSION__;
    stylesheet.onload = () => {
      if (!this.isConnected || generation !== this.generation) return;
      stylesheet.onload = null;
      const mount = document.createElement("div");
      fallback.replaceWith(mount);
      this.root = createRoot(mount);
      this.root.render(
        <WidgetBoundary>
          <Studio />
        </WidgetBoundary>,
      );
    };
    stylesheet.onerror = () => {
      if (!this.isConnected || generation !== this.generation) return;
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent = "The simulation styles could not load. Reload or ";
      const link = document.createElement("a");
      link.href = fullApp;
      link.textContent = "open the full ResolveAI studio";
      message.append(link);
      shadow.replaceChildren(message);
    };
  }

  disconnectedCallback() {
    ++this.generation;
    // Unmount closes Studio's event stream, timers and outstanding requests.
    this.root?.unmount();
    this.root = undefined;
  }
}

if (!customElements.get("resolveai-studio")) {
  customElements.define("resolveai-studio", ResolveAIStudio);
}
