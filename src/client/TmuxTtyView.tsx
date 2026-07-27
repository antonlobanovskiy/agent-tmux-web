import { PanelRight, Terminal } from "lucide-react";
import { forwardRef, useLayoutEffect, useRef, useState, type ForwardedRef, type KeyboardEvent, type UIEvent } from "react";

import type { TmuxCaptureDto } from "../shared/api.js";
import { parseOpenCodeSidebar } from "./openCodeSidebar.js";
import { TmuxOutputLines } from "./tmuxOutputLines.js";

type TmuxTtyViewProps = {
  output: string;
  sidebar?: TmuxCaptureDto["sidebar"];
  onScroll: (event: UIEvent<HTMLElement>) => void;
};

export const TmuxTtyView = forwardRef<HTMLElement, TmuxTtyViewProps>(function TmuxTtyView(
  { output, sidebar, onScroll },
  ref
) {
  const [mobilePane, setMobilePane] = useState<"terminal" | "details">("terminal");
  const terminalRef = useRef<HTMLElement | null>(null);
  const detailsRef = useRef<HTMLElement | null>(null);
  const terminalScrollInitializedRef = useRef(false);
  const terminalTabRef = useRef<HTMLButtonElement | null>(null);
  const detailsTabRef = useRef<HTMLButtonElement | null>(null);
  const mobileScrollTopRef = useRef({ terminal: 0, details: 0 });
  const terminalOutput = output || "No tmux output captured.";
  const sidebarDetails = sidebar ? parseOpenCodeSidebar(sidebar.output) : null;

  useLayoutEffect(() => {
    const node = mobilePane === "terminal" ? terminalRef.current : detailsRef.current;
    if (node) {
      node.scrollTop = mobileScrollTopRef.current[mobilePane];
    }
    assignForwardedRef(ref, terminalRef.current);
  }, [mobilePane]);

  function assignTerminal(node: HTMLElement | null) {
    terminalRef.current = node;
    if (node && !terminalScrollInitializedRef.current) {
      node.scrollTop = node.scrollHeight;
      mobileScrollTopRef.current.terminal = node.scrollTop;
      terminalScrollInitializedRef.current = true;
    }
    assignForwardedRef(ref, node);
  }

  function assignDetails(node: HTMLElement | null) {
    detailsRef.current = node;
  }

  function selectMobilePane(pane: "terminal" | "details") {
    const node = mobilePane === "terminal" ? terminalRef.current : detailsRef.current;
    if (node) {
      mobileScrollTopRef.current[mobilePane] = node.scrollTop;
    }
    setMobilePane(pane);
  }

  function handleTerminalScroll(event: UIEvent<HTMLElement>) {
    mobileScrollTopRef.current.terminal = event.currentTarget.scrollTop;
    onScroll(event);
  }

  function handleDetailsScroll(event: UIEvent<HTMLElement>) {
    mobileScrollTopRef.current.details = event.currentTarget.scrollTop;
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const pane = event.key === "Home"
      ? "terminal"
      : event.key === "End"
        ? "details"
        : event.key === "ArrowLeft"
          ? mobilePane === "terminal" ? "details" : "terminal"
          : mobilePane === "details" ? "terminal" : "details";
    selectMobilePane(pane);
    window.requestAnimationFrame(() => {
      (pane === "terminal" ? terminalTabRef.current : detailsTabRef.current)?.focus();
    });
  }

  if (!sidebar) {
    return (
      <pre ref={assignTerminal} className="tmux-output" onScroll={onScroll}>
        <TmuxOutputLines output={terminalOutput} />
      </pre>
    );
  }

  return (
    <div className="tmux-output tmux-opencode-layout">
      <div className="tmux-opencode-tabs" role="tablist" aria-label="OpenCode TTY panes">
        <button
          ref={terminalTabRef}
          aria-controls="opencode-terminal-pane"
          aria-selected={mobilePane === "terminal"}
          className={mobilePane === "terminal" ? "active" : ""}
          onClick={() => selectMobilePane("terminal")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={mobilePane === "terminal" ? 0 : -1}
          type="button"
        >
          <Terminal size={15} /> Terminal
        </button>
        <button
          ref={detailsTabRef}
          aria-controls="opencode-details-pane"
          aria-selected={mobilePane === "details"}
          className={mobilePane === "details" ? "active" : ""}
          onClick={() => selectMobilePane("details")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={mobilePane === "details" ? 0 : -1}
          type="button"
        >
          <PanelRight size={15} /> Details
        </button>
      </div>
      <pre
        ref={assignTerminal}
        aria-label="OpenCode terminal"
        className={`tmux-opencode-terminal ${mobilePane === "terminal" ? "mobile-active" : ""}`}
        id="opencode-terminal-pane"
        role="tabpanel"
        onScroll={handleTerminalScroll}
      >
        <TmuxOutputLines output={terminalOutput} />
      </pre>
      <aside
        ref={assignDetails}
        aria-label="OpenCode details"
        className={`tmux-opencode-sidebar ${mobilePane === "details" ? "mobile-active" : ""}`}
        id="opencode-details-pane"
        role="tabpanel"
        onScroll={handleDetailsScroll}
      >
        <header className="tmux-opencode-sidebar-header">
          <strong>{sidebarDetails?.title}</strong>
        </header>
        <div className="tmux-opencode-sidebar-sections">
          {sidebarDetails?.sections.map((section) => (
            <section className={`tmux-opencode-sidebar-section ${section.id}`} key={section.id}>
              <h3>{section.title}</h3>
              {section.lines.length > 0 ? (
                <ul>
                  {section.lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                </ul>
              ) : (
                <span className="tmux-opencode-sidebar-empty">None</span>
              )}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
});

function assignForwardedRef(ref: ForwardedRef<HTMLElement>, node: HTMLElement | null) {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}
