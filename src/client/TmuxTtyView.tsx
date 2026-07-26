import { PanelRight, Terminal } from "lucide-react";
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type ForwardedRef,
  type KeyboardEvent,
  type PointerEvent,
  type UIEvent,
  type WheelEvent
} from "react";

import type { TmuxCaptureDto } from "../shared/api.js";
import { parseOpenCodeSidebar } from "./openCodeSidebar.js";
import {
  nextTmuxHarnessFrameScrollTop,
  tmuxHarnessHistoryDirectionFromDelta,
  type TmuxHarnessHistoryDirection
} from "./tmuxHarnessHistory.js";
import { TmuxOutputLines } from "./tmuxOutputLines.js";

type TmuxTtyViewProps = {
  output: string;
  historyOwner: TmuxCaptureDto["historyOwner"];
  sidebar?: TmuxCaptureDto["sidebar"];
  onHarnessHistory: (direction: TmuxHarnessHistoryDirection) => void;
  onScroll: (event: UIEvent<HTMLElement>) => void;
};

export const TmuxTtyView = forwardRef<HTMLElement, TmuxTtyViewProps>(function TmuxTtyView(
  { output, historyOwner, sidebar, onHarnessHistory, onScroll },
  ref
) {
  const [mobilePane, setMobilePane] = useState<"terminal" | "details">("terminal");
  const terminalRef = useRef<HTMLElement | null>(null);
  const detailsRef = useRef<HTMLElement | null>(null);
  const terminalScrollInitializedRef = useRef(false);
  const mobileScrollTopRef = useRef({ terminal: 0, details: 0 });
  const historyWheelDeltaRef = useRef(0);
  const historyPointerRef = useRef<{ id: number; startY: number } | null>(null);
  const terminalOutput = output || "No tmux output captured.";
  const sidebarDetails = sidebar ? parseOpenCodeSidebar(sidebar.output) : null;
  const harnessOwnsHistory = historyOwner === "harness";
  const terminalHistoryClass = harnessOwnsHistory ? " harness-history" : "";

  useLayoutEffect(() => {
    const node = mobilePane === "terminal" ? terminalRef.current : detailsRef.current;
    if (node) {
      if (mobilePane === "terminal" && !terminalScrollInitializedRef.current) {
        node.scrollTop = node.scrollHeight;
        terminalScrollInitializedRef.current = true;
      } else {
        node.scrollTop = mobileScrollTopRef.current[mobilePane];
      }
    }
    assignForwardedRef(ref, node);
  }, [mobilePane]);

  function assignTerminal(node: HTMLElement | null) {
    terminalRef.current = node;
    if (mobilePane === "terminal") {
      assignForwardedRef(ref, node);
    }
  }

  function assignDetails(node: HTMLElement | null) {
    detailsRef.current = node;
    if (mobilePane === "details") {
      assignForwardedRef(ref, node);
    }
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
    onScroll(event);
  }

  function handleTerminalWheel(event: WheelEvent<HTMLElement>) {
    if (!harnessOwnsHistory) {
      return;
    }
    const scale = event.deltaMode === 1
      ? 18
      : event.deltaMode === 2
        ? event.currentTarget.clientHeight
        : 1;
    historyWheelDeltaRef.current += event.deltaY * scale;
    const delta = historyWheelDeltaRef.current;
    const direction = tmuxHarnessHistoryDirectionFromDelta(delta);
    if (direction) {
      historyWheelDeltaRef.current = 0;
      if (scrollHarnessFrame(event.currentTarget, delta)) {
        return;
      }
      onHarnessHistory(direction);
    }
  }

  function handleTerminalKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!harnessOwnsHistory || (event.key !== "PageUp" && event.key !== "PageDown")) {
      return;
    }
    event.preventDefault();
    const direction = event.key === "PageUp" ? "up" : "down";
    const delta = direction === "up" ? -event.currentTarget.clientHeight : event.currentTarget.clientHeight;
    if (!scrollHarnessFrame(event.currentTarget, delta)) {
      onHarnessHistory(direction);
    }
  }

  function handleTerminalPointerDown(event: PointerEvent<HTMLElement>) {
    if (!harnessOwnsHistory || event.pointerType !== "touch") {
      return;
    }
    historyPointerRef.current = { id: event.pointerId, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTerminalPointerEnd(event: PointerEvent<HTMLElement>) {
    const gesture = historyPointerRef.current;
    if (!gesture || gesture.id !== event.pointerId) {
      return;
    }
    historyPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const delta = gesture.startY - event.clientY;
    const direction = tmuxHarnessHistoryDirectionFromDelta(delta);
    if (direction) {
      event.preventDefault();
      if (!scrollHarnessFrame(event.currentTarget, delta)) {
        onHarnessHistory(direction);
      }
    }
  }

  function scrollHarnessFrame(node: HTMLElement, delta: number): boolean {
    const nextScrollTop = nextTmuxHarnessFrameScrollTop(node, delta);
    if (nextScrollTop === null) {
      return false;
    }
    node.scrollTop = nextScrollTop;
    return true;
  }

  function handleTerminalPointerCancel(event: PointerEvent<HTMLElement>) {
    if (historyPointerRef.current?.id === event.pointerId) {
      historyPointerRef.current = null;
    }
  }

  const historyInteractionProps = {
    onKeyDown: handleTerminalKeyDown,
    onPointerCancel: handleTerminalPointerCancel,
    onPointerDown: handleTerminalPointerDown,
    onPointerUp: handleTerminalPointerEnd,
    onWheel: handleTerminalWheel,
    tabIndex: harnessOwnsHistory ? 0 : undefined
  };

  if (!sidebar) {
    return (
      <pre
        ref={assignTerminal}
        aria-label={harnessOwnsHistory ? "Harness output. Swipe or use Page Up and Page Down to browse history." : undefined}
        className={`tmux-output${terminalHistoryClass}`}
        onScroll={onScroll}
        {...historyInteractionProps}
      >
        <TmuxOutputLines output={terminalOutput} />
      </pre>
    );
  }

  return (
    <div className="tmux-output tmux-opencode-layout">
      <div className="tmux-opencode-tabs" role="tablist" aria-label="OpenCode TTY panes">
        <button
          aria-controls="opencode-terminal-pane"
          aria-selected={mobilePane === "terminal"}
          className={mobilePane === "terminal" ? "active" : ""}
          onClick={() => selectMobilePane("terminal")}
          role="tab"
          type="button"
        >
          <Terminal size={15} /> Stream
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
        ref={assignTerminal}
        aria-label="OpenCode stream"
        className={`tmux-opencode-terminal${terminalHistoryClass} ${mobilePane === "terminal" ? "mobile-active" : ""}`}
        id="opencode-terminal-pane"
        role="tabpanel"
        onScroll={handleTerminalScroll}
        {...historyInteractionProps}
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
