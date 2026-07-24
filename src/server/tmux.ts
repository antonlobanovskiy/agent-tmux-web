import { execFile } from "node:child_process";
import { promisify } from "node:util";
import stringWidth from "string-width";

import type { TmuxToolDto } from "../shared/api.js";
import { buildTmuxToolCommand, DEFAULT_TMUX_TOOLS } from "../shared/tmuxTools.js";
import type { TerminalSize } from "./terminal.js";

export { buildTmuxToolCommand } from "../shared/tmuxTools.js";

const execFileAsync = promisify(execFile);

export type TmuxSession = {
  name: string;
  windows: number;
  created: string;
  createdAtMs?: number;
  attached: boolean;
  activityAtMs?: number;
  currentCommand?: string;
};

export type CodexTmuxCommandOptions = {
  cwd: string;
  model?: string | null;
};

export type TmuxToolConfig = TmuxToolDto;

export type TmuxPaneMetadata = {
  currentCommand: string;
  width: number;
  height: number;
  alternateScreen: boolean;
};

export type TmuxPaneCapture = {
  output: string;
  sidebar?: {
    kind: "opencode";
    output: string;
  };
};

export const MIN_OPENCODE_TUI_CAPTURE_COLS = 150;

export type TmuxSubmitKey = "enter" | "codex-enter" | "tab";
export type TmuxInterruptKey = "escape" | "ctrl-c";

const DEFAULT_DETACHED_TMUX_COLS = 160;
const DEFAULT_DETACHED_TMUX_ROWS = 40;
export const TMUX_LITERAL_SEND_CHUNK_SIZE = 16_000;

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
    if (typeof record.args !== "string") {
      return [];
    }
    const args = record.args.trim();
    const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : `Mode ${index + 1}`;
    const id = normalizeTmuxToolId(typeof record.id === "string" ? record.id : label) || `mode-${index + 1}`;
    const exclusiveGroup = normalizeTmuxToolId(typeof record.exclusiveGroup === "string" ? record.exclusiveGroup : "");
    const description = typeof record.description === "string" ? record.description.trim() : "";
    return [{
      id,
      label,
      args,
      ...(record.defaultEnabled === true ? { defaultEnabled: true } : {}),
      ...(exclusiveGroup ? { exclusiveGroup } : {}),
      ...(description ? { description } : {}),
      ...(record.dangerous === true ? { dangerous: true } : {})
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
  const args = [
    "new-session",
    "-d",
    "-x",
    String(DEFAULT_DETACHED_TMUX_COLS),
    "-y",
    String(DEFAULT_DETACHED_TMUX_ROWS),
    "-s",
    normalizeTmuxSessionName(name)
  ];
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

export function chunkTmuxLiteralText(text: string, maxChunkLength = TMUX_LITERAL_SEND_CHUNK_SIZE): string[] {
  if (maxChunkLength < 1) {
    throw new Error("maxChunkLength must be at least 1");
  }

  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    let end = Math.min(index + maxChunkLength, text.length);
    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) {
      end -= 1;
    }
    if (end <= index) {
      end = Math.min(index + maxChunkLength, text.length);
    }
    chunks.push(text.slice(index, end));
    index = end;
  }
  return chunks;
}

export function buildCodexTmuxCommand(_options: CodexTmuxCommandOptions): string {
  return "codex";
}

export function parseTmuxSessions(output: string): TmuxSession[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const formatted = parseFormattedTmuxSession(line);
      if (formatted) {
        return [formatted];
      }

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

function parseFormattedTmuxSession(line: string): TmuxSession | null {
  const parts = line.split("\t");
  if (parts.length < 6) {
    return null;
  }
  const [name, windows, created, attached, activity, currentCommand] = parts;
  const windowCount = Number(windows);
  const createdAtMs = unixSecondsToMs(created);
  const activityAtMs = unixSecondsToMs(activity);
  if (!name || !Number.isFinite(windowCount) || !createdAtMs) {
    return null;
  }

  return {
    name,
    windows: windowCount,
    created: new Date(createdAtMs).toISOString(),
    createdAtMs,
    attached: attached === "1",
    ...(activityAtMs ? { activityAtMs } : {}),
    ...(currentCommand ? { currentCommand } : {})
  };
}

function unixSecondsToMs(value: string): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
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
    const { stdout } = await execFileAsync("tmux", [
      "list-sessions",
      "-F",
      "#{session_name}\t#{session_windows}\t#{session_created}\t#{session_attached}\t#{window_activity}\t#{pane_current_command}"
    ]);
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

export async function openTmuxTool(session: string, tool: Pick<TmuxToolConfig, "command" | "modes">, modeIds?: string[]): Promise<void> {
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
  return trimTmuxCapture(stdout);
}

export async function captureTmuxPaneView(session: string, lines = 1000): Promise<TmuxPaneCapture> {
  const [output, metadata] = await Promise.all([
    captureTmuxPane(session, lines),
    inspectTmuxPane(session).catch(() => null)
  ]);

  if (!metadata || !isOpenCodeFullTuiPane(metadata)) {
    return { output };
  }

  return splitOpenCodeTuiCapture(output, metadata.width, metadata.height) ?? { output };
}

export async function inspectTmuxPane(session: string): Promise<TmuxPaneMetadata> {
  const { stdout } = await execFileAsync("tmux", [
    "display-message",
    "-p",
    "-t",
    session,
    "#{pane_current_command}\t#{pane_width}\t#{pane_height}\t#{alternate_on}"
  ]);
  return parseTmuxPaneMetadata(stdout);
}

export function parseTmuxPaneMetadata(output: string): TmuxPaneMetadata {
  const [currentCommand = "", widthValue = "", heightValue = "", alternateValue = ""] = output.trim().split("\t");
  const width = Number(widthValue);
  const height = Number(heightValue);
  if (!currentCommand || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || !/^[01]$/.test(alternateValue)) {
    throw new Error("Invalid tmux pane metadata");
  }
  return {
    currentCommand,
    width,
    height,
    alternateScreen: alternateValue === "1"
  };
}

export function isOpenCodeFullTuiPane(metadata: TmuxPaneMetadata): boolean {
  return isOpenCodeTuiPane(metadata) && metadata.width > 120;
}

export function isOpenCodeTuiPane(metadata: TmuxPaneMetadata): boolean {
  return metadata.alternateScreen && /(?:^|[/\\])opencode(?:\.exe)?$/i.test(metadata.currentCommand);
}

export function fitTmuxCaptureSizeForPane(size: TerminalSize, metadata: TmuxPaneMetadata | null): TerminalSize {
  if (!metadata || !isOpenCodeTuiPane(metadata) || size.cols <= 120) {
    return size;
  }
  return {
    ...size,
    cols: Math.max(size.cols, MIN_OPENCODE_TUI_CAPTURE_COLS)
  };
}

export function splitOpenCodeTuiCapture(output: string, paneWidth: number, paneHeight?: number): TmuxPaneCapture | null {
  const sidebarWidth = 42;
  if (!Number.isInteger(paneWidth) || paneWidth <= 120 || paneWidth <= sidebarWidth) {
    return null;
  }

  const splitColumn = paneWidth - sidebarWidth;
  const mainLines: string[] = [];
  const sidebarLines: string[] = [];
  const lines = output.split(/\r?\n/);
  const visibleStart = paneHeight ? Math.max(0, lines.length - paneHeight) : 0;
  for (const [index, line] of lines.entries()) {
    if (index < visibleStart) {
      mainLines.push(line.trimEnd());
      continue;
    }
    const [main, sidebar] = splitDisplayLineAtColumn(line, splitColumn);
    mainLines.push(main.trimEnd());
    sidebarLines.push(sidebar.trimEnd());
  }

  const sidebar = trimBlankCaptureRows(sidebarLines.join("\n"));
  if (!/\bContext\b/u.test(sidebar) || !/\bOpenCode\s+\d/u.test(sidebar)) {
    return null;
  }

  return {
    output: trimTmuxCapture(mainLines.join("\n")),
    sidebar: {
      kind: "opencode",
      output: sidebar
    }
  };
}

export function splitDisplayLineAtColumn(line: string, splitColumn: number): [string, string] {
  if (splitColumn <= 0) {
    return ["", line];
  }

  let column = 0;
  let main = "";
  let sidebar = "";
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line);
  for (const { segment } of segments) {
    const width = stringWidth(segment);
    if (column >= splitColumn) {
      sidebar += segment;
    } else {
      main += segment;
    }
    column += width;
  }
  return [main, sidebar];
}

export function trimBlankCaptureRows(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^(?:[\t ]*\n)+/u, "")
    .replace(/[\t\n ]+$/u, "");
}

export function trimTmuxCapture(output: string): string {
  return output.replace(/[\t\r\n ]+$/u, "");
}

export async function sendTmuxText(session: string, text: string, enter: boolean, submitKey: TmuxSubmitKey = "enter"): Promise<void> {
  await exitTmuxModeIfNeeded(session);

  if (text.length > 0) {
    for (const chunk of chunkTmuxLiteralText(text)) {
      await execFileAsync("tmux", ["send-keys", "-t", session, "-l", chunk]);
    }
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

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isCodexTmuxOutput(output: string): boolean {
  const normalized = output.toLowerCase();
  return normalized.includes("openai codex")
    || normalized.includes("use /skills to list available skills")
    || /gpt-[\w.-]+.*\/model to change/.test(normalized);
}
