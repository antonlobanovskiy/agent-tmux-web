import { describe, expect, it } from "vitest";

import type { TmuxToolDto } from "../../shared/api.js";
import {
  createCustomTmuxTool,
  groupTmuxTools,
  parseCustomTmuxTools,
  parsePinnedTmuxToolIds,
  togglePinnedTmuxToolId
} from "../tmuxToolPreferences.js";

function tool(id: string, label: string): TmuxToolDto {
  return { id, label, command: id, defaultSessionName: id };
}

describe("tmux tool preferences", () => {
  it("sorts pinned and unpinned tools alphabetically without duplicates", () => {
    const groups = groupTmuxTools(
      [tool("opencode", "OpenCode"), tool("aider", "Aider"), tool("amp", "Amp")],
      [tool("custom:review", "Review Bot"), tool("amp", "Duplicate Amp")],
      ["custom:review", "opencode"]
    );

    expect(groups.pinned.map((entry) => entry.label)).toEqual(["OpenCode", "Review Bot"]);
    expect(groups.unpinned.map((entry) => entry.label)).toEqual(["Aider", "Amp"]);
  });

  it("parses valid custom tools and rejects malformed or duplicate entries", () => {
    const stored = JSON.stringify([
      { id: "custom:one", label: "  My Agent  ", command: "  my-agent --go  " },
      { id: "custom:one", label: "Duplicate", command: "duplicate" },
      { id: "built-in", label: "Not custom", command: "nope" },
      { id: "custom:missing", label: "Missing command" }
    ]);

    expect(parseCustomTmuxTools(stored)).toEqual([{
      id: "custom:one",
      label: "My Agent",
      command: "my-agent --go",
      defaultSessionName: "my-agent"
    }]);
    expect(parseCustomTmuxTools("not json")).toEqual([]);
  });

  it("creates safe custom tool metadata from a label and command", () => {
    expect(createCustomTmuxTool("custom:123", "  Local Review Agent  ", "  review-agent --fast  ")).toEqual({
      id: "custom:123",
      label: "Local Review Agent",
      command: "review-agent --fast",
      defaultSessionName: "local-review-agent"
    });
    expect(createCustomTmuxTool("bad", "Agent", "agent")).toBeNull();
    expect(createCustomTmuxTool("custom:empty", "", "agent")).toBeNull();
  });

  it("deduplicates stored pins and toggles a selected tool", () => {
    expect(parsePinnedTmuxToolIds(JSON.stringify(["opencode", "opencode", " aider ", 1])))
      .toEqual(["opencode", "aider"]);
    expect(togglePinnedTmuxToolId(["opencode"], "aider")).toEqual(["opencode", "aider"]);
    expect(togglePinnedTmuxToolId(["opencode", "aider"], "opencode")).toEqual(["aider"]);
  });
});
