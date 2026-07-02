import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  ChevronRight,
  CircleStop,
  CornerDownLeft,
  Cpu,
  Download,
  Folder,
  Keyboard,
  ListFilter,
  Menu,
  MessageSquare,
  Moon,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Sun,
  Terminal as TerminalIcon,
  Trash2,
  X,
  Wrench
} from "lucide-react";
import { ClipboardEvent, FormEvent, KeyboardEvent, UIEvent, forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { AppStatus, CodexModel, CodexSkill, TmuxSessionDto, TmuxToolDto, TmuxWatchEvent, UploadedFileDto } from "../shared/api.js";
import { describeThreadItem, type UiEventDescription } from "../shared/codexEvents.js";
import {
  filterSlashCommands,
  parseSlashCommand,
  replaceSlashQuery,
  slashQueryForMessage,
  type SlashCommand
} from "./slashCommands.js";
import { COLOR_THEME_STORAGE_KEY, nextColorTheme, resolveInitialColorTheme, type ColorTheme } from "./theme.js";
import { buildCompactTmuxMessages, summarizeTmuxAgent, type CompactTmuxMessage, type TmuxAgentSummary } from "./agentStatus.js";
import { applyTextareaPaste, buildPastedPromptText, extractPastedImageFiles, shouldSubmitTextareaEnter } from "./inputBehavior.js";
import { LinkifiedText } from "./LinkifiedText.js";
import { shouldShowTmuxSendForm } from "./rawTerminalMode.js";
import { parseTmuxChatOutput, splitTmuxChatMessage, type TmuxChatMessage } from "./tmuxGui.js";
import { shouldAutoCaptureTmux, TMUX_CAPTURE_POLL_INTERVAL_MS, TMUX_SEND_FOLLOW_DELAYS_MS } from "./tmuxFollow.js";
import { TmuxOutputLines } from "./tmuxOutputLines.js";
import { buildTmuxDoneNotification } from "./tmuxNotifications.js";
import { normalizeRequestedTmuxSession, readRequestedTmuxSession, removeRequestedTmuxSession } from "./tmuxSessionTarget.js";
import { buildTmuxAttentionEvents } from "./tmuxAttention.js";
import { canShowBrowserNotifications, canShowWebSocketTaskNotifications, getBrowserNotificationAvailability, getBrowserNotificationSnapshot, setAndroidWatchPollingEnabled, showAgentNotification } from "./browserNotifications.js";

type TimelineEntry = {
  id: string;
  kind: string;
  title: string;
  body: string;
  status?: string;
};

type ThreadSummary = {
  id: string;
  preview: string;
  name: string | null;
  cwd: string;
  status: string;
  updatedAt: number;
};

type WsPayload = {
  type: string;
  status?: AppStatus | Partial<AppStatus["codex"]>;
  recentEvents?: WsPayload[];
  description?: UiEventDescription;
  notification?: unknown;
  event?: TmuxWatchEvent;
  tmuxWatchEvents?: TmuxWatchEvent[];
};

type TmuxScrollSnapshot = {
  anchorIndex: number;
  anchorOffsetTop: number;
  anchorText: string;
  scrollTop: number;
};

const defaultCwd = "";
const TMUX_CAPTURE_HISTORY_LINES = 1000;
const TMUX_TERMINAL_SUBMIT_DELAY_MS = 350;
const RAW_TERMINAL_INPUT_CHUNK_SIZE = 16_000;
const TMUX_NOTIFICATION_STORAGE_KEY = "agent-tmux-web.notify";
const TMUX_SCROLL_ANCHOR_SELECTOR = "[data-tmux-scroll-anchor]";
const demoMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");
const DEMO_STATUS: AppStatus = {
  bindHost: "127.0.0.1",
  port: 6174,
  defaultCwd: "/workspace/project",
  tailscaleIp: "100.x.y.z",
  tailscaleDns: "agent-server.tailnet.example",
  codex: {
    connected: false,
    appServerUrl: "ws://127.0.0.1:43117",
    initialized: false,
    lastError: null
  }
};
const DEMO_TMUX_SESSIONS: TmuxSessionDto[] = [
  { name: "agent-demo", windows: 1, created: "Thu May 14 09:00:00 2026", attached: true, status: { kind: "running", health: "green", title: "Running" } },
  { name: "release-notes", windows: 1, created: "Thu May 14 09:10:00 2026", attached: false, status: { kind: "waiting", health: "yellow", title: "Waiting for input" } },
  { name: "infra-check", windows: 2, created: "Thu May 14 09:20:00 2026", attached: false, status: { kind: "needs-permission", health: "yellow", title: "Needs permission" } }
];
const DEMO_TMUX_WATCH_EVENTS: TmuxWatchEvent[] = [
  {
    id: 2,
    session: "release-notes",
    label: "Codex",
    startedAt: "2026-05-14T13:02:00.000Z",
    finishedAt: "2026-05-14T13:07:00.000Z"
  },
  {
    id: 1,
    session: "infra-check",
    label: "Claude",
    startedAt: "2026-05-14T13:00:00.000Z",
    finishedAt: "2026-05-14T13:05:00.000Z"
  }
];
const DEMO_TMUX_TOOLS: TmuxToolDto[] = [
  { id: "codex", label: "Codex", command: "codex", defaultSessionName: "codex", modes: [{ id: "yolo", label: "Yolo", args: "--yolo" }] },
  { id: "claude", label: "Claude", command: "claude", defaultSessionName: "claude" },
  { id: "gemini", label: "Gemini", command: "gemini", defaultSessionName: "gemini" }
];
const DEMO_TMUX_OUTPUT = [
  "› Review the mobile release checklist and prep the launch notes.",
  "",
  "• Mobile layout checked at 390px wide.",
  "• Tmux sessions keep running on the server while the browser stays lightweight.",
  "• Codex, Claude, Gemini, and custom CLI commands can launch from the same menu.",
  "• Force Sync updates the captured pane without stealing your scroll position.",
  "",
  "```terminal",
  "pnpm test",
  "57 tests passed",
  "pnpm build",
  "production bundle ready",
  "pnpm android:build:public",
  "public APK verified: no embedded URL or token",
  "```",
  "",
  "› Attach docs/release-plan.md and summarize next steps.",
  "",
  "• Uploaded files are stored as temporary server paths.",
  "• Auto-capture can read a deeper tmux history so older context stays reachable.",
  "• When you scroll up, new output waits quietly until you jump back to latest.",
  "",
  "```terminal",
  "tmux capture-pane -p -S -1000",
  "history captured without attaching",
  "```",
  "",
  "› Open raw tmux for a stuck TUI and send Ctrl-C.",
  "",
  "• Raw tmux mode keeps native arrow keys, Ctrl-C, and exact TUI behavior available.",
  "• Detach returns to the same long-lived session.",
  "",
  "Working (2m 14s • esc to interrupt)",
  "",
  "  agent demo · ~/workspace/project"
].join("\n");
const DEMO_RAW_TERMINAL_OUTPUT = [
  "$ tmux attach -t agent-demo",
  "agent-demo:0.0  390x844  raw browser terminal",
  "",
  "$ claude",
  "",
  "Claude Code  /workspace/project",
  "> /status",
  "connected: tmux session agent-demo",
  "keys: Esc Tab Ctrl-C Ctrl-D Ctrl-L arrows Enter",
  "",
  "> Review mobile captures and README",
  "Working... use Ctrl-C to stop or detach to keep it running.",
  "",
  "agent-demo $"
].join("\n");

function resizeTmuxInput(node: HTMLTextAreaElement | null) {
  if (!node) {
    return;
  }

  node.style.height = "0px";
  const maxHeight = 112;
  const nextHeight = Math.min(Math.max(node.scrollHeight, 38), maxHeight);
  node.style.height = `${nextHeight}px`;
  node.style.overflowY = node.scrollHeight > maxHeight ? "auto" : "hidden";
  if (node.selectionEnd >= node.value.length - 1) {
    node.scrollTop = node.scrollHeight;
  }
}

export function App() {
  const [status, setStatus] = useState<AppStatus | null>(demoMode ? DEMO_STATUS : null);
  const [models, setModels] = useState<CodexModel[]>([]);
  const [skills, setSkills] = useState<CodexSkill[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSessionDto[]>(demoMode ? DEMO_TMUX_SESSIONS : []);
  const [tmuxTools, setTmuxTools] = useState<TmuxToolDto[]>(demoMode ? DEMO_TMUX_TOOLS : []);
  const [selectedTmux, setSelectedTmux] = useState(demoMode ? "agent-demo" : "");
  const [tmuxOutput, setTmuxOutput] = useState(demoMode ? DEMO_TMUX_OUTPUT : "");
  const [tmuxInput, setTmuxInput] = useState(demoMode ? "Ask Claude to check the mobile layout and summarize risks" : "");
  const [threadId, setThreadId] = useState("");
  const [activeTurnId, setActiveTurnId] = useState("");
  const [threadStatus, setThreadStatus] = useState("idle");
  const [model, setModel] = useState("gpt-5.5");
  const [effort, setEffort] = useState("xhigh");
  const [cwd, setCwd] = useState(demoMode ? DEMO_STATUS.defaultCwd : defaultCwd);
  const [message, setMessage] = useState("");
  const [composerCaret, setComposerCaret] = useState(0);
  const [skillQuery, setSkillQuery] = useState("");
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [error, setError] = useState("");
  const [newTmuxName, setNewTmuxName] = useState("agent");
  const [selectedTmuxTool, setSelectedTmuxTool] = useState("codex");
  const [selectedTmuxToolModes, setSelectedTmuxToolModes] = useState<Record<string, string[]>>({});
  const [customTmuxCommand, setCustomTmuxCommand] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [terminalActive, setTerminalActive] = useState(false);
  const [tmuxFocusActive, setTmuxFocusActive] = useState(false);
  const [tmuxGuiActive, setTmuxGuiActive] = useState(demoMode);
  const [tmuxMenuOpen, setTmuxMenuOpen] = useState(false);
  const [tmuxWatchEvents, setTmuxWatchEvents] = useState<TmuxWatchEvent[]>(demoMode ? DEMO_TMUX_WATCH_EVENTS : []);
  const [tmuxNotificationsEnabled, setTmuxNotificationsEnabled] = useState(readTmuxNotificationPreference);
  const [colorTheme, setColorTheme] = useState(readInitialColorTheme);
  const [requestedTmuxSession, setRequestedTmuxSession] = useState(readInitialRequestedTmuxSession);
  const [tmuxAtBottom, setTmuxAtBottom] = useState(true);
  const [uploadingComposerFiles, setUploadingComposerFiles] = useState(false);
  const [uploadingTmuxFiles, setUploadingTmuxFiles] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState(demoMode ? "gui view for agent-demo" : "");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const rawTerminalRef = useRef<XtermTerminal | null>(null);
  const terminalSocketRef = useRef<WebSocket | null>(null);
  const terminalSessionRef = useRef("");
  const tmuxInputRef = useRef<HTMLTextAreaElement | null>(null);
  const tmuxFileInputRef = useRef<HTMLInputElement | null>(null);
  const tmuxOutputRef = useRef<HTMLPreElement | null>(null);
  const tmuxChatRef = useRef<HTMLDivElement | null>(null);
  const tmuxFollowTimersRef = useRef<number[]>([]);
  const tmuxNotificationsEnabledRef = useRef(tmuxNotificationsEnabled);
  const tmuxStickToBottomRef = useRef(true);
  const forceTmuxScrollBottomRef = useRef(false);
  const tmuxScrollSnapshotRef = useRef<TmuxScrollSnapshot | null>(null);
  const selectedTmuxRef = useRef(selectedTmux);
  const tmuxCaptureRequestIdRef = useRef(0);

  const modelEfforts = useMemo(() => {
    const found = models.find((entry) => entry.id === model || entry.model === model);
    return found?.supportedReasoningEfforts.map((entry) => entry.reasoningEffort) ?? ["low", "medium", "high", "xhigh"];
  }, [model, models]);

  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase();
    return skills
      .filter((skill) => !query || `${skill.name} ${skill.description}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [skillQuery, skills]);

  const slashQuery = useMemo(() => slashQueryForMessage(message, composerCaret), [composerCaret, message]);
  const slashMatches = useMemo(() => slashQuery ? filterSlashCommands(slashQuery.query) : [], [slashQuery]);
  const tmuxChatMessages = useMemo(() => parseTmuxChatOutput(tmuxOutput), [tmuxOutput]);
  const selectedTmuxSession = useMemo(
    () => tmuxSessions.find((session) => session.name === selectedTmux) ?? null,
    [selectedTmux, tmuxSessions]
  );
  const tmuxAgentSummary = useMemo(
    () => summarizeTmuxAgent(tmuxOutput, tmuxChatMessages, { activityAtMs: selectedTmuxSession?.activityAtMs }),
    [selectedTmuxSession?.activityAtMs, tmuxChatMessages, tmuxOutput]
  );
  const tmuxCompactMessages = useMemo(() => buildCompactTmuxMessages(tmuxChatMessages), [tmuxChatMessages]);
  const showTmuxSendForm = shouldShowTmuxSendForm({ terminalActive });
  const currentTmuxTool = useMemo(() => tmuxTools.find((tool) => tool.id === selectedTmuxTool) ?? null, [selectedTmuxTool, tmuxTools]);
  const currentTmuxToolModeIds = useMemo(() => currentTmuxTool
    ? selectedTmuxToolModes[currentTmuxTool.id] ?? defaultTmuxToolModeIds(currentTmuxTool)
    : [], [currentTmuxTool, selectedTmuxToolModes]);
  const currentTmuxToolCommand = useMemo(() => currentTmuxTool
    ? buildTmuxToolCommandPreview(currentTmuxTool, currentTmuxToolModeIds)
    : "", [currentTmuxTool, currentTmuxToolModeIds]);

  const baseUrl = useMemo(() => {
    if (!status) {
      return "";
    }
    const host = status.tailscaleDns ?? status.tailscaleIp ?? status.bindHost;
    return `http://${host}:${status.port}`;
  }, [status]);

  const loadStatus = useCallback(async () => {
    if (demoMode) {
      setStatus(DEMO_STATUS);
      setCwd(DEMO_STATUS.defaultCwd);
      return;
    }
    const nextStatus = await api<AppStatus>("/api/status");
    setStatus(nextStatus);
    setCwd((current) => current || nextStatus.defaultCwd);
  }, []);

  const loadModels = useCallback(async () => {
    const result = await api<{ data: CodexModel[] }>("/api/models");
    setModels(result.data);
    const preferred = result.data.find((entry) => entry.isDefault) ?? result.data[0];
    if (preferred) {
      setModel(preferred.id);
      const efforts = preferred.supportedReasoningEfforts.map((entry) => entry.reasoningEffort);
      setEffort(efforts.includes("xhigh") ? "xhigh" : preferred.defaultReasoningEffort || "high");
    }
  }, []);

  const loadSkills = useCallback(async () => {
    const result = await api<{ data: Array<{ skills: CodexSkill[] }> }>(`/api/skills?cwd=${encodeURIComponent(cwd)}`);
    setSkills(result.data.flatMap((entry) => entry.skills).filter((skill) => skill.enabled));
  }, [cwd]);

  const loadThreads = useCallback(async () => {
    const result = await api<{ data: ThreadSummary[] }>("/api/threads");
    setThreads(result.data);
  }, []);

  const loadTmuxSessions = useCallback(async () => {
    if (demoMode) {
      setTmuxSessions(DEMO_TMUX_SESSIONS);
      setSelectedTmux((current) => current || DEMO_TMUX_SESSIONS[0]?.name || "");
      return;
    }
    const result = await api<{ data: TmuxSessionDto[] }>("/api/tmux/sessions");
    setTmuxSessions(result.data);
    setSelectedTmux((current) => current || result.data.find((session) => session.attached)?.name || result.data[0]?.name || "");
  }, []);

  const loadTmuxTools = useCallback(async () => {
    if (demoMode) {
      setTmuxTools(DEMO_TMUX_TOOLS);
      setSelectedTmuxTool((current) => DEMO_TMUX_TOOLS.some((tool) => tool.id === current) ? current : DEMO_TMUX_TOOLS[0]?.id ?? "custom");
      return;
    }
    const result = await api<{ data: TmuxToolDto[] }>("/api/tmux/tools");
    setTmuxTools(result.data);
    setSelectedTmuxTool((current) => result.data.some((tool) => tool.id === current) ? current : result.data[0]?.id ?? "custom");
  }, []);

  const captureTmux = useCallback(async (session = selectedTmux) => {
    if (!session) {
      return;
    }
    const requestId = ++tmuxCaptureRequestIdRef.current;
    if (demoMode) {
      if (tmuxCaptureRequestIdRef.current === requestId) {
        setCapturedTmuxOutput(DEMO_TMUX_OUTPUT);
      }
      return;
    }
    const params = new URLSearchParams({
      session,
      lines: String(TMUX_CAPTURE_HISTORY_LINES),
      clientWidth: String(resolveTmuxCaptureClientWidth())
    });
    const result = await api<{ output: string }>(`/api/tmux/capture?${params.toString()}`);
    if (tmuxCaptureRequestIdRef.current !== requestId || selectedTmuxRef.current !== session) {
      return;
    }
    setCapturedTmuxOutput(result.output);
  }, [selectedTmux, tmuxGuiActive]);

  useEffect(() => {
    selectedTmuxRef.current = selectedTmux;
  }, [selectedTmux]);

  useEffect(() => {
    loadStatus().catch(reportError(setError));
    loadTmuxSessions().catch(reportError(setError));
    loadTmuxTools().catch(reportError(setError));
  }, [loadStatus, loadTmuxSessions, loadTmuxTools]);

  useEffect(() => {
    if (demoMode) {
      return;
    }
    const timer = window.setInterval(() => {
      loadTmuxSessions().catch(reportError(setError));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadTmuxSessions]);

  useEffect(() => {
    if (!status?.codex.initialized) {
      return;
    }
    loadModels().catch(reportError(setError));
    loadThreads().catch(reportError(setError));
  }, [loadModels, loadThreads, status?.codex.initialized]);

  useEffect(() => {
    if (!status?.codex.initialized) {
      return;
    }
    loadSkills().catch(reportError(setError));
  }, [loadSkills, status?.codex.initialized]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = colorTheme;
    writeColorThemePreference(colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    tmuxNotificationsEnabledRef.current = tmuxNotificationsEnabled;
    setAndroidWatchPollingEnabled(tmuxNotificationsEnabled);
  }, [tmuxNotificationsEnabled]);

  useEffect(() => {
    const handleOpenSession = (event: Event) => {
      const session = normalizeRequestedTmuxSession((event as CustomEvent<{ session?: unknown }>).detail?.session);
      if (session) {
        setRequestedTmuxSession(session);
      }
    };
    window.addEventListener("agent-tmux-open-session", handleOpenSession);
    return () => window.removeEventListener("agent-tmux-open-session", handleOpenSession);
  }, []);

  useEffect(() => {
    if (!requestedTmuxSession) {
      return;
    }

    clearTmuxFollowTimers(tmuxFollowTimersRef);
    setTerminalActive(false);
    setTmuxMenuOpen(false);
    setSelectedTmux(requestedTmuxSession);
    setTerminalStatus(`${requestedTmuxSession} is waiting for input`);
    queueTmuxOutputBottomScroll();
    void captureTmux(requestedTmuxSession).catch(reportError(setError));
    clearRequestedTmuxSessionFromAddressBar();
    setRequestedTmuxSession("");
  }, [captureTmux, requestedTmuxSession]);

  useEffect(() => {
    if (selectedTmux) {
      queueTmuxOutputBottomScroll();
      captureTmux(selectedTmux).catch(reportError(setError));
    }
  }, [captureTmux, selectedTmux]);

  useLayoutEffect(() => {
    if (terminalActive) {
      return;
    }

    const node = currentTmuxScrollNode();
    if (!node) {
      return;
    }

    if (forceTmuxScrollBottomRef.current || tmuxStickToBottomRef.current) {
      node.scrollTop = node.scrollHeight;
      forceTmuxScrollBottomRef.current = false;
      updateTmuxBottomState(node);
      tmuxScrollSnapshotRef.current = null;
      return;
    }

    if (tmuxScrollSnapshotRef.current) {
      restoreTmuxScrollSnapshot(node, tmuxScrollSnapshotRef.current);
    }
    tmuxScrollSnapshotRef.current = null;
    updateTmuxBottomState(node);
  }, [terminalActive, tmuxFocusActive, tmuxGuiActive, tmuxOutput]);

  useLayoutEffect(() => {
    resizeTmuxInput(tmuxInputRef.current);
  }, [tmuxInput]);

  useEffect(() => {
    if (!selectedTmux || terminalActive) {
      return;
    }

    const interval = window.setInterval(() => {
      if (shouldAutoCaptureTmux({ selectedTmux, terminalActive, documentHidden: document.hidden })) {
        captureTmux(selectedTmux).catch(reportError(setError));
      }
    }, TMUX_CAPTURE_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [captureTmux, selectedTmux, terminalActive]);

  useEffect(() => {
    if (demoMode) {
      return;
    }
    const token = new URLSearchParams(window.location.search).get("token");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as WsPayload;
      const watchEvents = tmuxWatchEventsFromPayload(payload);
      if (watchEvents.length > 0) {
        setTmuxWatchEvents((current) => mergeTmuxWatchEvents(current, watchEvents));
      }
      if (payload.type === "tmux-watch-done" && isTmuxWatchEvent(payload.event)) {
        if (tmuxNotificationsEnabledRef.current && canShowWebSocketTaskNotifications()) {
          showTmuxDoneNotification(payload.event.session, payload.event.label);
        }
        setTerminalStatus(`${payload.event.session} is waiting for input`);
        return;
      }
      handleWsPayload(payload, setStatus, setThreadStatus, setTimeline, setActiveTurnId);
    };
    socket.onerror = () => setError("WebSocket connection failed");
    return () => socket.close();
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [timeline]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery?.query]);

  useEffect(() => {
    return () => clearTmuxFollowTimers(tmuxFollowTimersRef);
  }, []);

  useEffect(() => {
    if (demoMode) {
      return;
    }
    if (!terminalActive || !selectedTmux || !terminalHostRef.current) {
      return;
    }

    const node = terminalHostRef.current;
    const session = selectedTmux;
    node.textContent = "";

    const terminal = new XtermTerminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily: "\"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace",
      fontSize: 12,
      scrollback: 6000,
      theme: terminalThemeForColorTheme(colorTheme)
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(node);
    rawTerminalRef.current = terminal;

    const focusTerminal = () => {
      terminal.focus();
    };
    node.addEventListener("pointerdown", focusTerminal);

    const fitTerminal = () => {
      try {
        fitAddon.fit();
      } catch {
        // The terminal can briefly be detached while React swaps views.
      }
      return { cols: terminal.cols || 80, rows: terminal.rows || 24 };
    };

    const dimensions = fitTerminal();
    const params = new URLSearchParams({
      session,
      cols: String(dimensions.cols),
      rows: String(dimensions.rows)
    });
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      params.set("token", token);
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/tmux-ws?${params}`);
    setTerminalStatus(`connecting to ${session}`);

    socket.onopen = () => {
      terminalSocketRef.current = socket;
      terminalSessionRef.current = session;
      setTerminalStatus(`live terminal for ${session}`);
      terminal.focus();
    };
    socket.onmessage = (event) => {
      const payload = parseTerminalSocketMessage(event.data);
      if (!payload) {
        return;
      }
      if (payload.type === "output" && typeof payload.data === "string") {
        terminal.write(payload.data);
      }
      if (payload.type === "status" && typeof payload.message === "string") {
        setTerminalStatus(payload.message);
      }
      if (payload.type === "error" && typeof payload.message === "string") {
        setTerminalStatus(payload.message);
        terminal.writeln(`\r\n${payload.message}`);
      }
    };
    socket.onclose = () => {
      if (terminalSocketRef.current === socket) {
        terminalSocketRef.current = null;
        terminalSessionRef.current = "";
      }
      setTerminalStatus(`terminal closed for ${session}`);
    };
    socket.onerror = () => {
      setTerminalStatus(`terminal connection failed for ${session}`);
    };

    const inputDisposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });

    let lastSentDimensions = dimensions;
    let resizeFrame = 0;
    const sendResize = () => {
      const nextDimensions = fitTerminal();
      const dimensionsChanged = nextDimensions.cols !== lastSentDimensions.cols || nextDimensions.rows !== lastSentDimensions.rows;
      if (dimensionsChanged && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", ...nextDimensions }));
        lastSentDimensions = nextDimensions;
      }
    };
    const resize = () => {
      if (resizeFrame) {
        return;
      }
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        sendResize();
      });
    };
    socket.addEventListener("open", sendResize);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(node);
    window.addEventListener("resize", resize);
    const resizeTimer = window.setTimeout(resize, 50);

    return () => {
      window.clearTimeout(resizeTimer);
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
      }
      socket.removeEventListener("open", sendResize);
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      node.removeEventListener("pointerdown", focusTerminal);
      inputDisposable.dispose();
      if (terminalSocketRef.current === socket) {
        terminalSocketRef.current = null;
        terminalSessionRef.current = "";
      }
      if (rawTerminalRef.current === terminal) {
        rawTerminalRef.current = null;
      }
      socket.close();
      terminal.dispose();
    };
  }, [colorTheme, selectedTmux, terminalActive]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (uploadingComposerFiles) {
      return;
    }
    const text = message.trim();
    if (!text) {
      return;
    }

    setError("");
    if (await runSlashCommand(text)) {
      setMessage("");
      setComposerCaret(0);
      return;
    }

    setMessage("");
    setComposerCaret(0);

    let currentThreadId = threadId;
    if (!currentThreadId) {
      const created = await api<{ thread: { id: string }; reasoningEffort?: string }>("/api/thread/start", {
        method: "POST",
        body: JSON.stringify({ cwd, model, serviceTier: "fast" })
      });
      currentThreadId = created.thread.id;
      setThreadId(currentThreadId);
    }

    addUserEntry(setTimeline, text);
    const result = await api<{ turn: { id: string; status: string } }>("/api/turn/start", {
      method: "POST",
      body: JSON.stringify({
        threadId: currentThreadId,
        text,
        cwd,
        model,
        effort,
        serviceTier: "fast"
      })
    });
    setActiveTurnId(result.turn.id);
    setThreadStatus(result.turn.status);
  }

  async function resumeThread(id: string) {
    setError("");
    const result = await api<{ thread: { id: string; cwd: string; status: string; turns: Array<{ items: unknown[] }> } }>("/api/thread/resume", {
      method: "POST",
      body: JSON.stringify({ threadId: id, cwd, model })
    });
    setThreadId(result.thread.id);
    setThreadStatus(result.thread.status);
    await readThread(result.thread.id);
  }

  async function readThread(id: string) {
    const result = await api<{ thread: { id: string; turns: Array<{ items: unknown[] }> } }>(`/api/thread/${id}`);
    setTimeline(threadToEntries(result.thread.turns));
  }

  async function interruptTurn() {
    if (!threadId) {
      return;
    }
    await api("/api/turn/interrupt", {
      method: "POST",
      body: JSON.stringify({ threadId })
    });
  }

  async function sendTmux() {
    const text = tmuxInputRef.current?.value ?? tmuxInput;
    if (!selectedTmux || !text.trim()) {
      return;
    }
    const session = selectedTmux;
    queueTmuxOutputBottomScroll();

    if (demoMode) {
      setCapturedTmuxOutput(`${DEMO_TMUX_OUTPUT}\n\n› ${text}\n\n• Demo input captured without touching a real tmux session.`);
      setTmuxInput("");
      resizeTmuxInput(tmuxInputRef.current);
      setTerminalStatus(`sent to ${session}; following output`);
      return;
    }

    await registerTmuxTaskWatch(session, "Tmux task");
    if (sendTmuxViaTerminal(session, text)) {
      setTmuxInput("");
      if (tmuxInputRef.current) {
        tmuxInputRef.current.value = "";
      }
      resizeTmuxInput(tmuxInputRef.current);
      setTerminalStatus(`sent to ${session}`);
      return;
    }

    await api("/api/tmux/send", {
      method: "POST",
      body: JSON.stringify({ session, text, enter: true })
    });
    setTmuxInput("");
    if (tmuxInputRef.current) {
      tmuxInputRef.current.value = "";
    }
    resizeTmuxInput(tmuxInputRef.current);
    setTerminalStatus(`sent to ${session}; following output`);
    scheduleTmuxFollow(session);
  }

  async function interruptTmux() {
    if (!selectedTmux) {
      return;
    }
    queueTmuxOutputBottomScroll();
    if (demoMode) {
      setTerminalStatus(`stop sent to ${selectedTmux}`);
      return;
    }
    const result = await api<{ output: string }>("/api/tmux/interrupt", {
      method: "POST",
      body: JSON.stringify({ session: selectedTmux })
    });
    setCapturedTmuxOutput(result.output);
    setTerminalStatus(`stop sent to ${selectedTmux}`);
    scheduleTmuxFollow(selectedTmux);
  }

  async function uploadFilesForPrompt(selectedFiles: File[]): Promise<UploadedFileDto[]> {
    if (demoMode) {
      return selectedFiles.map((file) => ({
        name: file.name || "upload",
        path: `/tmp/agent-tmux-web/uploads/demo/${file.name || "upload"}`,
        size: file.size,
        mimeType: file.type || null
      }));
    }

    const uploads: UploadedFileDto[] = [];
    for (const file of selectedFiles) {
      uploads.push(await uploadFileToServer(file));
    }
    return uploads;
  }

  async function attachTmuxFiles(files: FileList | File[] | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    setError("");
    setUploadingTmuxFiles(true);
    try {
      const uploads = await uploadFilesForPrompt(selectedFiles);
      appendTmuxPromptText(formatUploadedFilesForPrompt(uploads));
      setTerminalStatus(`uploaded ${uploads.length} file${uploads.length === 1 ? "" : "s"} to server`);
    } finally {
      setUploadingTmuxFiles(false);
    }
  }

  async function pasteImagesIntoComposer(files: File[], pastedText: string, sourceInput: HTMLTextAreaElement) {
    setError("");
    setUploadingComposerFiles(true);
    try {
      const uploads = await uploadFilesForPrompt(files);
      insertComposerPromptText(buildPastedPromptText(pastedText, formatUploadedFilesForPrompt(uploads)), sourceInput);
    } finally {
      setUploadingComposerFiles(false);
    }
  }

  async function pasteImagesIntoTmuxPrompt(files: File[], pastedText: string, sourceInput: HTMLTextAreaElement) {
    setError("");
    setUploadingTmuxFiles(true);
    try {
      const uploads = await uploadFilesForPrompt(files);
      insertTmuxPromptText(buildPastedPromptText(pastedText, formatUploadedFilesForPrompt(uploads)), sourceInput);
      setTerminalStatus(`uploaded ${uploads.length} pasted image${uploads.length === 1 ? "" : "s"} to server`);
    } finally {
      setUploadingTmuxFiles(false);
    }
  }

  function insertComposerPromptText(text: string, sourceInput?: HTMLTextAreaElement | null) {
    const input = composerRef.current ?? sourceInput ?? null;
    const value = input?.value ?? message;
    const selectionStart = input?.selectionStart ?? value.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    const next = applyTextareaPaste(value, selectionStart, selectionEnd, text);

    if (input) {
      input.value = next.value;
    }
    setMessage(next.value);
    setComposerCaret(next.selectionStart);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  function insertTmuxPromptText(text: string, sourceInput?: HTMLTextAreaElement | null) {
    const input = tmuxInputRef.current ?? sourceInput ?? null;
    const value = input?.value ?? tmuxInput;
    const selectionStart = input?.selectionStart ?? value.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    const next = applyTextareaPaste(value, selectionStart, selectionEnd, text);

    if (input) {
      input.value = next.value;
    }
    setTmuxInput(next.value);
    resizeTmuxInput(input);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(next.selectionStart, next.selectionEnd);
      resizeTmuxInput(input);
    });
  }

  function appendTmuxPromptText(text: string) {
    setTmuxInput((current) => {
      const value = tmuxInputRef.current?.value ?? current;
      const trimmed = value.trimEnd();
      return trimmed ? `${trimmed} ${text}` : text;
    });
    window.requestAnimationFrame(() => {
      const input = tmuxInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      resizeTmuxInput(input);
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }

  function openRawTerminal() {
    if (!selectedTmux) {
      return;
    }
    if (demoMode) {
      clearTmuxFollowTimers(tmuxFollowTimersRef);
      setTmuxFocusActive(false);
      setTmuxGuiActive(false);
      setTerminalStatus(`live terminal for ${selectedTmux}`);
      setTerminalActive(true);
      return;
    }
    clearTmuxFollowTimers(tmuxFollowTimersRef);
    setTmuxFocusActive(false);
    setTmuxGuiActive(false);
    setTerminalStatus(`connecting to ${selectedTmux}`);
    setTerminalActive(true);
  }

  function closeRawTerminal() {
    setTerminalActive(false);
    setTmuxFocusActive(false);
    if (!selectedTmux) {
      return;
    }
    queueTmuxOutputBottomScroll();
    setTerminalStatus(selectedTmux);
    void captureTmux(selectedTmux).catch(reportError(setError));
  }

  function forceSyncTmuxOutput() {
    if (!selectedTmux) {
      return;
    }
    if (terminalActive) {
      closeRawTerminal();
      return;
    }
    setTerminalStatus(`syncing ${selectedTmux}`);
    void captureTmux(selectedTmux)
      .then(() => setTerminalStatus(`synced ${selectedTmux}`))
      .catch(reportError(setError));
  }

  function toggleTmuxGui() {
    if (!selectedTmux) {
      return;
    }

    const nextActive = !tmuxGuiActive;
    clearTmuxFollowTimers(tmuxFollowTimersRef);
    setTerminalActive(false);
    setTmuxFocusActive(false);
    setTmuxGuiActive(nextActive);
    queueTmuxOutputBottomScroll();
    setTerminalStatus(nextActive ? `gui view for ${selectedTmux}` : selectedTmux);
    void captureTmux(selectedTmux).catch(reportError(setError));
  }

  function toggleTmuxFocus() {
    if (!selectedTmux) {
      return;
    }
    clearTmuxFollowTimers(tmuxFollowTimersRef);
    setTerminalActive(false);
    setTmuxFocusActive((current) => !current);
    queueTmuxOutputBottomScroll();
    setTerminalStatus(tmuxFocusActive ? selectedTmux : `focus view for ${selectedTmux}`);
    void captureTmux(selectedTmux).catch(reportError(setError));
  }

  function toggleColorTheme() {
    const nextTheme = nextColorTheme(colorTheme);
    setColorTheme(nextTheme);
    setTerminalStatus(nextTheme === "light" ? "light mode on" : "dark mode on");
  }

  async function toggleTmuxNotifications() {
    if (tmuxNotificationsEnabled) {
      setTmuxNotificationsEnabled(false);
      writeTmuxNotificationPreference(false);
      setTerminalStatus("browser notifications off");
      return;
    }

    const snapshot = getBrowserNotificationSnapshot();
    const availability = getBrowserNotificationAvailability(snapshot);
    if (!availability.available) {
      setTerminalStatus(availability.message);
      return;
    }

    if (snapshot.androidBridge) {
      setTmuxNotificationsEnabled(true);
      writeTmuxNotificationPreference(true);
      setAndroidWatchPollingEnabled(true);
      setTerminalStatus("app notifications on");
      return;
    }

    let permission: NotificationPermission;
    try {
      permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    } catch {
      setTerminalStatus("browser blocked notification prompt");
      return;
    }

    if (permission === "granted") {
      setTmuxNotificationsEnabled(true);
      writeTmuxNotificationPreference(true);
      setTerminalStatus("browser notifications on");
      return;
    }

    setTmuxNotificationsEnabled(false);
    writeTmuxNotificationPreference(false);
    const nextAvailability = getBrowserNotificationAvailability({
      ...getBrowserNotificationSnapshot(),
      permission
    });
    setTerminalStatus(nextAvailability.available ? "browser notifications not enabled" : nextAvailability.message);
  }

  function sendRawTerminalData(data: string) {
    focusRawTerminal();
    if (demoMode && terminalActive) {
      setTerminalStatus(`sent ${describeTerminalKey(data)} to ${selectedTmux}`);
      return;
    }
    const socket = terminalSocketRef.current;
    if (!terminalActive || !socket || socket.readyState !== WebSocket.OPEN) {
      setTerminalStatus("raw terminal not connected");
      return;
    }
    socket.send(JSON.stringify({ type: "input", data }));
    focusRawTerminal();
  }

  function focusRawTerminal() {
    rawTerminalRef.current?.focus();
  }

  function sendTmuxViaTerminal(session: string, text: string): boolean {
    const socket = terminalSocketRef.current;
    if (!terminalActive || terminalSessionRef.current !== session || !socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    sendTerminalSocketInput(socket, text);
    window.setTimeout(() => {
      if (terminalSocketRef.current === socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data: "\r" }));
      }
    }, TMUX_TERMINAL_SUBMIT_DELAY_MS);
    return true;
  }

  async function createSession() {
    if (!newTmuxName.trim()) {
      return;
    }
    const sessionName = newTmuxName.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "codex";
    if (demoMode) {
      const next = { name: sessionName, windows: 1, created: "Thu May 14 09:30:00 2026", attached: false };
      setTmuxSessions((current) => [...current, next]);
      selectTmuxSession(sessionName);
      return;
    }
    const result = await api<{ data: TmuxSessionDto[] }>("/api/tmux/create", {
      method: "POST",
      body: JSON.stringify({ name: newTmuxName, cwd })
    });
    setTmuxSessions(result.data);
    selectTmuxSession(sessionName);
  }

  async function destroySession() {
    if (!selectedTmux || !window.confirm(`Destroy tmux session "${selectedTmux}"?`)) {
      return;
    }

    if (demoMode) {
      const remaining = tmuxSessions.filter((session) => session.name !== selectedTmux);
      const nextSession = remaining[0] ?? null;
      setTmuxSessions(remaining);
      setSelectedTmux(nextSession?.name ?? "");
      setCapturedTmuxOutput(nextSession ? DEMO_TMUX_OUTPUT : "");
      setTmuxMenuOpen(false);
      setTerminalStatus(nextSession?.name ?? "no session selected");
      return;
    }

    const result = await api<{ data: TmuxSessionDto[] }>("/api/tmux/destroy", {
      method: "POST",
      body: JSON.stringify({ session: selectedTmux })
    });
    const nextSession = result.data.find((session) => session.attached) ?? result.data[0] ?? null;
    setTmuxSessions(result.data);
    setSelectedTmux(nextSession?.name ?? "");
    setCapturedTmuxOutput("");
    setTmuxMenuOpen(false);
    setTerminalStatus(nextSession?.name ?? "no session selected");
  }

  async function openSelectedTmuxTool() {
    if (!selectedTmux) {
      return;
    }

    const tool = currentTmuxTool;
    const command = selectedTmuxTool === "custom" ? customTmuxCommand.trim() : currentTmuxToolCommand;
    if (!command) {
      setError("Enter a CLI command to launch.");
      return;
    }

    if (demoMode) {
      queueTmuxOutputBottomScroll();
      setCapturedTmuxOutput(`${DEMO_TMUX_OUTPUT}\n\n› ${command}\n\n• Started ${tool?.label ?? command} in ${selectedTmux}.`);
      setTerminalActive(false);
      setTmuxFocusActive(false);
      setTmuxGuiActive(true);
      setTmuxMenuOpen(false);
      setTerminalStatus(`started ${tool?.label ?? command} in ${selectedTmux}`);
      return;
    }

    await registerTmuxTaskWatch(selectedTmux, tool?.label ?? command);
    const result = await api<{ output: string }>("/api/tmux/open-tool", {
      method: "POST",
      body: JSON.stringify({
        session: selectedTmux,
        toolId: selectedTmuxTool === "custom" ? undefined : selectedTmuxTool,
        command,
        modeIds: selectedTmuxTool === "custom" ? [] : currentTmuxToolModeIds
      })
    });
    queueTmuxOutputBottomScroll();
    setCapturedTmuxOutput(result.output);
    setTerminalActive(false);
    setTmuxFocusActive(false);
    setTmuxGuiActive(false);
    setTmuxMenuOpen(false);
    setTerminalStatus(`started ${tool?.label ?? command} in ${selectedTmux}`);
  }

  function toggleSelectedTmuxToolMode(modeId: string) {
    if (!currentTmuxTool) {
      return;
    }

    setSelectedTmuxToolModes((current) => {
      const existing = current[currentTmuxTool.id] ?? defaultTmuxToolModeIds(currentTmuxTool);
      const next = existing.includes(modeId)
        ? existing.filter((entry) => entry !== modeId)
        : [...existing, modeId];
      return {
        ...current,
        [currentTmuxTool.id]: next
      };
    });
  }

  function selectTmuxSession(session: string) {
    setSelectedTmux(session);
    setTerminalActive(false);
    setTmuxMenuOpen(false);
    setTerminalStatus(session);
  }

  function tmuxStatusForSession(session: TmuxSessionDto) {
    return session.name === selectedTmux
      ? tmuxAgentSummary
      : session.status ?? { kind: "idle" as const, health: "yellow" as const, title: "Idle" };
  }

  function insertSkillName(skillName: string) {
    setMessage((current) => {
      const prefix = current.trimEnd();
      return prefix ? `${prefix} ${skillName}` : skillName;
    });
  }

  async function runSlashCommand(text: string): Promise<boolean> {
    const parsed = parseSlashCommand(text);
    if (!parsed) {
      return false;
    }

    const command = slashMatches.find((entry) => entry.name === parsed.name) ?? filterSlashCommands(parsed.name).find((entry) => entry.name === parsed.name);
    if (!command) {
      addLocalEntry(setTimeline, "Slash command", `Unknown command: ${parsed.name}`);
      return true;
    }

    if (!command.local) {
      addLocalEntry(
        setTimeline,
        command.name,
        `${command.description}\n\n${command.detail}\n\nFor exact CLI behavior, attach to a tmux session and run it there.`
      );
      return true;
    }

    if (command.name === "/clear" || command.name === "/new") {
      setThreadId("");
      setActiveTurnId("");
      setThreadStatus("idle");
      setTimeline([]);
      addLocalEntry(setTimeline, command.name, "Started a fresh web conversation.");
      return true;
    }

    if (command.name === "/status") {
      addLocalEntry(setTimeline, "/status", [
        `URL: ${baseUrl || "loading"}`,
        `Thread: ${threadId || "new"}`,
        `Model: ${model}`,
        `Reasoning: ${effort}`,
        `Working directory: ${cwd}`,
        `Codex app-server: ${status?.codex.initialized ? "connected" : "optional/offline"}`,
        `Tmux: ${selectedTmux || "none selected"}`
      ].join("\n"));
      return true;
    }

    if (command.name === "/model") {
      const [nextModel, nextEffort] = parsed.args.split(/\s+/).filter(Boolean);
      if (!nextModel) {
        addLocalEntry(setTimeline, "/model", `Current model: ${model}\nCurrent reasoning: ${effort}\n\nUsage: /model <model> [${modelEfforts.join("|")}]`);
        return true;
      }

      const matchedModel = models.find((entry) => [entry.id, entry.model, entry.displayName].includes(nextModel));
      if (!matchedModel) {
        addLocalEntry(setTimeline, "/model", `Unknown model: ${nextModel}`);
        return true;
      }

      setModel(matchedModel.id);
      const supportedEfforts = matchedModel.supportedReasoningEfforts.map((entry) => entry.reasoningEffort);
      if (nextEffort && supportedEfforts.includes(nextEffort)) {
        setEffort(nextEffort);
      }
      addLocalEntry(setTimeline, "/model", `Model set to ${matchedModel.displayName}${nextEffort ? ` with ${nextEffort} reasoning` : ""}.`);
      return true;
    }

    if (command.name === "/fast") {
      addLocalEntry(setTimeline, "/fast", "Fast mode is on for web turns through the local app-server.");
      return true;
    }

    if (command.name === "/stop") {
      await interruptTurn();
      addLocalEntry(setTimeline, "/stop", "Interrupt requested for the current web turn.");
      return true;
    }

    if (command.name === "/resume") {
      await loadThreads();
      addLocalEntry(setTimeline, "/resume", "Recent thread list refreshed. Choose a thread from the sidebar.");
      return true;
    }

    if (command.name === "/copy") {
      const latest = [...timeline].reverse().find((entry) => entry.title === "Agent" || entry.title === "Codex" || entry.kind.includes("assistant"));
      if (!latest?.body) {
        addLocalEntry(setTimeline, "/copy", "No completed agent output is visible yet.");
        return true;
      }
      await navigator.clipboard.writeText(latest.body);
      addLocalEntry(setTimeline, "/copy", "Latest visible agent output copied.");
      return true;
    }

    if (command.name === "/exit" || command.name === "/quit") {
      setTerminalActive(false);
      addLocalEntry(setTimeline, command.name, "Detached the browser terminal view.");
      return true;
    }

    return false;
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!slashQuery || slashMatches.length === 0) {
      if (shouldSubmitTextareaEnter(event)) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((current) => (current + 1) % slashMatches.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((current) => (current - 1 + slashMatches.length) % slashMatches.length);
      return;
    }

    if (event.key === "Tab" || shouldSubmitTextareaEnter(event)) {
      event.preventDefault();
      chooseSlashCommand(slashMatches[slashIndex] ?? slashMatches[0]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setComposerCaret(-1);
    }
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedImageFiles = extractPastedImageFiles(event.clipboardData);
    if (pastedImageFiles.length > 0) {
      event.preventDefault();
      const pastedText = event.clipboardData.getData("text/plain");
      void pasteImagesIntoComposer(pastedImageFiles, pastedText, event.currentTarget).catch(reportError(setError));
      return;
    }

    const pastedText = event.clipboardData.getData("text/plain");
    if (!pastedText) {
      return;
    }

    event.preventDefault();
    const input = event.currentTarget;
    const next = applyTextareaPaste(input.value, input.selectionStart, input.selectionEnd, pastedText);
    input.value = next.value;
    setMessage(next.value);
    setComposerCaret(next.selectionStart);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  function handleTmuxInputPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedImageFiles = extractPastedImageFiles(event.clipboardData);
    if (pastedImageFiles.length > 0) {
      event.preventDefault();
      const pastedText = event.clipboardData.getData("text/plain");
      void pasteImagesIntoTmuxPrompt(pastedImageFiles, pastedText, event.currentTarget).catch(reportError(setError));
      return;
    }

    const pastedText = event.clipboardData.getData("text/plain");
    if (!pastedText) {
      return;
    }

    event.preventDefault();
    const input = event.currentTarget;
    const next = applyTextareaPaste(input.value, input.selectionStart, input.selectionEnd, pastedText);
    input.value = next.value;
    setTmuxInput(next.value);
    resizeTmuxInput(input);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(next.selectionStart, next.selectionEnd);
      resizeTmuxInput(input);
    });
  }

  function handleTmuxInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSubmitTextareaEnter(event)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function chooseSlashCommand(command: SlashCommand) {
    const next = replaceSlashQuery(message, composerCaret, command.name);
    setMessage(next.message);
    setComposerCaret(next.selectionStart);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(next.selectionStart, next.selectionStart);
    });
  }

  function scheduleTmuxFollow(session: string) {
    queueTmuxOutputBottomScroll();
    clearTmuxFollowTimers(tmuxFollowTimersRef);
    void captureTmux(session).catch(reportError(setError));
    for (const delay of TMUX_SEND_FOLLOW_DELAYS_MS) {
      const timer = window.setTimeout(() => {
        void captureTmux(session).catch(reportError(setError));
      }, delay);
      tmuxFollowTimersRef.current.push(timer);
    }
  }

  function setCapturedTmuxOutput(output: string) {
    rememberTmuxScrollPosition();
    setTmuxOutput(output);
  }

  function currentTmuxScrollNode() {
    return tmuxFocusActive ? tmuxChatRef.current : tmuxGuiActive ? tmuxChatRef.current : tmuxOutputRef.current;
  }

  function resolveTmuxCaptureClientWidth(): number {
    return currentTmuxScrollNode()?.clientWidth || window.innerWidth || 1280;
  }

  function rememberTmuxScrollPosition() {
    const node = currentTmuxScrollNode();
    tmuxScrollSnapshotRef.current = node && !forceTmuxScrollBottomRef.current && !tmuxStickToBottomRef.current
      ? readTmuxScrollSnapshot(node)
      : null;
  }

  function queueTmuxOutputBottomScroll() {
    forceTmuxScrollBottomRef.current = true;
    tmuxStickToBottomRef.current = true;
    setTmuxAtBottom(true);
  }

  function handleTmuxOutputScroll(event: UIEvent<HTMLElement>) {
    updateTmuxBottomState(event.currentTarget);
  }

  function updateTmuxBottomState(node: HTMLElement) {
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
    tmuxStickToBottomRef.current = atBottom;
    setTmuxAtBottom(atBottom);
  }

  function jumpTmuxOutputToBottom() {
    const node = currentTmuxScrollNode();
    if (!node) {
      return;
    }
    tmuxScrollSnapshotRef.current = null;
    tmuxStickToBottomRef.current = true;
    setTmuxAtBottom(true);
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><img alt="" src="/agent-tmux-logo.png" /></div>
          <div>
            <h1>Agent Tmux</h1>
            <span>{status?.codex.initialized ? "codex connected" : "tmux ready"}</span>
          </div>
        </div>

        <section className="sidebar-section">
          <div className="section-title">
            <Cpu size={15} />
            Runtime
          </div>
          <label>
            Model
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {models.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            Reasoning
            <select value={effort} onChange={(event) => setEffort(event.target.value)}>
              {modelEfforts.map((entry) => <option key={entry}>{entry}</option>)}
            </select>
          </label>
          <label>
            Working directory
            <input value={cwd} onChange={(event) => setCwd(event.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" onClick={() => { setThreadId(""); setTimeline([]); setThreadStatus("idle"); }}>
              <Plus size={15} /> New
            </button>
            <button type="button" onClick={() => loadThreads().catch(reportError(setError))}>
              <RefreshCw size={15} /> Threads
            </button>
          </div>
        </section>

        <section className="sidebar-section">
          <div className="section-title">
            <Sparkles size={15} />
            Skills
          </div>
          <input value={skillQuery} onChange={(event) => setSkillQuery(event.target.value)} placeholder="Search skills" />
          <div className="skill-list">
            {filteredSkills.map((skill) => (
              <button key={skill.path} type="button" onClick={() => insertSkillName(skill.name)}>
                <Wrench size={14} />
                <span>{skill.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section threads">
          <div className="section-title">
            <Activity size={15} />
            Recent Codex Threads
          </div>
          {threads.slice(0, 10).map((thread) => (
            <button className={thread.id === threadId ? "thread active" : "thread"} key={thread.id} type="button" onClick={() => resumeThread(thread.id).catch(reportError(setError))}>
              <span>{clipText(thread.name || thread.preview || "Untitled thread", 92)}</span>
              <small>{thread.cwd}</small>
            </button>
          ))}
        </section>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyeline">
              <span className={status?.codex.connected ? "dot online" : "dot"} />
              {baseUrl || "loading URL"}
            </div>
            <h2>{threadId ? `Thread ${threadId.slice(0, 8)}` : "Tmux agent session"}</h2>
          </div>
          <div className="top-actions">
            <span className="status-pill">{threadStatus}</span>
            <button type="button" onClick={() => interruptTurn().catch(reportError(setError))}>
              <CircleStop size={16} /> Stop
            </button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <div ref={scrollerRef} className="timeline">
          {timeline.length === 0 ? (
            <div className="empty-state">
              <TerminalIcon size={30} />
              <h3>Start an agent turn</h3>
              <p>Messages can run through the optional Codex app-server, or use tmux for any terminal agent CLI.</p>
            </div>
          ) : (
            timeline.map((entry) => <TimelineCard key={entry.id} entry={entry} />)
          )}
        </div>

        <form className="composer" onSubmit={(event) => sendMessage(event).catch(reportError(setError))}>
          <textarea
            ref={composerRef}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setComposerCaret(event.target.selectionStart);
            }}
            onClick={(event) => setComposerCaret(event.currentTarget.selectionStart)}
            onKeyDown={handleComposerKeyDown}
            onKeyUp={(event) => setComposerCaret(event.currentTarget.selectionStart)}
            onPaste={handleComposerPaste}
            onSelect={(event) => setComposerCaret(event.currentTarget.selectionStart)}
            placeholder="Ask an agent to work in this repo..."
          />
          {slashQuery && slashMatches.length > 0 && (
            <div className="slash-menu" role="listbox" aria-label="Slash commands">
              {slashMatches.map((command, index) => (
                <button
                  key={command.name}
                  className={index === slashIndex ? "active" : ""}
                  type="button"
                  role="option"
                  aria-selected={index === slashIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseSlashCommand(command);
                  }}
                >
                  <strong>{command.name}</strong>
                  <span>{command.description}</span>
                </button>
              ))}
            </div>
          )}
          <button
            aria-label={uploadingComposerFiles ? "Uploading pasted image" : "Send message"}
            disabled={uploadingComposerFiles}
            title={uploadingComposerFiles ? "Uploading pasted image" : "Send message"}
            type="submit"
          >
            <Send size={18} />
          </button>
        </form>
      </main>

      <aside className="tmux-panel">
        <div className="tmux-control-rail">
          <div className="tmux-compact-bar">
            <div className="tmux-title">
              <img alt="" src="/agent-tmux-logo.png" />
              Tmux
            </div>
            <button className="tmux-session-menu-button" type="button" onClick={() => setTmuxMenuOpen((current) => !current)}>
              <span>{selectedTmux || "no session"}</span>
              <Menu size={15} />
            </button>
            <button aria-label="Refresh tmux session list" title="Refresh tmux session list" type="button" onClick={() => loadTmuxSessions().catch(reportError(setError))}>
              <RefreshCw size={14} />
            </button>
          </div>
          <div className={tmuxMenuOpen ? "tmux-menu open" : "tmux-menu"}>
            <div className="tmux-sessions">
              {tmuxSessions.map((session) => {
                const sessionStatus = tmuxStatusForSession(session);
                return (
                  <button
                    key={session.name}
                    className={selectedTmux === session.name ? "active" : ""}
                    title={`${session.name}: ${sessionStatus.title}`}
                    type="button"
                    onClick={() => selectTmuxSession(session.name)}
                  >
                    <span
                      aria-label={`${sessionStatus.title} status`}
                      className={`tmux-session-status-dot ${sessionStatus.health}`}
                      title={sessionStatus.title}
                    />
                    <ChevronRight size={14} />
                    <span className="tmux-session-name">{session.name}</span>
                    {session.attached && <span className="tmux-session-badge">attached</span>}
                  </button>
                );
              })}
            </div>
            <div className="tmux-actions">
              <input value={newTmuxName} onChange={(event) => setNewTmuxName(event.target.value)} placeholder="new session" />
              <button aria-label="Create tmux session" title="Create tmux session" type="button" onClick={() => createSession().catch(reportError(setError))}><Plus size={15} /></button>
              <button aria-label="Destroy selected tmux session" title="Destroy selected tmux session" type="button" disabled={!selectedTmux} onClick={() => destroySession().catch(reportError(setError))}><Trash2 size={15} /></button>
            </div>
            <div className="tmux-tool-actions">
              <select
                aria-label="CLI tool"
                value={selectedTmuxTool}
                onChange={(event) => setSelectedTmuxTool(event.target.value)}
              >
                {tmuxTools.map((tool) => <option key={tool.id} value={tool.id}>{tool.label}</option>)}
                <option value="custom">Custom</option>
              </select>
              <input
                aria-label="Custom CLI command"
                disabled={selectedTmuxTool !== "custom"}
                value={selectedTmuxTool === "custom" ? customTmuxCommand : currentTmuxToolCommand}
                onChange={(event) => setCustomTmuxCommand(event.target.value)}
                placeholder="command"
              />
              <button aria-label="Start CLI tool in selected tmux session" title="Start CLI tool in selected tmux session" type="button" disabled={!selectedTmux} onClick={() => openSelectedTmuxTool().catch(reportError(setError))}><TerminalIcon size={15} /> Run</button>
            </div>
            {selectedTmuxTool !== "custom" && currentTmuxTool?.modes?.length ? (
              <div className="tmux-tool-modes" aria-label="CLI tool modes">
                {currentTmuxTool.modes.map((mode) => (
                  <label key={mode.id}>
                    <input
                      checked={currentTmuxToolModeIds.includes(mode.id)}
                      onChange={() => toggleSelectedTmuxToolMode(mode.id)}
                      type="checkbox"
                    />
                    <span>{mode.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="tmux-workspace">
          <div className="tmux-terminal-toolbar">
            <button
              aria-label={tmuxFocusActive ? "Show detailed tmux output" : "Show focus view"}
              className={tmuxFocusActive ? "active" : ""}
              title={tmuxFocusActive ? "Show detailed tmux output" : "Show focus view"}
              type="button"
              onClick={toggleTmuxFocus}
            >
              <ListFilter size={15} />
              <span>Focus</span>
            </button>
            <button aria-label="Force sync selected tmux output" title="Force sync selected tmux output" type="button" onClick={forceSyncTmuxOutput}>
              <Download size={15} /> <span>Force Sync</span>
            </button>
            <button
              aria-label={tmuxGuiActive ? "Show terminal capture" : "Show GUI chat"}
              className={tmuxGuiActive ? "active" : ""}
              title={tmuxGuiActive ? "Show terminal capture" : "Show GUI chat"}
              type="button"
              onClick={toggleTmuxGui}
            >
              <MessageSquare size={15} />
              <span>{tmuxGuiActive ? "TTY" : "GUI"}</span>
            </button>
            <button
              aria-label={terminalActive ? "Detach raw tmux terminal" : "Attach raw tmux terminal"}
              title={terminalActive ? "Detach raw tmux terminal" : "Attach raw tmux terminal"}
              type="button"
              onClick={terminalActive ? closeRawTerminal : openRawTerminal}
            >
              {terminalActive ? <X size={15} /> : <Keyboard size={15} />}
              <span>{terminalActive ? "Detach" : "Raw"}</span>
            </button>
            <button
              aria-label={colorTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={colorTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              type="button"
              onClick={toggleColorTheme}
            >
              {colorTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              <span>{colorTheme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <button
              aria-label={tmuxNotificationsEnabled ? "Disable browser notifications" : "Enable browser notifications"}
              className={tmuxNotificationsEnabled ? "active" : ""}
              title={tmuxNotificationsEnabled ? "Disable browser notifications" : "Enable browser notifications"}
              type="button"
              onClick={() => toggleTmuxNotifications().catch(reportError(setError))}
            >
              <Bell size={15} />
              <span>Notify</span>
            </button>
            <span>{terminalStatus || selectedTmux || "no session selected"}</span>
          </div>
          {!terminalActive && !tmuxFocusActive && (
            <TmuxAgentSummaryStrip
              events={tmuxWatchEvents}
              selectedSession={selectedTmux}
              summary={tmuxAgentSummary}
              onSelectSession={selectTmuxSession}
            />
          )}
          <div className="tmux-output-shell">
            {terminalActive && demoMode ? (
              <div className="tmux-terminal tmux-terminal-demo">
                <pre>{DEMO_RAW_TERMINAL_OUTPUT}</pre>
              </div>
            ) : terminalActive ? (
              <div
                ref={terminalHostRef}
                aria-label="Raw interactive tmux terminal"
                className="tmux-terminal"
                role="application"
                onPointerDown={focusRawTerminal}
              />
            ) : tmuxFocusActive ? (
              <TmuxFocusView
                ref={tmuxChatRef}
                events={tmuxWatchEvents}
                messages={tmuxCompactMessages}
                selectedSession={selectedTmux}
                summary={tmuxAgentSummary}
                onScroll={handleTmuxOutputScroll}
                onSelectSession={selectTmuxSession}
              />
            ) : tmuxGuiActive ? (
              <TmuxChatView ref={tmuxChatRef} messages={tmuxChatMessages} onScroll={handleTmuxOutputScroll} />
            ) : (
              <pre ref={tmuxOutputRef} className="tmux-output" onScroll={handleTmuxOutputScroll}>
                <TmuxOutputLines output={tmuxOutput || "No tmux output captured."} />
              </pre>
            )}
            {!terminalActive && !tmuxAtBottom && (
              <button className="tmux-jump-bottom" aria-label="Jump to latest tmux output" title="Jump to latest tmux output" type="button" onClick={jumpTmuxOutputToBottom}>
                <ArrowDownToLine size={17} />
              </button>
            )}
          </div>
          {terminalActive && (
            <div className="tmux-soft-keys" aria-label="Raw terminal keys">
              <button type="button" title="Escape" onClick={() => sendRawTerminalData("\x1b")}>Esc</button>
              <button type="button" title="Tab" onClick={() => sendRawTerminalData("\t")}>Tab</button>
              <button type="button" title="Ctrl-C" onClick={() => sendRawTerminalData("\x03")}>C-c</button>
              <button type="button" title="Ctrl-D" onClick={() => sendRawTerminalData("\x04")}>C-d</button>
              <button type="button" title="Ctrl-L" onClick={() => sendRawTerminalData("\x0c")}>C-l</button>
              <button className="icon-key" aria-label="Arrow up" title="Arrow up" type="button" onClick={() => sendRawTerminalData("\x1b[A")}><ArrowUp size={15} /></button>
              <button className="icon-key" aria-label="Arrow left" title="Arrow left" type="button" onClick={() => sendRawTerminalData("\x1b[D")}><ArrowLeft size={15} /></button>
              <button className="icon-key" aria-label="Arrow down" title="Arrow down" type="button" onClick={() => sendRawTerminalData("\x1b[B")}><ArrowDown size={15} /></button>
              <button className="icon-key" aria-label="Arrow right" title="Arrow right" type="button" onClick={() => sendRawTerminalData("\x1b[C")}><ArrowRight size={15} /></button>
              <button type="button" title="Enter" onClick={() => sendRawTerminalData("\r")}><CornerDownLeft size={15} /> Enter</button>
            </div>
          )}
          {showTmuxSendForm && (
            <form className="tmux-send" onSubmit={(event) => { event.preventDefault(); sendTmux().catch(reportError(setError)); }}>
              <button aria-label="Stop tmux task" title="Stop tmux task" type="button" onClick={() => interruptTmux().catch(reportError(setError))}>
                <CircleStop size={15} />
              </button>
              <button
                aria-label="Attach files"
                disabled={uploadingTmuxFiles}
                title="Upload files to the server and insert their paths"
                type="button"
                onClick={() => tmuxFileInputRef.current?.click()}
              >
                <Paperclip size={15} />
              </button>
              <input
                ref={tmuxFileInputRef}
                className="tmux-file-input"
                multiple
                type="file"
                onChange={(event) => {
                  const input = event.currentTarget;
                  attachTmuxFiles(input.files).catch(reportError(setError)).finally(() => {
                    input.value = "";
                  });
                }}
              />
              <textarea
                ref={tmuxInputRef}
                rows={1}
                value={tmuxInput}
                onChange={(event) => {
                  setTmuxInput(event.target.value);
                  resizeTmuxInput(event.currentTarget);
                }}
                onKeyDown={handleTmuxInputKeyDown}
                onPaste={handleTmuxInputPaste}
                placeholder="send keys + Enter"
              />
              <button aria-label="Send to tmux" title="Send to tmux" type="submit"><Play size={15} /></button>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}

function TimelineCard({ entry }: { entry: TimelineEntry }) {
  return (
    <article className={`timeline-card ${entry.kind}`}>
      <div className="timeline-card-header">
        <strong>{entry.title}</strong>
        {entry.status && <span>{entry.status}</span>}
      </div>
      <pre>{entry.body ? <LinkifiedText text={entry.body} /> : " "}</pre>
    </article>
  );
}

function TmuxAgentSummaryStrip({
  events,
  onSelectSession,
  selectedSession,
  summary
}: {
  events: TmuxWatchEvent[];
  onSelectSession: (session: string) => void;
  selectedSession: string;
  summary: TmuxAgentSummary;
}) {
  const recentEvents = buildTmuxAttentionEvents(events, { selectedSession, limit: 3 });

  return (
    <section className={`tmux-agent-strip ${summary.kind}`} aria-label="Agent status">
      <div className="tmux-agent-state">
        <span className="tmux-agent-dot" />
        <div>
          <strong>{summary.title}</strong>
          <span>{summary.detail}</span>
        </div>
      </div>
      <div className="tmux-agent-action">{summary.action}</div>
      {recentEvents.length > 0 && (
        <div className="tmux-attention-list" aria-label="Recent waiting sessions">
          {recentEvents.map((event) => (
            <button
              className={event.session === selectedSession ? "active" : ""}
              key={event.id}
              type="button"
              onClick={() => onSelectSession(event.session)}
            >
              <AlertTriangle size={13} />
              <span>{event.session}</span>
              <small>{event.label}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const TmuxFocusView = forwardRef<HTMLDivElement, {
  events: TmuxWatchEvent[];
  messages: CompactTmuxMessage[];
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  onSelectSession: (session: string) => void;
  selectedSession: string;
  summary: TmuxAgentSummary;
}>(({ events, messages, onScroll, onSelectSession, selectedSession, summary }, ref) => {
  const attentionEvents = buildTmuxAttentionEvents(events, { selectedSession, limit: 4 });

  return (
    <div ref={ref} className="tmux-focus" onScroll={onScroll}>
      <div className={`tmux-focus-hero ${summary.kind}`}>
        <div className="tmux-focus-title">
          <span className="tmux-agent-dot" />
          <div>
            <strong>{summary.title}</strong>
            <span>{summary.detail}</span>
          </div>
        </div>
        <p>{summary.action}</p>
      </div>

      {attentionEvents.length > 0 && (
        <div className="tmux-focus-section">
          <span className="tmux-focus-section-label">Needs Attention</span>
          <div className="tmux-focus-events">
            {attentionEvents.map((event) => (
              <button
                className={event.session === selectedSession ? "active" : ""}
                key={event.id}
                type="button"
                onClick={() => onSelectSession(event.session)}
              >
                <AlertTriangle size={14} />
                <span>{event.session}</span>
                <small>{event.label}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="tmux-focus-section">
        <span className="tmux-focus-section-label">Recent Conversation</span>
        {messages.length === 0 ? (
          <p className="tmux-focus-empty">No compact messages captured yet.</p>
        ) : (
          <div className="tmux-focus-messages">
            {messages.map((message, index) => (
              <article
                className={`tmux-focus-message ${message.role}`}
                data-tmux-anchor-index={index}
                data-tmux-scroll-anchor=""
                key={message.id}
              >
                <span>{message.role === "user" ? "You" : message.role === "assistant" ? "Agent" : "Terminal"}</span>
                <p><LinkifiedText text={message.text} /></p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
TmuxFocusView.displayName = "TmuxFocusView";

const TmuxChatView = forwardRef<HTMLDivElement, {
  messages: TmuxChatMessage[];
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
}>(({ messages, onScroll }, ref) => (
  <div ref={ref} className="tmux-chat" onScroll={onScroll}>
    {messages.length === 0 ? (
      <article className="tmux-chat-message terminal">
        <div className="tmux-chat-bubble">No tmux output captured.</div>
      </article>
    ) : (
      messages.map((message, index) => (
        <article
          className={`tmux-chat-message ${message.role}`}
          key={message.id}
        >
          <span className="tmux-chat-label">{message.role === "user" ? "You" : message.role === "assistant" ? "Agent" : "Terminal"}</span>
          <TmuxChatBubble message={message} messageIndex={index} />
        </article>
      ))
    )}
  </div>
));
TmuxChatView.displayName = "TmuxChatView";

function TmuxChatBubble({ message, messageIndex }: { message: TmuxChatMessage; messageIndex: number }) {
  const parts = message.role === "user"
    ? [{ id: "part-0", kind: "text" as const, text: message.text }]
    : splitTmuxChatMessage(message.text);

  return (
    <div className="tmux-chat-bubble">
      {parts.map((part, partIndex) => part.kind === "code" ? (
        <pre className="tmux-chat-code" key={part.id}>
          {part.label && <span>{part.label}</span>}
          <code>
            <TmuxChatAnchorLines
              anchorBase={tmuxChatAnchorBase(messageIndex, partIndex)}
              className="tmux-chat-code-line"
              text={part.text}
            />
          </code>
        </pre>
      ) : (
        <p className="tmux-chat-text" key={part.id}>
          <TmuxChatAnchorLines
            anchorBase={tmuxChatAnchorBase(messageIndex, partIndex)}
            className="tmux-chat-text-line"
            linkify
            text={part.text}
          />
        </p>
      ))}
    </div>
  );
}

function TmuxChatAnchorLines({ anchorBase, className, linkify = false, text }: { anchorBase: number; className: string; linkify?: boolean; text: string }) {
  return text.split(/\r?\n/).map((line, index) => (
    <span
      className={className}
      data-tmux-anchor-index={anchorBase + index}
      data-tmux-scroll-anchor=""
      key={`${index}-${line}`}
    >
      {linkify ? <LinkifiedText text={line || "\u00a0"} /> : line || "\u00a0"}
    </span>
  ));
}

function tmuxChatAnchorBase(messageIndex: number, partIndex: number): number {
  return (messageIndex * 100_000) + (partIndex * 1_000);
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const token = browserAccessToken();
  if (token && !headers.has("x-agent-tmux-web-token")) {
    headers.set("x-agent-tmux-web-token", token);
  }

  const response = await fetch(url, {
    ...init,
    headers
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
  }
  return response.json() as Promise<T>;
}

async function uploadFileToServer(file: File): Promise<UploadedFileDto> {
  const query = new URLSearchParams({ filename: file.name || "upload" });
  const headers = new Headers({
    "content-type": file.type || "application/octet-stream"
  });
  const token = browserAccessToken();
  if (token) {
    headers.set("x-agent-tmux-web-token", token);
  }

  const response = await fetch(`/api/uploads?${query}`, {
    method: "POST",
    headers,
    body: file
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
  }
  const result = await response.json() as { file: UploadedFileDto };
  return result.file;
}

async function registerTmuxTaskWatch(session: string, label: string): Promise<void> {
  await api("/api/tmux/watch", {
    method: "POST",
    body: JSON.stringify({ session, label })
  });
}

function formatUploadedFilesForPrompt(files: UploadedFileDto[]): string {
  const label = files.length === 1 ? "Attached file on server" : "Attached files on server";
  return `${label}: ${files.map((file) => file.path).join(" ")}`;
}

function browserAccessToken(): string {
  return typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
}

function defaultTmuxToolModeIds(tool: TmuxToolDto): string[] {
  return tool.modes?.filter((mode) => mode.defaultEnabled).map((mode) => mode.id) ?? [];
}

function buildTmuxToolCommandPreview(tool: TmuxToolDto, modeIds: string[]): string {
  const modeIdSet = new Set(modeIds);
  const args = tool.modes
    ?.filter((mode) => modeIdSet.has(mode.id))
    .map((mode) => mode.args.trim())
    .filter(Boolean) ?? [];
  return [tool.command.trim(), ...args].filter(Boolean).join(" ");
}

function readInitialRequestedTmuxSession(): string {
  return typeof window === "undefined" ? "" : readRequestedTmuxSession(window.location.search);
}

function clearRequestedTmuxSessionFromAddressBar() {
  if (typeof window === "undefined") {
    return;
  }
  const current = new URL(window.location.href);
  const next = removeRequestedTmuxSession(current);
  if (next !== window.location.href) {
    window.history.replaceState(window.history.state, "", next);
  }
}

function readTmuxScrollSnapshot(node: HTMLElement): TmuxScrollSnapshot {
  const anchor = findFirstVisibleTmuxAnchor(node);
  const nodeTop = node.getBoundingClientRect().top;
  return {
    anchorIndex: anchor ? readTmuxAnchorIndex(anchor) : 0,
    anchorOffsetTop: anchor ? anchor.getBoundingClientRect().top - nodeTop : 0,
    anchorText: anchor?.textContent ?? "",
    scrollTop: node.scrollTop
  };
}

function restoreTmuxScrollSnapshot(node: HTMLElement, snapshot: TmuxScrollSnapshot): void {
  const anchor = findMatchingTmuxAnchor(node, snapshot);
  if (anchor) {
    const currentOffsetTop = anchor.getBoundingClientRect().top - node.getBoundingClientRect().top;
    node.scrollTop += currentOffsetTop - snapshot.anchorOffsetTop;
    return;
  }

  const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
  node.scrollTop = Math.min(snapshot.scrollTop, maxScrollTop);
}

function findFirstVisibleTmuxAnchor(node: HTMLElement): HTMLElement | null {
  const anchors = Array.from(node.querySelectorAll<HTMLElement>(TMUX_SCROLL_ANCHOR_SELECTOR));
  if (anchors.length === 0) {
    return null;
  }

  const nodeRect = node.getBoundingClientRect();
  const visible = anchors.filter((anchor) => {
    const anchorRect = anchor.getBoundingClientRect();
    return anchorRect.bottom > nodeRect.top && anchorRect.top < nodeRect.bottom;
  });
  return visible.find((anchor) => anchor.textContent?.trim()) ?? visible[0] ?? anchors[0] ?? null;
}

function findMatchingTmuxAnchor(node: HTMLElement, snapshot: TmuxScrollSnapshot): HTMLElement | null {
  const anchors = Array.from(node.querySelectorAll<HTMLElement>(TMUX_SCROLL_ANCHOR_SELECTOR));
  const matching = anchors.filter((anchor) => (anchor.textContent ?? "") === snapshot.anchorText);
  if (matching.length === 0) {
    return null;
  }
  return matching.sort((left, right) => (
    Math.abs(readTmuxAnchorIndex(left) - snapshot.anchorIndex)
      - Math.abs(readTmuxAnchorIndex(right) - snapshot.anchorIndex)
  ))[0] ?? null;
}

function readTmuxAnchorIndex(anchor: HTMLElement): number {
  const parsed = Number(anchor.dataset.tmuxAnchorIndex);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sendTerminalSocketInput(socket: WebSocket, data: string): void {
  for (let index = 0; index < data.length; index += RAW_TERMINAL_INPUT_CHUNK_SIZE) {
    socket.send(JSON.stringify({ type: "input", data: data.slice(index, index + RAW_TERMINAL_INPUT_CHUNK_SIZE) }));
  }
}

function readInitialColorTheme(): ColorTheme {
  if (typeof window === "undefined") {
    return "dark";
  }
  let storedTheme: string | null = null;
  try {
    storedTheme = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
  } catch {
    storedTheme = null;
  }
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
  return resolveInitialColorTheme(storedTheme, prefersLight);
}

function writeColorThemePreference(theme: ColorTheme) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  } catch {
    // Some private browser modes block localStorage; the in-memory theme still applies.
  }
}

function terminalThemeForColorTheme(theme: ColorTheme) {
  return theme === "light"
    ? {
      background: "#ffffff",
      foreground: "#172026",
      cursor: "#087f6b",
      selectionBackground: "#b7e4d8"
    }
    : {
      background: "#0d0f10",
      foreground: "#d8dee2",
      cursor: "#54b399",
      selectionBackground: "#2f6f5f"
    };
}

function readTmuxNotificationPreference(): boolean {
  if (!canShowBrowserNotifications()) {
    return false;
  }
  try {
    return window.localStorage.getItem(TMUX_NOTIFICATION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTmuxNotificationPreference(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(TMUX_NOTIFICATION_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Some private browser modes block localStorage; notification permission still applies.
  }
}

function showTmuxDoneNotification(session: string, label: string) {
  const notification = buildTmuxDoneNotification(session, label);
  showAgentNotification(
    notification.title,
    notification.body,
    notification.tag,
    { tmuxSession: notification.tmuxSession }
  );
}

function describeTerminalKey(data: string): string {
  if (data === "\x1b") return "Esc";
  if (data === "\t") return "Tab";
  if (data === "\x03") return "Ctrl-C";
  if (data === "\x04") return "Ctrl-D";
  if (data === "\x0c") return "Ctrl-L";
  if (data === "\r") return "Enter";
  if (data === "\x1b[A") return "Up";
  if (data === "\x1b[B") return "Down";
  if (data === "\x1b[C") return "Right";
  if (data === "\x1b[D") return "Left";
  return "key";
}

function handleWsPayload(
  payload: WsPayload,
  setStatus: React.Dispatch<React.SetStateAction<AppStatus | null>>,
  setThreadStatus: (status: string) => void,
  setTimeline: React.Dispatch<React.SetStateAction<TimelineEntry[]>>,
  setActiveTurnId: (turnId: string) => void
) {
  if (payload.type === "hello") {
    if (isAppStatus(payload.status)) {
      setStatus(payload.status);
    }
    payload.recentEvents?.forEach((event) => handleWsPayload(event, setStatus, setThreadStatus, setTimeline, setActiveTurnId));
    return;
  }

  if (payload.type === "codex-status") {
    const codexStatus = isCodexStatus(payload.status) ? payload.status : null;
    if (codexStatus) {
      setStatus((current) => current ? {
        ...current,
        codex: {
          ...current.codex,
          ...codexStatus
        }
      } : current);
    }
    return;
  }

  const description = payload.description;
  if (!description) {
    return;
  }

  if (description.turnId) {
    setActiveTurnId(description.turnId);
  }
  if (description.kind === "status" && description.status) {
    setThreadStatus(clipText(description.status, 42));
  }

  setTimeline((entries) => applyDescription(entries, description));
}

function isAppStatus(value: unknown): value is AppStatus {
  return Boolean(value && typeof value === "object" && "bindHost" in value && "codex" in value);
}

function isCodexStatus(value: unknown): value is Partial<AppStatus["codex"]> {
  return Boolean(value && typeof value === "object" && ("connected" in value || "initialized" in value || "lastError" in value));
}

function isTmuxWatchEvent(value: unknown): value is TmuxWatchEvent {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as Record<string, unknown>).id === "number"
    && typeof (value as Record<string, unknown>).session === "string"
    && typeof (value as Record<string, unknown>).label === "string"
  );
}

function tmuxWatchEventsFromPayload(payload: WsPayload): TmuxWatchEvent[] {
  const events: TmuxWatchEvent[] = [];
  for (const event of payload.tmuxWatchEvents ?? []) {
    if (isTmuxWatchEvent(event)) {
      events.push(event);
    }
  }
  if (payload.type === "tmux-watch-done" && isTmuxWatchEvent(payload.event)) {
    events.push(payload.event);
  }
  for (const recent of payload.recentEvents ?? []) {
    events.push(...tmuxWatchEventsFromPayload(recent));
  }
  return events;
}

function mergeTmuxWatchEvents(current: TmuxWatchEvent[], incoming: TmuxWatchEvent[]): TmuxWatchEvent[] {
  const byId = new Map<number, TmuxWatchEvent>();
  for (const event of [...incoming, ...current]) {
    byId.set(event.id, event);
  }
  return [...byId.values()]
    .sort((left, right) => Date.parse(right.finishedAt) - Date.parse(left.finishedAt))
    .slice(0, 8);
}

function applyDescription(entries: TimelineEntry[], description: UiEventDescription): TimelineEntry[] {
  if (description.kind === "unknown" && !description.threadId && !description.itemId) {
    return entries;
  }

  const id = description.itemId || `${description.kind}-${Date.now()}-${Math.random()}`;

  if (description.kind.endsWith("delta") || description.kind === "tool-output") {
    const title = description.kind === "assistant-delta" ? "Agent" : description.kind === "reasoning-delta" ? "Reasoning" : description.kind === "plan-delta" ? "Plan" : "Shell Output";
    return appendEntry(entries, id, {
      kind: description.kind,
      title,
      body: description.text ?? "",
      status: description.status
    });
  }

  if (description.kind === "item-started") {
    return upsertEntry(entries, id, {
      id,
      kind: description.kind,
      title: description.title ?? "Started",
      body: description.body ?? "",
      status: description.status
    });
  }

  if (description.kind === "item-completed") {
    return upsertEntry(entries, id, {
      id,
      kind: description.kind,
      title: description.title ?? "Completed",
      body: description.body ?? "",
      status: description.status || "completed"
    }, true);
  }

  return [
    ...entries,
    {
      id,
      kind: description.kind,
      title: description.title ?? description.kind,
      body: description.body ?? description.text ?? "",
      status: description.status
    }
  ];
}

function appendEntry(entries: TimelineEntry[], id: string, patch: Omit<TimelineEntry, "id">): TimelineEntry[] {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return [...entries, { id, ...patch }];
  }

  return entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, body: `${entry.body}${patch.body}`, status: patch.status ?? entry.status } : entry);
}

function upsertEntry(entries: TimelineEntry[], id: string, next: TimelineEntry, preserveBody = false): TimelineEntry[] {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return [...entries, next];
  }
  return entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...next, body: preserveBody && entry.body ? entry.body : next.body } : entry);
}

function addUserEntry(setTimeline: React.Dispatch<React.SetStateAction<TimelineEntry[]>>, text: string) {
  setTimeline((entries) => [
    ...entries,
    {
      id: `user-${Date.now()}`,
      kind: "user",
      title: "You",
      body: text
    }
  ]);
}

function addLocalEntry(setTimeline: React.Dispatch<React.SetStateAction<TimelineEntry[]>>, title: string, body: string) {
  setTimeline((entries) => [
    ...entries,
    {
      id: `local-${Date.now()}-${Math.random()}`,
      kind: "local",
      title,
      body
    }
  ]);
}

function clearTmuxFollowTimers(ref: React.MutableRefObject<number[]>) {
  for (const timer of ref.current) {
    window.clearTimeout(timer);
  }
  ref.current = [];
}

function parseTerminalSocketMessage(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(data) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function threadToEntries(turns: Array<{ items: unknown[] }>): TimelineEntry[] {
  return turns.flatMap((turn) =>
    turn.items.map((item, index) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const summary = describeThreadItem(record);
      return {
        id: String(record.id ?? `${index}-${summary.title}`),
        kind: summary.kind,
        title: summary.title,
        body: summary.body,
        status: summary.status
      };
    })
  );
}

function reportError(setError: (message: string) => void) {
  return (error: unknown) => {
    setError(error instanceof Error ? error.message : String(error));
  };
}

function clipText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}
