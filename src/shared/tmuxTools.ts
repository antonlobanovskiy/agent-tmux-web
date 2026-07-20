import type { TmuxToolDto, TmuxToolModeDto } from "./api.js";

const PERMISSION_MODE_GROUP = "permissions";
const INTERFACE_MODE_GROUP = "interface";

function permissionMode(
  id: string,
  label: string,
  args: string,
  options: Pick<TmuxToolModeDto, "defaultEnabled" | "description" | "dangerous"> = {}
): TmuxToolModeDto {
  return {
    id,
    label,
    args,
    exclusiveGroup: PERMISSION_MODE_GROUP,
    ...options
  };
}

export const DEFAULT_TMUX_TOOLS: TmuxToolDto[] = [
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    defaultSessionName: "opencode",
    modes: [
      {
        id: "full-tui",
        label: "Full UI",
        args: "",
        defaultEnabled: true,
        exclusiveGroup: INTERFACE_MODE_GROUP,
        description: "Keep OpenCode's full terminal UI available for direct interaction in Raw view."
      },
      {
        id: "mini-ui",
        label: "Linear TTY",
        args: "--mini --replay-limit 100",
        exclusiveGroup: INTERFACE_MODE_GROUP,
        description: "Use OpenCode's linear transcript with native tmux scrollback."
      },
      permissionMode("default", "Default", "", {
        description: "Use OpenCode's configured permission rules."
      }),
      permissionMode("auto", "Auto", "--auto", {
        defaultEnabled: true,
        description: "Auto-approve permission requests that are not explicitly denied.",
        dangerous: true
      })
    ]
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    defaultSessionName: "codex",
    modes: [
      permissionMode("default", "Default", "", {
        defaultEnabled: true,
        description: "Use the configured Codex sandbox and approval policy."
      }),
      permissionMode("auto", "Auto", "--sandbox workspace-write --ask-for-approval on-request", {
        description: "Allow workspace edits and commands, asking when Codex needs broader access."
      }),
      permissionMode("yolo", "Yolo", "--dangerously-bypass-approvals-and-sandbox", {
        description: "Bypass approvals and the Codex sandbox. Use only inside an external sandbox.",
        dangerous: true
      })
    ]
  },
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    defaultSessionName: "claude",
    modes: [
      permissionMode("default", "Default", "", {
        defaultEnabled: true,
        description: "Use Claude Code's configured permission mode."
      }),
      permissionMode("plan", "Plan", "--permission-mode plan", {
        description: "Start in read-only planning mode."
      }),
      permissionMode("accept-edits", "Accept edits", "--permission-mode acceptEdits", {
        description: "Automatically accept file edits while retaining other permission checks."
      }),
      permissionMode("auto", "Auto", "--permission-mode auto", {
        description: "Use Claude Code's automatic permission classifier."
      }),
      permissionMode("yolo", "Yolo", "--dangerously-skip-permissions", {
        description: "Bypass all Claude Code permission checks.",
        dangerous: true
      })
    ]
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    command: "gemini",
    defaultSessionName: "gemini",
    modes: [
      permissionMode("default", "Default", "", {
        defaultEnabled: true,
        description: "Prompt for approval according to Gemini CLI policy."
      }),
      permissionMode("plan", "Plan", "--approval-mode plan", {
        description: "Use read-only tool access for planning."
      }),
      permissionMode("auto-edit", "Auto edit", "--approval-mode auto_edit", {
        description: "Automatically approve edits while prompting for other tools."
      }),
      permissionMode("yolo", "Yolo", "--approval-mode yolo", {
        description: "Automatically approve every Gemini CLI tool call.",
        dangerous: true
      })
    ]
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    command: "copilot",
    defaultSessionName: "copilot",
    modes: [
      permissionMode("default", "Default", "", {
        defaultEnabled: true,
        description: "Use Copilot CLI's normal approval prompts and path checks."
      }),
      permissionMode("auto-tools", "Auto tools", "--allow-all-tools", {
        description: "Allow all tools without prompts while retaining path and URL checks.",
        dangerous: true
      }),
      permissionMode("yolo", "Yolo", "--yolo", {
        description: "Allow all tools, paths, and URLs without approval.",
        dangerous: true
      }),
      {
        id: "autopilot",
        label: "Autopilot",
        args: "--autopilot",
        description: "Continue working autonomously after the initial prompt."
      }
    ]
  },
  {
    id: "cursor",
    label: "Cursor Agent",
    command: "agent",
    defaultSessionName: "cursor",
    modes: [
      permissionMode("default", "Default", "", {
        defaultEnabled: true,
        description: "Ask before running terminal commands."
      }),
      permissionMode("force", "Auto commands", "--force", {
        description: "Allow commands automatically unless explicitly denied.",
        dangerous: true
      })
    ]
  },
  {
    id: "qwen",
    label: "Qwen Code",
    command: "qwen",
    defaultSessionName: "qwen",
    modes: [
      permissionMode("default", "Default", "", {
        defaultEnabled: true,
        description: "Use Qwen Code's configured approval mode."
      }),
      permissionMode("plan", "Plan", "--approval-mode plan", {
        description: "Use read-only analysis and planning tools."
      }),
      permissionMode("auto-edit", "Auto edit", "--approval-mode auto-edit", {
        description: "Automatically approve edits while prompting for other tools."
      }),
      permissionMode("auto", "Auto", "--approval-mode auto", {
        description: "Let Qwen Code's classifier approve safe actions and block risky ones."
      }),
      permissionMode("yolo", "Yolo", "--approval-mode yolo", {
        description: "Automatically approve every tool call without enabling a sandbox.",
        dangerous: true
      })
    ]
  },
  {
    id: "cline",
    label: "Cline",
    command: "cline --tui",
    defaultSessionName: "cline",
    modes: [
      permissionMode("auto", "Auto", "", {
        defaultEnabled: true,
        description: "Use Cline CLI's default auto-approval behavior.",
        dangerous: true
      }),
      permissionMode("ask", "Ask", "--auto-approve false", {
        description: "Require approval before Cline uses tools."
      })
    ]
  },
  {
    id: "aider",
    label: "Aider",
    command: "aider",
    defaultSessionName: "aider",
    modes: [
      permissionMode("default", "Default", "", {
        defaultEnabled: true,
        description: "Ask for confirmation when Aider requires it."
      }),
      permissionMode("yes", "Always yes", "--yes-always", {
        description: "Answer yes to every Aider confirmation.",
        dangerous: true
      })
    ]
  },
  {
    id: "goose",
    label: "goose",
    command: "goose session",
    defaultSessionName: "goose"
  },
  {
    id: "amp",
    label: "Amp",
    command: "amp",
    defaultSessionName: "amp"
  }
];

export function defaultTmuxToolModeIds(tool: TmuxToolDto): string[] {
  return tool.modes?.filter((mode) => mode.defaultEnabled).map((mode) => mode.id) ?? [];
}

export function toggleTmuxToolModeId(tool: TmuxToolDto, selectedModeIds: string[], modeId: string): string[] {
  const mode = tool.modes?.find((entry) => entry.id === modeId);
  if (!mode) {
    return selectedModeIds;
  }
  if (mode.exclusiveGroup) {
    const otherGroupIds = new Set(
      tool.modes
        ?.filter((entry) => entry.exclusiveGroup === mode.exclusiveGroup)
        .map((entry) => entry.id) ?? []
    );
    return [...selectedModeIds.filter((entry) => !otherGroupIds.has(entry)), mode.id];
  }
  return selectedModeIds.includes(mode.id)
    ? selectedModeIds.filter((entry) => entry !== mode.id)
    : [...selectedModeIds, mode.id];
}

export function resolveTmuxToolModeIds(tool: Pick<TmuxToolDto, "modes">, modeIds?: string[]): string[] {
  const requestedModeIds = modeIds ?? tool.modes?.filter((mode) => mode.defaultEnabled).map((mode) => mode.id) ?? [];
  const modesById = new Map(tool.modes?.map((mode) => [mode.id, mode]) ?? []);
  const selectedIds = new Set<string>();
  const selectedGroups = new Map<string, string>();

  for (const modeId of requestedModeIds) {
    const mode = modesById.get(modeId);
    if (!mode) {
      continue;
    }
    if (mode.exclusiveGroup) {
      selectedGroups.set(mode.exclusiveGroup, mode.id);
    } else {
      selectedIds.add(mode.id);
    }
  }

  return tool.modes
    ?.filter((mode) => selectedIds.has(mode.id) || (mode.exclusiveGroup && selectedGroups.get(mode.exclusiveGroup) === mode.id))
    .map((mode) => mode.id) ?? [];
}

export function buildTmuxToolCommand(tool: Pick<TmuxToolDto, "command" | "modes">, modeIds?: string[]): string {
  const selectedModeIds = new Set(resolveTmuxToolModeIds(tool, modeIds));
  const args = tool.modes
    ?.filter((mode) => selectedModeIds.has(mode.id))
    .map((mode) => mode.args.trim())
    .filter(Boolean) ?? [];
  return [tool.command.trim(), ...args].filter(Boolean).join(" ");
}
