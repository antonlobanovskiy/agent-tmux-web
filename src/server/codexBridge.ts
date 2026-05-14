import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

import WebSocket from "ws";

type JsonRpcId = string | number;
type JsonRecord = Record<string, unknown>;

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
};

type ServerRequest = {
  originalId: JsonRpcId;
  message: JsonRecord;
};

export type CodexBridgeOptions = {
  port: number;
  codexBin?: string;
};

export class CodexBridge extends EventEmitter {
  private readonly port: number;
  private readonly codexBin: string;
  private child: ChildProcessWithoutNullStreams | null = null;
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();
  private serverRequests = new Map<string, ServerRequest>();
  private starting: Promise<void> | null = null;

  initialized = false;
  lastError: string | null = null;

  constructor(options: CodexBridgeOptions) {
    super();
    this.port = options.port;
    this.codexBin = options.codexBin ?? "codex";
  }

  get appServerUrl(): string {
    return `ws://127.0.0.1:${this.port}`;
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async start(): Promise<void> {
    if (this.starting) {
      return this.starting;
    }

    this.starting = this.startInternal().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async rpc(method: string, params: unknown = {}): Promise<unknown> {
    await this.start();
    return this.sendRpc(method, params);
  }

  private sendRpc(method: string, params: unknown = {}): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server websocket is not connected");
    }

    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex RPC timed out: ${method}`));
      }, 120_000);

      this.pending.set(id, { method, resolve, reject, timer });
      this.socket?.send(JSON.stringify(payload), (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  respondToServerRequest(requestId: string, result: unknown): void {
    const request = this.serverRequests.get(requestId);
    if (!request || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Unknown Codex server request: ${requestId}`);
    }

    this.serverRequests.delete(requestId);
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.originalId, result }));
  }

  private async startInternal(): Promise<void> {
    if (!this.child || this.child.exitCode !== null) {
      this.spawnAppServer();
    }

    await this.waitForReady();
    await this.connect();
  }

  private spawnAppServer(): void {
    this.child = spawn(this.codexBin, ["app-server", "--listen", this.appServerUrl], {
      cwd: process.env.HOME ?? process.cwd(),
      env: process.env
    });

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.emit("log", chunk.toString("utf8"));
    });

    this.child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.emit("log", text);
      if (/ERROR|error/i.test(text)) {
        this.lastError = text.trim();
      }
    });

    this.child.on("error", (error) => {
      this.initialized = false;
      this.lastError = `codex app-server failed to start: ${error.message}`;
      this.emit("status", { connected: false, initialized: false, lastError: this.lastError });
    });

    this.child.on("exit", (code, signal) => {
      this.initialized = false;
      this.lastError = `codex app-server exited with ${code ?? signal ?? "unknown"}`;
      this.emit("status", { connected: false, initialized: false, lastError: this.lastError });
    });
  }

  private async waitForReady(): Promise<void> {
    const readyUrl = `http://127.0.0.1:${this.port}/readyz`;
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(readyUrl);
        if (response.ok) {
          return;
        }
      } catch {
        // App-server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error(`Codex app-server did not become ready at ${readyUrl}`);
  }

  private async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN && this.initialized) {
      return;
    }

    this.socket?.terminate();
    this.socket = new WebSocket(this.appServerUrl);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to Codex app-server")), 10_000);

      this.socket?.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket?.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    this.socket.on("message", (data) => this.handleMessage(data.toString("utf8")));
    this.socket.on("close", () => {
      this.initialized = false;
      this.emit("status", { connected: false, initialized: false, lastError: this.lastError });
    });
    this.socket.on("error", (error) => {
      this.lastError = error.message;
      this.emit("status", { connected: this.connected, initialized: this.initialized, lastError: this.lastError });
    });

    await this.sendRpc("initialize", {
      clientInfo: {
        name: "agent-tmux-web",
        title: "Agent Tmux Web",
        version: "0.1.0"
      },
      capabilities: {
        experimentalApi: true
      }
    });

    this.initialized = true;
    this.emit("status", { connected: true, initialized: true, lastError: this.lastError });
  }

  private handleMessage(raw: string): void {
    let message: JsonRecord;
    try {
      message = JSON.parse(raw) as JsonRecord;
    } catch {
      this.emit("log", `Invalid app-server JSON: ${raw}`);
      return;
    }

    if ("id" in message && !("method" in message)) {
      const pending = this.pending.get(message.id as JsonRpcId);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(message.id as JsonRpcId);

      if ("error" in message) {
        pending.reject(message.error);
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if ("id" in message && "method" in message) {
      const requestId = String(message.id);
      this.serverRequests.set(requestId, { originalId: message.id as JsonRpcId, message });
      this.emit("server-request", { requestId, message });
      return;
    }

    if ("method" in message) {
      this.emit("notification", message);
    }
  }
}
