import { PanelRight, Terminal } from "lucide-react";
import { forwardRef, useLayoutEffect, useRef, useState, type Ref, type UIEvent } from "react";

import type { TmuxCaptureDto } from "../shared/api.js";
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
  const rootRef = useRef<HTMLElement | null>(null);
  const mobileScrollTopRef = useRef({ terminal: 0, details: 0 });
  const terminalOutput = output || "No tmux output captured.";

  useLayoutEffect(() => {
    if (rootRef.current) {
      rootRef.current.scrollTop = mobileScrollTopRef.current[mobilePane];
    }
  }, [mobilePane]);

  function assignRoot(node: HTMLElement | null) {
    rootRef.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  }

  function selectMobilePane(pane: "terminal" | "details") {
    if (rootRef.current) {
      mobileScrollTopRef.current[mobilePane] = rootRef.current.scrollTop;
    }
    setMobilePane(pane);
  }

  function handleScroll(event: UIEvent<HTMLElement>) {
    mobileScrollTopRef.current[mobilePane] = event.currentTarget.scrollTop;
    if (mobilePane === "terminal") {
      onScroll(event);
    }
  }

  if (!sidebar) {
    return (
      <pre ref={assignRoot as Ref<HTMLPreElement>} className="tmux-output" onScroll={onScroll}>
        <TmuxOutputLines output={terminalOutput} />
      </pre>
    );
  }

  return (
    <div ref={assignRoot as Ref<HTMLDivElement>} className="tmux-output tmux-opencode-layout" onScroll={handleScroll}>
      <div className="tmux-opencode-tabs" role="tablist" aria-label="OpenCode TTY panes">
        <button
          aria-controls="opencode-terminal-pane"
          aria-selected={mobilePane === "terminal"}
          className={mobilePane === "terminal" ? "active" : ""}
          onClick={() => selectMobilePane("terminal")}
          role="tab"
          type="button"
        >
          <Terminal size={15} /> Terminal
        </button>
        <button
          aria-controls="opencode-details-pane"
          aria-selected={mobilePane === "details"}
          className={mobilePane === "details" ? "active" : ""}
          onClick={() => selectMobilePane("details")}
          role="tab"
          type="button"
        >
          <PanelRight size={15} /> Details
        </button>
      </div>
      <pre
        aria-label="OpenCode terminal"
        className={`tmux-opencode-terminal ${mobilePane === "terminal" ? "mobile-active" : ""}`}
        id="opencode-terminal-pane"
        role="tabpanel"
      >
        <TmuxOutputLines output={terminalOutput} />
      </pre>
      <aside
        aria-label="OpenCode details"
        className={`tmux-opencode-sidebar ${mobilePane === "details" ? "mobile-active" : ""}`}
        id="opencode-details-pane"
        role="tabpanel"
      >
        <pre>
          <TmuxOutputLines anchors={false} output={sidebar.output} />
        </pre>
      </aside>
    </div>
  );
});
