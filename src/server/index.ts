import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import express, { type Request, type Response, type NextFunction } from "express";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

import { type AppStatus } from "../shared/api.js";
import { describeCodexNotification } from "../shared/codexEvents.js";
import { CodexBridge } from "./codexBridge.js";
import {
  buildScriptArgsForTmuxAttach,
  buildTmuxDisplayWindowSizeArgs,
  buildTmuxResizeWindowArgs,
  buildTmuxRestoreWindowStateCommandSequence,
  buildTmuxShowWindowSizeOptionArgs,
  normalizeTerminalSize,
  parseTmuxWindowSize,
  type TmuxWindowState
} from "./terminal.js";
import {
  captureTmuxPane,
  createTmuxSession,
  detectTmuxInterruptKey,
  detectTmuxSubmitKey,
  destroyTmuxSession,
  interruptTmuxPane,
  listTmuxSessions,
  listTmuxTools,
  openCodexInTmux,
  openTmuxTool,
  sendTmuxText,
  type TmuxInterruptKey,
  type TmuxSubmitKey
} from "./tmux.js";
import {
  cleanupExpiredUploads,
  resolveLegacyUploadRoot,
  resolveUploadRoot,
  saveUploadedFile
} from "./uploads.js";

const execFileAsync = promisify(execFile);

const bindHost = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 6174);
const codexAppServerPort = Number(process.env.CODEX_APP_SERVER_PORT ?? 43117);
const codexAppServerAutostart = process.env.CODEX_APP_SERVER_AUTOSTART === "1";
const authToken = process.env.AGENT_TMUX_WEB_AUTH_TOKEN ?? process.env.CODEX_WEB_AUTH_TOKEN ?? "";
const defaultCwd = process.env.CLI_WEB_DEFAULT_CWD ?? process.env.HOME ?? process.cwd();

const app = express();
const server = http.createServer(app);
const bridge = new CodexBridge({ port: codexAppServerPort });
const sockets = new Set<WebSocket>();
const recentEvents: unknown[] = [];
const jsonBodyParser = express.json({ limit: "2mb" });

app.use((req, res, next) => {
  if (req.path === "/api/uploads") {
    next();
    return;
  }
  jsonBodyParser(req, res, next);
});

app.use((req, res, next) => {
  if (!authToken || req.path === "/healthz") {
    next();
    return;
  }

  const provided = req.header("x-agent-tmux-web-token") ?? req.header("x-codex-web-token") ?? String(req.query.token ?? "");
  if (provided === authToken) {
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

app.get("/api/tmux/sessions", asyncHandler(async (_req, res) => {
  res.json({ data: await listTmuxSessions() });
}));

app.get("/api/tmux/tools", asyncHandler(async (_req, res) => {
  res.json({ data: listTmuxTools() });
}));

app.get("/api/tmux/capture", asyncHandler(async (req, res) => {
  const session = requireString(req.query.session, "session");
  const lines = typeof req.query.lines === "string" ? Number(req.query.lines) : 160;
  res.json({ session, output: await captureTmuxPane(session, lines) });
}));

app.post("/api/tmux/create", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  res.json({
    data: await createTmuxSession(
      requireString(body.name, "name"),
      stringOrNull(body.cwd)
    )
  });
}));

app.post("/api/tmux/destroy", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  res.json({
    data: await destroyTmuxSession(requireString(body.session, "session"))
  });
}));

app.post("/api/tmux/open-codex", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  await openCodexInTmux(session, {
    cwd: stringOrNull(body.cwd) ?? process.cwd(),
    model: stringOrNull(body.model)
  });
  res.json({
    ok: true,
    output: await captureTmuxPane(session, 220)
  });
}));

app.post("/api/tmux/open-tool", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  const requestedToolId = stringOrNull(body.toolId);
  const configuredTool = requestedToolId
    ? listTmuxTools().find((tool) => tool.id === requestedToolId)
    : null;
  const command = configuredTool?.command ?? requireString(body.command, "command");
  await openTmuxTool(session, { command });
  res.json({
    ok: true,
    output: await captureTmuxPane(session, 220)
  });
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
  res.json({ ok: true });
}));

app.post("/api/tmux/interrupt", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const session = requireString(body.session, "session");
  await interruptTmuxPane(session, await resolveTmuxInterruptKey(session, body.interruptKey));
  res.json({
    ok: true,
    output: await captureTmuxPane(session, 220)
  });
}));

app.post("/api/uploads", asyncHandler(async (req, res) => {
  const originalName = requireString(req.query.filename, "filename");
  const file = await saveUploadedFile(req, {
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
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"));
});

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", async (socket, req) => {
  const url = new URL(req.url ?? "/ws", `http://${req.headers.host ?? "localhost"}`);
  if (!isAuthorizedWebSocket(url)) {
    socket.close(1008, "Unauthorized");
    return;
  }

  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.send(JSON.stringify({ type: "hello", status: await getStatus() }));
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

  const size = normalizeTerminalSize(url.searchParams.get("cols"), url.searchParams.get("rows"));
  const initialWindowState = await readTmuxWindowState(session).catch(() => null);
  const preserveExistingClientSize = await hasAttachedTmuxClients(session).catch(() => false);
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

  const child = spawn("script", buildScriptArgsForTmuxAttach(session, { ignoreSize: preserveExistingClientSize }), {
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
      return;
    }

    if (message.type === "resize" && !preserveExistingClientSize) {
      const nextSize = normalizeTerminalSize(message.cols, message.rows);
      execFileAsync("tmux", buildTmuxResizeWindowArgs(session, nextSize)).catch(() => {
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
    socket.destroy();
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

function isAuthorizedWebSocket(url: URL): boolean {
  return !authToken || url.searchParams.get("token") === authToken;
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
  const [{ stdout: sizeStdout }, { stdout: optionStdout }] = await Promise.all([
    execFileAsync("tmux", buildTmuxDisplayWindowSizeArgs(session)),
    execFileAsync("tmux", buildTmuxShowWindowSizeOptionArgs(session))
  ]);
  return {
    size: parseTmuxWindowSize(sizeStdout),
    windowSizeOption: optionStdout.trim() || "latest"
  };
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
    const roots = [...new Set([resolveUploadRoot(), resolveLegacyUploadRoot()])];
    void Promise.all(roots.map((root) => cleanupExpiredUploads(root))).catch((error: unknown) => {
      console.error("Failed to clean expired uploads", error);
    });
  };

  clean();
  const timer = setInterval(clean, 60 * 60 * 1000);
  timer.unref();
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const statusCode = typeof record.statusCode === "number" ? record.statusCode : 500;
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
