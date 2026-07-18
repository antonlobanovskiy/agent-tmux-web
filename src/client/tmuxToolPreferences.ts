import type { TmuxToolDto } from "../shared/api.js";

export const CUSTOM_TMUX_TOOLS_STORAGE_KEY = "agent-tmux-web.custom-tools";
export const PINNED_TMUX_TOOLS_STORAGE_KEY = "agent-tmux-web.pinned-tools";

export type TmuxToolGroups = {
  pinned: TmuxToolDto[];
  unpinned: TmuxToolDto[];
};

const MAX_CUSTOM_TOOLS = 100;
const MAX_LABEL_LENGTH = 80;
const MAX_COMMAND_LENGTH = 2_000;

export function parseCustomTmuxTools(serialized: string | null): TmuxToolDto[] {
  const parsed = parseStoredArray(serialized);
  const tools: TmuxToolDto[] = [];
  const ids = new Set<string>();

  for (const value of parsed) {
    if (!isRecord(value)) {
      continue;
    }
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const label = typeof value.label === "string" ? value.label.trim().slice(0, MAX_LABEL_LENGTH) : "";
    const command = typeof value.command === "string" ? value.command.trim().slice(0, MAX_COMMAND_LENGTH) : "";
    if (!id.startsWith("custom:") || !label || !command || ids.has(id)) {
      continue;
    }
    ids.add(id);
    tools.push({
      id,
      label,
      command,
      defaultSessionName: normalizeSessionName(value.defaultSessionName, label)
    });
    if (tools.length >= MAX_CUSTOM_TOOLS) {
      break;
    }
  }

  return tools;
}

export function parsePinnedTmuxToolIds(serialized: string | null): string[] {
  const parsed = parseStoredArray(serialized);
  return [...new Set(parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))];
}

export function createCustomTmuxTool(id: string, label: string, command: string): TmuxToolDto | null {
  const normalizedId = id.trim();
  const normalizedLabel = label.trim().slice(0, MAX_LABEL_LENGTH);
  const normalizedCommand = command.trim().slice(0, MAX_COMMAND_LENGTH);
  if (!normalizedId.startsWith("custom:") || !normalizedLabel || !normalizedCommand) {
    return null;
  }
  return {
    id: normalizedId,
    label: normalizedLabel,
    command: normalizedCommand,
    defaultSessionName: normalizeSessionName(null, normalizedLabel)
  };
}

export function groupTmuxTools(
  configuredTools: TmuxToolDto[],
  customTools: TmuxToolDto[],
  pinnedToolIds: string[]
): TmuxToolGroups {
  const toolsById = new Map<string, TmuxToolDto>();
  for (const tool of [...configuredTools, ...customTools]) {
    if (!toolsById.has(tool.id)) {
      toolsById.set(tool.id, tool);
    }
  }

  const pinnedIds = new Set(pinnedToolIds);
  const tools = [...toolsById.values()].sort(compareTools);
  return {
    pinned: tools.filter((tool) => pinnedIds.has(tool.id)),
    unpinned: tools.filter((tool) => !pinnedIds.has(tool.id))
  };
}

export function togglePinnedTmuxToolId(pinnedToolIds: string[], toolId: string): string[] {
  return pinnedToolIds.includes(toolId)
    ? pinnedToolIds.filter((id) => id !== toolId)
    : [...pinnedToolIds, toolId];
}

function parseStoredArray(serialized: string | null): unknown[] {
  if (!serialized) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(serialized);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function compareTools(left: TmuxToolDto, right: TmuxToolDto): number {
  const labelComparison = left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  return labelComparison || left.id.localeCompare(right.id);
}

function normalizeSessionName(value: unknown, label: string): string {
  const provided = typeof value === "string" ? value.trim() : "";
  const normalized = (provided || label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "agent";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
