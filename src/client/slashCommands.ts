export type SlashCommand = {
  name: string;
  description: string;
  detail: string;
  local: boolean;
};

export type SlashQuery = {
  start: number;
  end: number;
  query: string;
};

export type ParsedSlashCommand = {
  name: string;
  args: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/permissions", description: "Set approval and sandbox permissions", detail: "Use the attached tmux terminal for the full picker.", local: false },
  { name: "/sandbox-add-read-dir", description: "Grant sandbox read access to a directory", detail: "Windows-only in the native CLI.", local: false },
  { name: "/agent", description: "Switch the active agent thread", detail: "Use the attached terminal for subagent thread switching.", local: false },
  { name: "/apps", description: "Browse apps and insert app mentions", detail: "Use the attached terminal for the native picker.", local: false },
  { name: "/plugins", description: "Browse and manage plugins", detail: "Use the attached terminal for the native picker.", local: false },
  { name: "/clear", description: "Clear the transcript and start fresh", detail: "Clears this web thread view.", local: true },
  { name: "/compact", description: "Summarize conversation to free tokens", detail: "Use the attached terminal for native compaction.", local: false },
  { name: "/copy", description: "Copy the latest agent output", detail: "Copies the latest visible agent card when available.", local: true },
  { name: "/diff", description: "Show the current Git diff", detail: "Use the attached terminal for native diff browsing.", local: false },
  { name: "/exit", description: "Detach from the browser terminal", detail: "Stops the live tmux attachment.", local: true },
  { name: "/experimental", description: "Toggle experimental features", detail: "Use the attached terminal for the native picker.", local: false },
  { name: "/feedback", description: "Send diagnostics to CLI maintainers", detail: "Use the attached terminal for native feedback.", local: false },
  { name: "/init", description: "Generate an AGENTS.md scaffold", detail: "Use the attached terminal or ask the agent directly.", local: false },
  { name: "/logout", description: "Sign out of Codex", detail: "Use the attached terminal for authentication changes.", local: false },
  { name: "/mcp", description: "List configured MCP tools", detail: "Use the attached terminal for native MCP details.", local: false },
  { name: "/mention", description: "Attach a file to the prompt", detail: "Paste the path here or use the attached terminal picker.", local: false },
  { name: "/model", description: "Choose model and reasoning effort", detail: "Use /model <model> [effort] in the web composer.", local: true },
  { name: "/fast", description: "Toggle Fast mode", detail: "Web turns currently run with fast service tier.", local: true },
  { name: "/plan", description: "Switch to plan mode", detail: "Ask the agent for a plan in this web thread, or use native CLI Plan mode.", local: false },
  { name: "/goal", description: "Set or view an experimental goal", detail: "Use the attached terminal for native goal handling.", local: false },
  { name: "/personality", description: "Choose response style", detail: "Use the attached terminal for the native picker.", local: false },
  { name: "/ps", description: "Show background terminals", detail: "Use the attached terminal for native background terminal status.", local: false },
  { name: "/stop", description: "Stop the active turn", detail: "Interrupts the current web turn.", local: true },
  { name: "/fork", description: "Fork the current conversation", detail: "Use the attached terminal for native forking.", local: false },
  { name: "/side", description: "Start a side conversation", detail: "Use the attached terminal for native side conversations.", local: false },
  { name: "/resume", description: "Resume a saved conversation", detail: "Refreshes the recent thread list.", local: true },
  { name: "/new", description: "Start a new conversation", detail: "Starts a fresh web conversation.", local: true },
  { name: "/quit", description: "Detach from the browser terminal", detail: "Stops the live tmux attachment.", local: true },
  { name: "/review", description: "Ask the agent to review the working tree", detail: "Use the native CLI command or ask the agent directly.", local: false },
  { name: "/status", description: "Display session configuration", detail: "Shows the current web session status.", local: true },
  { name: "/debug-config", description: "Print config diagnostics", detail: "Use the attached terminal for native diagnostics.", local: false },
  { name: "/statusline", description: "Configure TUI status-line fields", detail: "Available in the attached terminal.", local: false },
  { name: "/title", description: "Configure terminal title fields", detail: "Available in the attached terminal.", local: false },
  { name: "/keymap", description: "Remap TUI keyboard shortcuts", detail: "Available in the attached terminal.", local: false }
];

export function slashQueryForMessage(message: string, selectionStart: number): SlashQuery | null {
  const beforeCursor = message.slice(0, selectionStart);
  const lineStart = Math.max(beforeCursor.lastIndexOf("\n") + 1, 0);
  const currentLine = beforeCursor.slice(lineStart);

  if (!currentLine.startsWith("/") || /\s/.test(currentLine)) {
    return null;
  }

  return {
    start: lineStart,
    end: selectionStart,
    query: currentLine.slice(1).toLowerCase()
  };
}

export function filterSlashCommands(query: string, commands = SLASH_COMMANDS): SlashCommand[] {
  const normalized = query.trim().replace(/^\//, "").toLowerCase();
  return commands
    .map((command, index) => ({ command, index, rank: rankSlashCommand(command, normalized) }))
    .filter((entry) => entry.rank !== null)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0) || left.index - right.index)
    .map((entry) => entry.command)
    .slice(0, 10);
}

function rankSlashCommand(command: SlashCommand, query: string): number | null {
  if (!query) {
    return 0;
  }

  const name = command.name.toLowerCase();
  const bareName = name.replace(/^\//, "");
  const description = command.description.toLowerCase();
  const detail = command.detail.toLowerCase();

  if (bareName === query) {
    return 0;
  }
  if (bareName.startsWith(query)) {
    return 1;
  }
  if (name.includes(query)) {
    return 2;
  }
  if (description.includes(query)) {
    return 3;
  }
  if (detail.includes(query)) {
    return 4;
  }

  return null;
}

export function replaceSlashQuery(message: string, selectionStart: number, commandName: string): { message: string; selectionStart: number } {
  const slashQuery = slashQueryForMessage(message, selectionStart);
  if (!slashQuery) {
    return { message, selectionStart };
  }

  const nextMessage = `${message.slice(0, slashQuery.start)}${commandName} ${message.slice(slashQuery.end)}`;
  return {
    message: nextMessage,
    selectionStart: slashQuery.start + commandName.length + 1
  };
}

export function parseSlashCommand(message: string): ParsedSlashCommand | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const [name, ...args] = trimmed.split(/\s+/);
  return {
    name,
    args: args.join(" ").trim()
  };
}
