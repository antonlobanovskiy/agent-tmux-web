import { describe, expect, it } from "vitest";

import {
  buildTmuxToolCommand,
  DEFAULT_TMUX_TOOLS,
  defaultTmuxToolModeIds,
  resolveTmuxToolModeIds,
  toggleTmuxToolModeId
} from "../tmuxTools.js";

function tool(id: string) {
  const found = DEFAULT_TMUX_TOOLS.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Missing default tmux tool: ${id}`);
  }
  return found;
}

describe("default tmux tools", () => {
  it("builds current permission commands for the major harnesses", () => {
    expect(buildTmuxToolCommand(tool("opencode"))).toBe("opencode --auto");
    expect(buildTmuxToolCommand(tool("codex"), ["auto"]))
      .toBe("codex --sandbox workspace-write --ask-for-approval on-request");
    expect(buildTmuxToolCommand(tool("codex"), ["yolo"]))
      .toBe("codex --dangerously-bypass-approvals-and-sandbox");
    expect(buildTmuxToolCommand(tool("claude"), ["accept-edits"]))
      .toBe("claude --permission-mode acceptEdits");
    expect(buildTmuxToolCommand(tool("gemini"), ["auto-edit"]))
      .toBe("gemini --approval-mode auto_edit");
    expect(buildTmuxToolCommand(tool("qwen"), ["auto"]))
      .toBe("qwen --approval-mode auto");
    expect(buildTmuxToolCommand(tool("cursor"), ["force"]))
      .toBe("agent --force");
    expect(buildTmuxToolCommand(tool("aider"), ["yes"]))
      .toBe("aider --yes-always");
  });

  it("allows Copilot autopilot to combine with one permission preset", () => {
    expect(buildTmuxToolCommand(tool("copilot"), ["autopilot", "yolo"]))
      .toBe("copilot --yolo --autopilot");
  });

  it("keeps only the last requested mode in an exclusive group", () => {
    expect(resolveTmuxToolModeIds(tool("claude"), ["plan", "auto", "yolo"]))
      .toEqual(["yolo"]);
  });

  it("replaces grouped modes while toggling independent modes", () => {
    expect(toggleTmuxToolModeId(tool("codex"), ["default"], "auto")).toEqual(["auto"]);
    expect(toggleTmuxToolModeId(tool("copilot"), ["default"], "autopilot")).toEqual(["default", "autopilot"]);
    expect(toggleTmuxToolModeId(tool("copilot"), ["default", "autopilot"], "autopilot")).toEqual(["default"]);
  });

  it("defines at most one default per exclusive group", () => {
    for (const entry of DEFAULT_TMUX_TOOLS) {
      const defaults = defaultTmuxToolModeIds(entry);
      const groups = entry.modes
        ?.filter((mode) => defaults.includes(mode.id) && mode.exclusiveGroup)
        .map((mode) => mode.exclusiveGroup) ?? [];
      expect(new Set(groups).size, entry.id).toBe(groups.length);
    }
  });
});
