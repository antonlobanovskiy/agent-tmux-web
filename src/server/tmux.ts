import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { TmuxToolDto } from "../shared/api.js";

const execFileAsync = promisify(execFile);

export type TmuxSession = {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
};

export type CodexTmuxCommandOptions = {
  cwd: string;
  model?: string | null;
};

export type TmuxToolConfig = TmuxToolDto;

export type TmuxSubmitKey = "enter" | "codex-enter" | "tab";
export type TmuxInterruptKey = "escape" | "ctrl-c";

const DEFAULT_TMUX_TOOLS: TmuxToolConfig[] = [
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    defaultSessionName: "codex",
    modes: [
      {
        id: "yolo",
        label: "Yolo",
        args: "--yolo"
      }
    ]
  },
  {
    id: "claude",
    label: "Claude",
    command: "claude",
    defaultSessionName: "claude"
  }
];

export function normalizeTmuxSessionName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "codex";
}

export function normalizeTmuxToolId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function parseTmuxToolModes(value: unknown): NonNullable<TmuxToolConfig["modes"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const args = typeof record.args === "string" ? record.args.trim() : "";
    if (!args) {
      return [];
    }
    const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : `Mode ${index + 1}`;
    const id = normalizeTmuxToolId(typeof record.id === "string" ? record.id : label) || `mode-${index + 1}`;
    return [{
      id,
      label,
      args,
      ...(record.defaultEnabled === true ? { defaultEnabled: true } : {})
    }];
  });
}

export function parseTmuxTools(value: string | undefined = process.env.CLI_WEB_TOOLS): TmuxToolConfig[] {
  if (!value?.trim()) {
    return DEFAULT_TMUX_TOOLS;
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("CLI_WEB_TOOLS must be a JSON array");
  }

  const tools = parsed.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const command = typeof record.command === "string" ? record.command.trim() : "";
    if (!command) {
      return [];
    }
    const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : `Tool ${index + 1}`;
    const id = normalizeTmuxToolId(typeof record.id === "string" ? record.id : label) || `tool-${index + 1}`;
    const defaultSessionName = normalizeTmuxSessionName(
      typeof record.defaultSessionName === "string" && record.defaultSessionName.trim()
        ? record.defaultSessionName
        : id
    );
    const modes = parseTmuxToolModes(record.modes);
    return [{ id, label, command, defaultSessionName, ...(modes.length > 0 ? { modes } : {}) }];
  });

  if (tools.length === 0) {
    throw new Error("CLI_WEB_TOOLS did not contain any usable tools");
  }

  return tools;
}

export function listTmuxTools(): TmuxToolConfig[] {
  return parseTmuxTools();
}

export function buildTmuxNewSessionArgs(name: string, cwd?: string | null): string[] {
  const args = ["new-session", "-d", "-s", normalizeTmuxSessionName(name)];
  if (cwd) {
    args.push("-c", cwd);
  }
  return args;
}

export function buildTmuxKillSessionArgs(session: string): string[] {
  return ["kill-session", "-t", session];
}

export function buildTmuxPaneInModeArgs(session: string): string[] {
  return ["display-message", "-p", "-t", session, "#{pane_in_mode}"];
}

export function buildTmuxCancelModeArgs(session: string): string[] {
  return ["send-keys", "-t", session, "-X", "cancel"];
}

export function buildTmuxSubmitKeysArgs(session: string, submitKey: TmuxSubmitKey = "enter"): string[] {
  return ["send-keys", "-t", session, submitKey === "tab" ? "Tab" : "Enter"];
}

export function buildTmuxInterruptKeysArgs(session: string, interruptKey: TmuxInterruptKey): string[] {
  return ["send-keys", "-t", session, interruptKey === "escape" ? "Escape" : "C-c"];
}

export function detectTmuxSubmitKey(output: string): TmuxSubmitKey {
  return isCodexTmuxOutput(output) ? "codex-enter" : "enter";
}

export function detectTmuxInterruptKey(output: string): TmuxInterruptKey {
  return isCodexTmuxOutput(output) ? "escape" : "ctrl-c";
}

export function tmuxSubmitDelayMs(submitKey: TmuxSubmitKey, text: string): number {
  return text.length > 0 ? 350 : 0;
}

export function buildCodexTmuxCommand(_options: CodexTmuxCommandOptions): string {
  return "codex";
}

export function buildTmuxToolCommand(tool: Pick<TmuxToolConfig, "command" | "modes">, modeIds: string[] = []): string {
  const modeIdSet = new Set(modeIds.map(normalizeTmuxToolId).filter(Boolean));
  const args = tool.modes
    ?.filter((mode) => modeIdSet.has(mode.id))
    .map((mode) => mode.args.trim())
    .filter(Boolean) ?? [];
  return [tool.command.trim(), ...args].filter(Boolean).join(" ");
}

export function parseTmuxSessions(output: string): TmuxSession[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(.+):\s+(\d+)\s+windows?\s+\(created\s+(.+?)\)(?:\s+\(attached\))?$/);
      if (!match) {
        return [];
      }

      return [
        {
          name: match[1],
          windows: Number(match[2]),
          created: match[3],
          attached: line.includes("(attached)")
        }
      ];
    });
}

export async function createTmuxSession(name: string, cwd?: string | null): Promise<TmuxSession[]> {
  await execFileAsync("tmux", buildTmuxNewSessionArgs(name, cwd));
  return listTmuxSessions();
}

export async function destroyTmuxSession(session: string): Promise<TmuxSession[]> {
  await execFileAsync("tmux", buildTmuxKillSessionArgs(session));
  return listTmuxSessions();
}

export async function listTmuxSessions(): Promise<TmuxSession[]> {
  try {
    const { stdout } = await execFileAsync("tmux", ["list-sessions"]);
    return parseTmuxSessions(stdout);
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String(error.stderr) : "";
    if (stderr.includes("no server running")) {
      return [];
    }
    throw error;
  }
}

export async function openCodexInTmux(session: string, options: CodexTmuxCommandOptions): Promise<void> {
  await sendTmuxText(session, buildCodexTmuxCommand(options), true);
}

export async function openTmuxTool(session: string, tool: Pick<TmuxToolConfig, "command" | "modes">, modeIds: string[] = []): Promise<void> {
  await sendTmuxText(session, buildTmuxToolCommand(tool, modeIds), true);
}

export async function captureTmuxPane(session: string, lines = 1000): Promise<string> {
  const safeLines = Math.max(20, Math.min(lines, 5000));
  const { stdout } = await execFileAsync("tmux", [
    "capture-pane",
    "-p",
    "-t",
    session,
    "-S",
    `-${safeLines}`
  ]);
  return stdout;
}

export async function sendTmuxText(session: string, text: string, enter: boolean, submitKey: TmuxSubmitKey = "enter"): Promise<void> {
  await exitTmuxModeIfNeeded(session);

  if (text.length > 0) {
    await execFileAsync("tmux", ["send-keys", "-t", session, "-l", text]);
  }

  if (enter) {
    const delayMs = tmuxSubmitDelayMs(submitKey, text);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await execFileAsync("tmux", buildTmuxSubmitKeysArgs(session, submitKey));
  }
}

export async function interruptTmuxPane(session: string, interruptKey: TmuxInterruptKey): Promise<void> {
  await exitTmuxModeIfNeeded(session);
  await execFileAsync("tmux", buildTmuxInterruptKeysArgs(session, interruptKey));
}

async function exitTmuxModeIfNeeded(session: string): Promise<void> {
  const { stdout } = await execFileAsync("tmux", buildTmuxPaneInModeArgs(session));
  if (stdout.trim() !== "1") {
    return;
  }

  try {
    await execFileAsync("tmux", buildTmuxCancelModeArgs(session));
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String(error.stderr) : "";
    if (!stderr.includes("not in a mode") && !stderr.includes("not in mode")) {
      throw error;
    }
  }
}

function isCodexTmuxOutput(output: string): boolean {
  const normalized = output.toLowerCase();
  return normalized.includes("openai codex")
    || normalized.includes("use /skills to list available skills")
    || /gpt-[\w.-]+.*\/model to change/.test(normalized);
}
