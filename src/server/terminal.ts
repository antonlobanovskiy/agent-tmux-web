export type TerminalSize = {
  cols: number;
  rows: number;
};

export type TmuxWindowState = {
  size: TerminalSize;
  windowSizeOption: string;
};

export type TmuxAttachOptions = {
  ignoreSize?: boolean;
};

export type BrowserRawTerminalPolicy = {
  attachOptions: TmuxAttachOptions;
  resizeTmuxWindow: boolean;
};

export function buildBrowserRawTerminalPolicy(_context: { hasAttachedClients: boolean }): BrowserRawTerminalPolicy {
  return {
    attachOptions: {},
    resizeTmuxWindow: true
  };
}

export function buildScriptArgsForTmuxAttach(session: string, options: TmuxAttachOptions = {}, size?: TerminalSize): string[] {
  return ["-qfec", buildTmuxAttachShellCommand(session, options, size), "/dev/null"];
}

export function buildTmuxAttachShellCommand(session: string, options: TmuxAttachOptions = {}, size?: TerminalSize): string {
  const attachCommand = `tmux attach-session${options.ignoreSize ? " -f ignore-size" : ""} -t ${shellQuote(session)}`;
  if (!size) {
    return attachCommand;
  }
  return `stty cols ${size.cols} rows ${size.rows}; ${attachCommand}`;
}

export function buildTmuxResizeWindowArgs(session: string, size: TerminalSize): string[] {
  return [
    "resize-window",
    "-t",
    session,
    "-x",
    String(size.cols),
    "-y",
    String(size.rows)
  ];
}

export function buildTmuxCaptureSizeFromClientWidth(clientWidth: unknown): TerminalSize {
  const width = toInteger(clientWidth, 1280);
  const cols = Math.max(80, Math.floor((Math.max(320, width) - 24) / 8.15));
  return normalizeTerminalSize(cols, 40);
}

export function buildTmuxDisplayWindowSizeArgs(session: string): string[] {
  return ["display-message", "-p", "-t", session, "#{window_width} #{window_height}"];
}

export function buildTmuxShowWindowSizeOptionArgs(session: string): string[] {
  return ["show-window-options", "-v", "-t", session, "window-size"];
}

export function buildTmuxSetWindowSizeOptionArgs(session: string, option: string): string[] {
  return ["set-window-option", "-t", session, "window-size", option];
}

export function buildTmuxRestoreManualSizeArgs(session: string, size: TerminalSize): string[] {
  return buildTmuxResizeWindowArgs(session, size);
}

export function buildTmuxRestoreWindowStateCommandSequence(session: string, state: TmuxWindowState): string[][] {
  return [
    buildTmuxRestoreManualSizeArgs(session, state.size),
    buildTmuxSetWindowSizeOptionArgs(session, state.windowSizeOption)
  ];
}

export function parseTmuxWindowSize(output: string): TerminalSize {
  const [cols, rows] = output.trim().split(/\s+/).map(Number);
  return normalizeTerminalSize(cols, rows);
}

export function normalizeTerminalSize(cols: unknown, rows: unknown): TerminalSize {
  return {
    cols: clamp(toInteger(cols, 80), 20, 240),
    rows: clamp(toInteger(rows, 24), 8, 80)
  };
}

export function isSameTerminalSize(left: TerminalSize, right: TerminalSize): boolean {
  return left.cols === right.cols && left.rows === right.rows;
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}
