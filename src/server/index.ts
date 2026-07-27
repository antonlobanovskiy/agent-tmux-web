import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import express, { type Request, type Response, type NextFunction } from "express";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

import { TMUX_CAPTURE_HISTORY_LINES, type AppStatus, type TmuxCaptureDto, type TmuxSessionDto } from "../shared/api.js";
import { describeCodexNotification } from "../shared/codexEvents.js";
import { classifyTmuxStatus, mergeTmuxSessionStatus } from "../shared/tmuxStatus.js";
import { CodexBridge } from "./codexBridge.js";
import {
  buildBrowserRawTerminalPolicy,
  buildTmuxCaptureSizeFromClientDimensions,
  buildScriptArgsForTmuxAttach,
  buildTmuxDisplayWindowSizeArgs,
  buildTmuxResizeWindowArgs,
  buildTmuxRestoreWindowStateCommandSequence,
  buildTmuxShowWindowSizeOptionArgs,
  isSameTerminalSize,
  normalizeTerminalSize,
  parseTmuxWindowSize,
  type TerminalSize,
  type TmuxWindowState
} from "./terminal.js";
import {
  captureTmuxPane,
  captureTmuxPaneView,
  captureTmuxVisiblePane,
  createTmuxSession,
  detectTmuxInterruptKey,
  detectTmuxSubmitKey,
  destroyTmuxSession,
  fitTmuxCaptureSizeForPane,
  inspectTmuxPane,
  interruptTmuxPane,
  listTmuxSessions,
  listTmuxTools,
  openCodexInTmux,
  openTmuxTool,
  readTmuxHarnessStatuses,
  sendTmuxText,
  type TmuxInterruptKey,
  type TmuxSubmitKey
} from "./tmux.js";
import {
  cleanupUploadRoots,
  resolveLegacyUploadRoot,
  resolveUploadAliasRoot,
  resolveUploadRoot,
  saveUploadedFileForClient
} from "./uploads.js";
import { TmuxWatchStore } from "./tmuxWatch.js";

const execFileAsync = promisify(execFile);

const bindHost = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 6174);
const codexAppServerPort = Number(process.env.CODEX_APP_SERVER_PORT ?? 43117);
const codexAppServerAutostart = process.env.CODEX_APP_SERVER_AUTOSTART === "1";
const authToken = process.env.AGENT_TMUX_WEB_AUTH_TOKEN ?? process.env.CODEX_WEB_AUTH_TOKEN ?? "";
const defaultCwd = process.env.CLI_WEB_DEFAULT_CWD ?? process.env.HOME ?? process.cwd();
const jsonBodyLimit = process.env.AGENT_TMUX_WEB_JSON_LIMIT ?? "25mb";
const runtimeEnvironment = process.env.AGENT_TMUX_WEB_ENV === "development"
  ? "development"
  : "production";
const developmentMode = runtimeEnvironment === "development";

const app = express();
const server = http.createServer(app);
const bridge = new CodexBridge({ port: codexAppServerPort });
const sockets = new Set<WebSocket>();
const rawTerminalClients = new Map<string, Map<string, number>>();
const recentEvents: unknown[] = [];
const watchPollers = new Map<string, {
  id: string;
  lastSeen: string;
  remoteAddress: string;
  since: number;
  userAgent: string;
}>();
const tmuxWatch = new TmuxWatchStore({
  capture: captureTmuxPane,
  listSessions: listTmuxSessions,
  onEvent: (event) => broadcast({ type: "tmux-watch-done", event }),
  onError: (error, session) => {
    if ((process.env.AGENT_TMUX_WEB_VERBOSE ?? process.env.CODEX_WEB_VERBOSE) === "1") {
      console.error(`tmux watch failed for ${session}`, error);
    }
  }
});
const jsonBodyParser = express.json({ limit: jsonBodyLimit });

app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "connect-src 'self' ws: wss:",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self'${developmentMode ? " 'unsafe-inline'" : ""}`,
    `worker-src 'self'${developmentMode ? " blob:" : ""}`,
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'"
  ].join("; "));
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use((req, res, next) => {
  if (req.path === "/api/uploads") {
    next();
    return;
  }
  jsonBodyParser(req, res, next);
});

app.use((req, res, next) => {
  if (!authToken || req.path === "/healthz" || isPublicAssetRequest(req)) {
    next();
    return;
  }

  const provided = req.header("x-agent-tmux-web-token") ?? req.header("x-codex-web-token") ?? String(req.query.token ?? "");
  if (isValidAuthToken(provided)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/status", asyncHandler(async (_req, res) => {
  res.json(await getStatus());
}));

app.get("/api/models", asyncHandler(async (_req, res) => {
  const result = await bridge.rpc("model/list", { limit: 100, includeHidden: false });
  res.json(result);
}));

app.get("/api/skills", asyncHandler(async (req, res) => {
  const cwd = typeof req.query.cwd === "string" && req.query.cwd ? req.query.cwd : process.cwd();
  const result = await bridge.rpc("skills/list", { cwds: [cwd], forceReload: req.query.reload === "1" });
  res.json(result);
}));

app.get("/api/threads", asyncHandler(async (_req, res) => {
  const result = await bridge.rpc("thread/list", {
    limit: 60,
    sourceKinds: ["cli", "exec", "appServer"],
    archived: false
  });
  res.json(result);
}));

app.get("/api/thread/:threadId", asyncHandler(async (req, res) => {
  const result = await bridge.rpc("thread/read", {
    threadId: req.params.threadId,
    includeTurns: true
  });
  res.json(result);
}));

app.post("/api/thread/start", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const result = await bridge.rpc("thread/start", {
    cwd: stringOrNull(body.cwd) ?? process.env.HOME ?? process.cwd(),
    model: stringOrNull(body.model),
    serviceTier: stringOrNull(body.serviceTier) ?? "fast",
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: "danger-full-access",
    threadSource: "user",
    sessionStartSource: "startup"
  });
  res.json(result);
}));

app.post("/api/thread/resume", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const threadId = requireString(body.threadId, "threadId");
  const result = await bridge.rpc("thread/resume", {
    threadId,
    cwd: stringOrNull(body.cwd),
    model: stringOrNull(body.model),
    serviceTier: stringOrNull(body.serviceTier) ?? "fast",
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: "danger-full-access"
  });
  res.json(result);
}));

app.post("/api/turn/start", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const threadId = requireString(body.threadId, "threadId");
  const text = requireString(body.text, "text");
  const result = await bridge.rpc("turn/start", {
    threadId,
    input: buildUserInput(text, body.skills),
    cwd: stringOrNull(body.cwd),
    approvalPolicy: "never",
    sandboxPolicy: { type: "dangerFullAccess" },
    model: stringOrNull(body.model),
    serviceTier: stringOrNull(body.serviceTier) ?? "fast",
    effort: stringOrNull(body.effort)
  });
  res.json(result);
}));

app.post("/api/turn/steer", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const result = await bridge.rpc("turn/steer", {
    threadId: requireString(body.threadId, "threadId"),
    expectedTurnId: requireString(body.expectedTurnId, "expectedTurnId"),
    input: buildUserInput(requireString(body.text, "text"), body.skills)
  });
  res.json(result);
}));

app.post("/api/turn/interrupt", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const result = await bridge.rpc("turn/interrupt", {
    threadId: requireString(body.threadId, "threadId")
  });
  res.json(result);
}));

app.get("/api/tmux/sessions", asyncHandler(async (req, res) => {
  res.json({ data: await listTmuxSessionsWithStatus(stringOrNull(req.query.clientId)) });
}));

app.get("/api/tmux/tools", asyncHandler(async (_req, res) => {
  res.json({ data: listTmuxTools() });
}));

app.get("/api/tmux/capture", asyncHandler(async (req, res) => {
  const session = requireString(req.query.session, "session");
  const lines = typeof req.query.lines === "string" ? Number(req.query.lines) : TMUX_CAPTURE_HISTORY_LINES;
  const outputRevision = stringOrNull(req.query.outputRevision);
  if (req.query.resize === "true") {
    const [preserveExistingClientSize, paneMetadata] = await Promise.all([
      hasAttachedTmuxClients(session).catch(() => false),
      inspectTmuxPane(session).catch(() => null)
    ]);
    const captureSize = fitTmuxCaptureSizeForPane(
      buildTmuxCaptureSizeFromClientDimensions(req.query.clientWidth, req.query.clientHeight),
      paneMetadata
    );
    const resized = !preserveExistingClientSize && await resizeTmuxWindowIfNeeded(session, captureSize).catch(() => {
      // Best-effort: capture remains useful even if tmux rejects a resize.
      return false;
    });
    if (resized) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  const capture = await captureTmuxPaneView(session, lines, outputRevision ?? undefined);
  res.json({ session, ...capture } satisfies TmuxCaptureDto);
}));

app.post("/api/tmux/create", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  await createTmuxSession(
    requireString(body.name, "name"),
    stringOrNull(body.cwd)
  );
  res.json({
    data: await listTmuxSessionsWithStatus()
  });
}));

app.post("/api/tmux/destroy", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  await destroyTmuxSession(session);
  tmuxWatch.cancelWatch(session);
  res.json({
    data: await listTmuxSessionsWithStatus()
  });
}));

app.post("/api/tmux/open-codex", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  await openCodexInTmux(session, {
    cwd: stringOrNull(body.cwd) ?? process.cwd(),
    model: stringOrNull(body.model)
  });
  tmuxWatch.startWatch(session, "Codex");
  const capture = await captureTmuxPaneView(session, TMUX_CAPTURE_HISTORY_LINES);
  res.json({ ok: true, session, ...capture } satisfies TmuxCaptureDto & { ok: true });
}));

app.post("/api/tmux/open-tool", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  const requestedToolId = stringOrNull(body.toolId);
  const configuredTool = requestedToolId
    ? listTmuxTools().find((tool) => tool.id === requestedToolId)
    : null;
  const modeIds = Array.isArray(body.modeIds) ? stringArray(body.modeIds) : undefined;
  const command = configuredTool?.command ?? requireString(body.command, "command");
  await openTmuxTool(session, configuredTool ?? { command }, configuredTool ? modeIds : []);
  tmuxWatch.startWatch(session, configuredTool?.label ?? command);
  const capture = await captureTmuxPaneView(session, TMUX_CAPTURE_HISTORY_LINES);
  res.json({ ok: true, session, ...capture } satisfies TmuxCaptureDto & { ok: true });
}));

app.post("/api/tmux/send", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  const enter = body.enter !== false;
  await sendTmuxText(
    session,
    requireString(body.text, "text"),
    enter,
    enter ? await resolveTmuxSubmitKey(session, body.submitKey) : "enter"
  );
  if (enter) {
    tmuxWatch.startWatch(session, stringOrNull(body.label) ?? "Tmux task");
  }
  res.json({ ok: true });
}));

app.post("/api/tmux/interrupt", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  await interruptTmuxPane(session, await resolveTmuxInterruptKey(session, body.interruptKey));
  tmuxWatch.cancelWatch(session);
  const capture = await captureTmuxPaneView(session, TMUX_CAPTURE_HISTORY_LINES);
  res.json({ ok: true, session, ...capture } satisfies TmuxCaptureDto & { ok: true });
}));

app.post("/api/tmux/watch", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  res.json({
    ok: true,
    watch: tmuxWatch.startWatch(session, stringOrNull(body.label) ?? "Tmux task")
  });
}));

app.delete("/api/tmux/watch/:session", asyncHandler(async (req, res) => {
  tmuxWatch.cancelWatch(String(req.params.session));
  res.json({ ok: true });
}));

app.get("/api/tmux/watch/events", asyncHandler(async (req, res) => {
  const since = typeof req.query.since === "string" ? Number(req.query.since) : 0;
  const cursor = Number.isFinite(since) && since > 0 ? Math.floor(since) : 0;
  recordWatchPoll(req, cursor);
  res.json({
    data: tmuxWatch.getEventsSince(cursor),
    latestEventId: tmuxWatch.latestEventId(),
    baselineEventId: tmuxWatch.latestBaselineEventId(),
    watches: tmuxWatch.listWatches()
  });
}));

app.get("/api/tmux/watch/status", asyncHandler(async (_req, res) => {
  res.json({
    latestEventId: tmuxWatch.latestEventId(),
    baselineEventId: tmuxWatch.latestBaselineEventId(),
    watches: tmuxWatch.listWatches(),
    recentEvents: tmuxWatch.getEventsSince(Math.max(0, tmuxWatch.latestEventId() - 10)),
    pollers: listRecentWatchPollers()
  });
}));

async function listTmuxSessionsWithStatus(excludedBrowserClientId?: string | null): Promise<TmuxSessionDto[]> {
  const sessions = await listTmuxSessions();
  const harnessStatuses = await readTmuxHarnessStatuses(sessions);
  const nowMs = Date.now();
  return Promise.all(sessions.map(async (session) => {
    const {
      clientCount,
      panePid: _panePid,
      currentPath: _currentPath,
      paneTitle: _paneTitle,
      ...sessionData
    } = session;
    const output = await captureTmuxVisiblePane(session.name).catch(() => "");
    const visibleStatus = classifyTmuxStatus({
      activityAtMs: session.activityAtMs,
      nowMs,
      output
    });
    const harnessStatus = harnessStatuses.get(session.name);
    const status = mergeTmuxSessionStatus(visibleStatus, harnessStatus);
    return {
      ...sessionData,
      viewerCount: Math.max(0, clientCount - rawTerminalClientCount(excludedBrowserClientId, session.name)),
      status
    };
  }));
}

function rawTerminalClientCount(browserClientId: string | null | undefined, session: string): number {
  return browserClientId ? rawTerminalClients.get(browserClientId)?.get(session) ?? 0 : 0;
}

function updateRawTerminalClientCount(browserClientId: string, session: string, delta: 1 | -1): void {
  const sessions = rawTerminalClients.get(browserClientId) ?? new Map<string, number>();
  const nextCount = Math.max(0, (sessions.get(session) ?? 0) + delta);
  if (nextCount > 0) {
    sessions.set(session, nextCount);
    rawTerminalClients.set(browserClientId, sessions);
    return;
  }
  sessions.delete(session);
  if (sessions.size === 0) {
    rawTerminalClients.delete(browserClientId);
  }
}

app.post("/api/uploads", asyncHandler(async (req, res) => {
  const originalName = requireString(req.query.filename, "filename");
  const file = await saveUploadedFileForClient(req, {
    originalName,
    mimeType: stringOrNull(req.header("content-type"))
  });
  res.json({ file });
}));

app.post("/api/server-request/:requestId/respond", asyncHandler(async (req, res) => {
  bridge.respondToServerRequest(String(req.params.requestId), (req.body as Record<string, unknown>).result);
  res.json({ ok: true });
}));

const clientDist = path.join(process.cwd(), "dist", "client");
if (developmentMode) {
  const { createServer: createViteServer } = await import("vite");
  const tailscaleDns = await readTailscale().then((tailscale) => tailscale.dns).catch(() => null);
  const allowedHosts = [...new Set([
    bindHost,
    tailscaleDns,
    ...(process.env.AGENT_TMUX_WEB_DEV_ALLOWED_HOSTS ?? "").split(",")
  ].map((host) => host?.trim()).filter((host): host is string => Boolean(host)))];
  const vite = await createViteServer({
    appType: "spa",
    configFile: path.join(process.cwd(), "vite.config.ts"),
    server: {
      allowedHosts,
      hmr: { server },
      middlewareMode: true
    }
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", async (socket, req) => {
  const url = new URL(req.url ?? "/ws", `http://${req.headers.host ?? "localhost"}`);
  if (!isAuthorizedWebSocket(url)) {
    socket.close(1008, "Unauthorized");
    return;
  }

  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.send(JSON.stringify({
    type: "hello",
    status: await getStatus()
  }));
});

const tmuxWss = new WebSocketServer({ noServer: true });
tmuxWss.on("connection", async (socket, req) => {
  const url = new URL(req.url ?? "/tmux-ws", `http://${req.headers.host ?? "localhost"}`);
  if (!isAuthorizedWebSocket(url)) {
    socket.close(1008, "Unauthorized");
    return;
  }

  const session = stringOrNull(url.searchParams.get("session"));
  if (!session) {
    sendTerminalMessage(socket, { type: "error", message: "Missing tmux session" });
    socket.close(1008, "Missing tmux session");
    return;
  }
  const browserClientId = stringOrNull(url.searchParams.get("clientId"));
  if (browserClientId) {
    updateRawTerminalClientCount(browserClientId, session, 1);
    socket.once("close", () => updateRawTerminalClientCount(browserClientId, session, -1));
  }

  const size = normalizeTerminalSize(url.searchParams.get("cols"), url.searchParams.get("rows"));
  const initialWindowState = await readTmuxWindowState(session).catch(() => null);
  const hasAttachedClients = await hasAttachedTmuxClients(session).catch(() => false);
  const rawTerminalPolicy = buildBrowserRawTerminalPolicy({ hasAttachedClients });
  let restoredWindowState = false;
  const restoreWindowState = () => {
    if (restoredWindowState) {
      return;
    }
    restoredWindowState = true;
    restoreTmuxWindowState(session, initialWindowState).catch(() => {
      // Best-effort cleanup; the tmux session should not remain manually sized.
    });
  };

  if (rawTerminalPolicy.resizeTmuxWindowOnAttach) {
    await resizeTmuxWindowIfNeeded(session, size).catch(() => {
      // Best-effort initial resize; the browser PTY is still sized before attach.
    });
  }

  const child = spawn("script", buildScriptArgsForTmuxAttach(session, rawTerminalPolicy.attachOptions, size), {
    cwd: process.env.HOME ?? process.cwd(),
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      COLUMNS: String(size.cols),
      LINES: String(size.rows)
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  sendTerminalMessage(socket, { type: "status", message: `live terminal for ${session}` });

  child.stdout.on("data", (chunk: Buffer) => {
    sendTerminalMessage(socket, { type: "output", data: chunk.toString("utf8") });
  });
  child.stderr.on("data", (chunk: Buffer) => {
    sendTerminalMessage(socket, { type: "output", data: chunk.toString("utf8") });
  });
  child.on("error", (error) => {
    sendTerminalMessage(socket, { type: "error", message: error.message });
  });
  child.on("exit", (code, signal) => {
    restoreWindowState();
    sendTerminalMessage(socket, { type: "status", message: `tmux detached (${code ?? signal ?? "closed"})` });
    if (socket.readyState === socket.OPEN) {
      socket.close(1000, "tmux detached");
    }
  });

  socket.on("message", (raw) => {
    const message = parseTerminalMessage(raw);
    if (!message) {
      return;
    }

    if (message.type === "input" && typeof message.data === "string") {
      child.stdin.write(message.data);
      if (/[\r\n]/.test(message.data)) {
        tmuxWatch.startWatch(session, "Tmux task");
      }
      return;
    }

    if (message.type === "resize" && rawTerminalPolicy.resizeTmuxWindow) {
      const nextSize = normalizeTerminalSize(message.cols, message.rows);
      resizeTmuxWindowIfNeeded(session, nextSize).catch(() => {
        // Best-effort resize; the tmux attachment remains usable if this fails.
      });
    }
  });

  socket.on("close", () => {
    restoreWindowState();
    closeTerminalChild(child);
  });
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const target = url.pathname === "/ws" ? wss : url.pathname === "/tmux-ws" ? tmuxWss : null;
  if (!target) {
    const viteHmr = developmentMode
      && url.pathname === "/"
      && req.headers["sec-websocket-protocol"] === "vite-hmr";
    if (!viteHmr) socket.destroy();
    return;
  }

  target.handleUpgrade(req, socket, head, (webSocket) => {
    target.emit("connection", webSocket, req);
  });
});

bridge.on("notification", (notification) => {
  broadcast({ type: "codex-notification", notification, description: describeCodexNotification(notification as Record<string, unknown>) });
});
bridge.on("server-request", (request) => {
  broadcast({ type: "codex-server-request", request });
});
bridge.on("status", (status) => {
  broadcast({ type: "codex-status", status });
});
bridge.on("log", (line) => {
  if ((process.env.AGENT_TMUX_WEB_VERBOSE ?? process.env.CODEX_WEB_VERBOSE) === "1") {
    console.error(line.trim());
  }
});

server.listen(port, bindHost, async () => {
  console.log(`agent-tmux-web listening on http://${bindHost}:${port}`);
  startUploadCleanup();
  tmuxWatch.startAutoPoll();
  if (codexAppServerAutostart) {
    bridge.start().catch((error: unknown) => {
      console.error("Failed to start Codex bridge", error);
    });
  }
});

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function isPublicAssetRequest(req: Request): boolean {
  const normalizedPath = req.path.toLowerCase();
  return req.method === "GET" && (
    req.path.startsWith("/assets/")
    || req.path === "/favicon.ico"
    || (developmentMode && req.path !== "/" && !normalizedPath.startsWith("/api/"))
  );
}

function isAuthorizedWebSocket(url: URL): boolean {
  return !authToken || isValidAuthToken(url.searchParams.get("token") ?? "");
}

function isValidAuthToken(provided: string): boolean {
  if (!authToken || !provided) {
    return false;
  }

  const expected = Buffer.from(authToken);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sendTerminalMessage(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function closeTerminalChild(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (child.stdin.writable) {
    child.stdin.write("\x02d");
    child.stdin.end();
  }

  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }, 100);
  timer.unref();
}

function parseTerminalMessage(raw: RawData): Record<string, unknown> | null {
  const text = rawToString(raw);
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function readTmuxWindowState(session: string): Promise<TmuxWindowState> {
  const [size, { stdout: optionStdout }] = await Promise.all([
    readTmuxWindowSize(session),
    execFileAsync("tmux", buildTmuxShowWindowSizeOptionArgs(session))
  ]);
  return {
    size,
    windowSizeOption: optionStdout.trim() || "latest"
  };
}

async function readTmuxWindowSize(session: string): Promise<TerminalSize> {
  const { stdout } = await execFileAsync("tmux", buildTmuxDisplayWindowSizeArgs(session));
  return parseTmuxWindowSize(stdout);
}

async function resizeTmuxWindowIfNeeded(session: string, nextSize: TerminalSize): Promise<boolean> {
  const currentSize = await readTmuxWindowSize(session);
  if (isSameTerminalSize(currentSize, nextSize)) {
    return false;
  }
  await execFileAsync("tmux", buildTmuxResizeWindowArgs(session, nextSize));
  return true;
}

async function hasAttachedTmuxClients(session: string): Promise<boolean> {
  const { stdout } = await execFileAsync("tmux", ["list-clients", "-t", session, "-F", "#{client_tty}"]);
  return stdout.trim().length > 0;
}

async function restoreTmuxWindowState(session: string, state: TmuxWindowState | null): Promise<void> {
  if (!state) {
    return;
  }

  for (const args of buildTmuxRestoreWindowStateCommandSequence(session, state)) {
    await execFileAsync("tmux", args);
  }
}

async function resolveTmuxSubmitKey(session: string, requested: unknown): Promise<TmuxSubmitKey> {
  if (requested === "enter" || requested === "tab" || requested === "codex-enter") {
    return requested;
  }
  return detectTmuxSubmitKey(await captureTmuxPane(session, 220));
}

async function resolveTmuxInterruptKey(session: string, requested: unknown): Promise<TmuxInterruptKey> {
  if (requested === "escape" || requested === "ctrl-c") {
    return requested;
  }
  return detectTmuxInterruptKey(await captureTmuxPane(session, 220));
}

function rawToString(raw: RawData): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (Buffer.isBuffer(raw)) {
    return raw.toString("utf8");
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }
  return Buffer.from(raw).toString("utf8");
}

function startUploadCleanup(): void {
  const clean = () => {
    void cleanupUploadRoots(
      [resolveUploadRoot(), resolveLegacyUploadRoot()],
      resolveUploadAliasRoot()
    ).catch((error: unknown) => {
      console.error("Failed to clean expired uploads", error);
    });
  };

  clean();
  const timer = setInterval(clean, 60 * 60 * 1000);
  timer.unref();
}

function recordWatchPoll(req: Request, since: number): void {
  const userAgent = req.header("user-agent") ?? "";
  const explicitClient = req.header("x-agent-tmux-web-client") ?? "";
  const remoteAddress = req.ip || req.socket.remoteAddress || "unknown";
  const id = `${explicitClient || userAgent || "unknown"} ${remoteAddress}`;
  watchPollers.set(id, {
    id,
    lastSeen: new Date().toISOString(),
    remoteAddress,
    since,
    userAgent
  });
}

function listRecentWatchPollers(): Array<{
  id: string;
  lastSeen: string;
  remoteAddress: string;
  secondsAgo: number;
  since: number;
  userAgent: string;
}> {
  const now = Date.now();
  return [...watchPollers.values()]
    .map((poller) => ({
      ...poller,
      secondsAgo: Math.round((now - Date.parse(poller.lastSeen)) / 1000)
    }))
    .filter((poller) => poller.secondsAgo <= 10 * 60)
    .sort((left, right) => left.secondsAgo - right.secondsAgo);
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const statusCode = typeof record.statusCode === "number" ? record.statusCode : 500;
  if (statusCode >= 500) {
    console.error("Request failed", error);
  }
  res.status(statusCode).json({ error: message });
});

function broadcast(payload: unknown): void {
  recentEvents.push(payload);
  if (recentEvents.length > 500) {
    recentEvents.splice(0, recentEvents.length - 500);
  }

  const encoded = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(encoded);
    }
  }
}

async function getStatus(): Promise<AppStatus> {
  const tailscale = await readTailscale().catch(() => ({ ip: null, dns: null }));
  return {
    environment: runtimeEnvironment,
    bindHost,
    port,
    defaultCwd,
    tailscaleIp: tailscale.ip,
    tailscaleDns: tailscale.dns,
    codex: {
      connected: bridge.connected,
      appServerUrl: bridge.appServerUrl,
      initialized: bridge.initialized,
      lastError: bridge.lastError
    }
  };
}

async function readTailscale(): Promise<{ ip: string | null; dns: string | null }> {
  const [{ stdout: ipStdout }, { stdout: statusStdout }] = await Promise.all([
    execFileAsync("tailscale", ["ip", "-4"]),
    execFileAsync("tailscale", ["status", "--json"])
  ]);
  const status = JSON.parse(statusStdout) as { Self?: { DNSName?: string } };
  return {
    ip: ipStdout.trim().split(/\s+/)[0] || null,
    dns: status.Self?.DNSName?.replace(/\.$/, "") ?? null
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, name: string): string {
  const result = stringOrNull(value);
  if (!result) {
    throw new Error(`Missing required field: ${name}`);
  }
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((entry) => stringOrNull(entry) ?? []) : [];
}

function buildUserInput(text: string, skills: unknown) {
  const skillInputs = Array.isArray(skills)
    ? skills.flatMap((skill) => {
        const record = skill && typeof skill === "object" ? (skill as Record<string, unknown>) : {};
        const name = stringOrNull(record.name);
        const skillPath = stringOrNull(record.path);
        return name && skillPath ? [{ type: "skill", name, path: skillPath }] : [];
      })
    : [];

  return [
    ...skillInputs,
    {
      type: "text",
      text,
      text_elements: []
    }
  ];
}
