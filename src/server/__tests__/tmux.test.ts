import { describe, expect, it } from "vitest";

import {
  buildCodexTmuxCommand,
  buildTmuxCancelModeArgs,
  buildTmuxKillSessionArgs,
  buildTmuxInterruptKeysArgs,
  buildTmuxPaneInModeArgs,
  buildTmuxSubmitKeysArgs,
  buildTmuxToolCommand,
  chunkTmuxLiteralText,
  buildTmuxNewSessionArgs,
  detectTmuxInterruptKey,
  detectTmuxSubmitKey,
  fitTmuxCaptureSizeForPane,
  tmuxSubmitDelayMs,
  normalizeTmuxSessionName,
  normalizeTmuxToolId,
  isOpenCodeFullTuiPane,
  parseTmuxPaneMetadata,
  parseTmuxSessions,
  parseTmuxTools,
  splitDisplayLineAtColumn,
  splitOpenCodeTuiCapture,
  trimTmuxCapture
} from "../tmux.js";

describe("parseTmuxSessions", () => {
  it("parses session names, window counts, timestamps, and attached state", () => {
    const output = [
      "chat-interface: 1 windows (created Tue May 12 20:10:22 2026) (attached)",
      "kartbite: 3 windows (created Sun May 10 15:10:14 2026)",
      "dev:api: 2 windows (created Wed May 13 00:02:01 2026)"
    ].join("\n");

    expect(parseTmuxSessions(output)).toEqual([
      {
        name: "chat-interface",
        windows: 1,
        created: "Tue May 12 20:10:22 2026",
        attached: true
      },
      {
        name: "kartbite",
        windows: 3,
        created: "Sun May 10 15:10:14 2026",
        attached: false
      },
      {
        name: "dev:api",
        windows: 2,
        created: "Wed May 13 00:02:01 2026",
        attached: false
      }
    ]);
  });

  it("parses formatted session rows with activity metadata", () => {
    const output = [
      "agent-tmux-web\t1\t1779925303\t0\t1779925303\tnode",
      "radchenko-business\t2\t1780351746\t1\t1782255086\tzsh"
    ].join("\n");

    expect(parseTmuxSessions(output)).toEqual([
      {
        name: "agent-tmux-web",
        windows: 1,
        created: "2026-05-27T23:41:43.000Z",
        createdAtMs: 1779925303000,
        attached: false,
        activityAtMs: 1779925303000,
        currentCommand: "node"
      },
      {
        name: "radchenko-business",
        windows: 2,
        created: "2026-06-01T22:09:06.000Z",
        createdAtMs: 1780351746000,
        attached: true,
        activityAtMs: 1782255086000,
        currentCommand: "zsh"
      }
    ]);
  });

  it("returns an empty list for no server output", () => {
    expect(parseTmuxSessions("no server running on /tmp/tmux-1000/default")).toEqual([]);
    expect(parseTmuxSessions("")).toEqual([]);
  });
});

describe("tmux command builders", () => {
  it("normalizes user-entered session names for tmux", () => {
    expect(normalizeTmuxSessionName("Kartbite Coding!")).toBe("kartbite-coding");
    expect(normalizeTmuxSessionName("")).toBe("codex");
  });

  it("normalizes configured CLI tool ids", () => {
    expect(normalizeTmuxToolId("Claude Code!")).toBe("claude-code");
    expect(normalizeTmuxToolId("")).toBe("");
  });

  it("builds detached session args with an optional working directory", () => {
    expect(buildTmuxNewSessionArgs("agent-ui", "/workspace/agent-tmux-web")).toEqual([
      "new-session",
      "-d",
      "-x",
      "160",
      "-y",
      "40",
      "-s",
      "agent-ui",
      "-c",
      "/workspace/agent-tmux-web"
    ]);
  });

  it("provides generic default agent CLI launchers", () => {
    const tools = parseTmuxTools(undefined);
    expect(tools.map((tool) => tool.id)).toEqual([
      "opencode",
      "codex",
      "claude",
      "gemini",
      "copilot",
      "cursor",
      "qwen",
      "cline",
      "aider",
      "goose",
      "amp"
    ]);
    expect(tools.find((tool) => tool.id === "codex")?.modes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "auto", args: "--sandbox workspace-write --ask-for-approval on-request" }),
      expect.objectContaining({ id: "yolo", args: "--dangerously-bypass-approvals-and-sandbox", dangerous: true })
    ]));
    expect(tools.find((tool) => tool.id === "opencode")?.modes?.map((mode) => mode.id)).toEqual(["default", "auto"]);
    expect(tools.find((tool) => tool.id === "claude")?.label).toBe("Claude Code");
    expect(tools.find((tool) => tool.id === "cline")?.command).toBe("cline --tui");
    expect(tools.find((tool) => tool.id === "goose")?.command).toBe("goose session");
  });

  it("parses configured generic tmux tools from JSON", () => {
    expect(parseTmuxTools(JSON.stringify([
      { label: "Gemini CLI", command: "gemini", defaultSessionName: "gemini work" },
      {
        id: "claude-plan",
        label: "Claude Plan",
        command: "claude",
        modes: [{
          label: "Plan",
          args: "--permission-mode plan",
          defaultEnabled: true,
          exclusiveGroup: "Permission Mode",
          description: "Read-only planning",
          dangerous: true
        }]
      }
    ]))).toEqual([
      {
        id: "gemini-cli",
        label: "Gemini CLI",
        command: "gemini",
        defaultSessionName: "gemini-work"
      },
      {
        id: "claude-plan",
        label: "Claude Plan",
        command: "claude",
        defaultSessionName: "claude-plan",
        modes: [
          {
            id: "plan",
            label: "Plan",
            args: "--permission-mode plan",
            defaultEnabled: true,
            exclusiveGroup: "permission-mode",
            description: "Read-only planning",
            dangerous: true
          }
        ]
      }
    ]);
  });

  it("keeps empty-argument default choices for custom mode groups", () => {
    expect(parseTmuxTools(JSON.stringify([{
      id: "custom-agent",
      label: "Custom Agent",
      command: "custom-agent",
      modes: [{
        id: "default",
        label: "Default",
        args: "",
        defaultEnabled: true,
        exclusiveGroup: "permissions"
      }]
    }]))[0]?.modes).toEqual([{
      id: "default",
      label: "Default",
      args: "",
      defaultEnabled: true,
      exclusiveGroup: "permissions"
    }]);
  });

  it("builds a plain Codex command for opening inside tmux", () => {
    expect(
      buildCodexTmuxCommand({
        cwd: "/workspace/project",
        model: "gpt-5.5"
      })
    ).toBe("codex");
  });

  it("builds a generic CLI tool command for opening inside tmux", () => {
    expect(buildTmuxToolCommand({ command: "claude" })).toBe("claude");
    expect(buildTmuxToolCommand({ command: "gemini --sandbox" })).toBe("gemini --sandbox");
    expect(buildTmuxToolCommand({
      command: "opencode",
      modes: [{ id: "auto", label: "Auto", args: "--auto", defaultEnabled: true }]
    })).toBe("opencode --auto");
    expect(buildTmuxToolCommand({
      command: "opencode",
      modes: [{ id: "auto", label: "Auto", args: "--auto", defaultEnabled: true }]
    }, ["auto"])).toBe("opencode --auto");
    expect(buildTmuxToolCommand({
      command: "opencode",
      modes: [{ id: "auto", label: "Auto", args: "--auto", defaultEnabled: true }]
    }, [])).toBe("opencode");
    expect(buildTmuxToolCommand({
      command: "codex",
      modes: [{ id: "yolo", label: "Yolo", args: "--yolo" }]
    }, ["yolo"])).toBe("codex --yolo");
    expect(buildTmuxToolCommand({
      command: "codex",
      modes: [
        { id: "default", label: "Default", args: "", defaultEnabled: true, exclusiveGroup: "permissions" },
        { id: "auto", label: "Auto", args: "--full-auto", exclusiveGroup: "permissions" },
        { id: "yolo", label: "Yolo", args: "--yolo", exclusiveGroup: "permissions" }
      ]
    }, ["auto", "yolo"])).toBe("codex --yolo");
  });

  it("builds kill-session args for destroying a tmux session", () => {
    expect(buildTmuxKillSessionArgs("codex-ui")).toEqual(["kill-session", "-t", "codex-ui"]);
  });

  it("builds pane mode detection and cancel args", () => {
    expect(buildTmuxPaneInModeArgs("codex-ui")).toEqual(["display-message", "-p", "-t", "codex-ui", "#{pane_in_mode}"]);
    expect(buildTmuxCancelModeArgs("codex-ui")).toEqual(["send-keys", "-t", "codex-ui", "-X", "cancel"]);
  });

  it("submits tmux input with the named Enter key", () => {
    expect(buildTmuxSubmitKeysArgs("codex-ui")).toEqual(["send-keys", "-t", "codex-ui", "Enter"]);
    expect(buildTmuxSubmitKeysArgs("codex-ui", "tab")).toEqual(["send-keys", "-t", "codex-ui", "Tab"]);
    expect(buildTmuxSubmitKeysArgs("codex-ui", "codex-enter")).toEqual(["send-keys", "-t", "codex-ui", "Enter"]);
  });

  it("submits Codex TUI panes with a delayed Enter", () => {
    expect(detectTmuxSubmitKey("│ >_ OpenAI Codex (v0.130.0) │\n› Use /skills to list available skills")).toBe("codex-enter");
    expect(detectTmuxSubmitKey("developer in ~/work/project\n❯")).toBe("enter");
  });

  it("detects the right interrupt key for Codex and shell panes", () => {
    expect(detectTmuxInterruptKey("│ >_ OpenAI Codex (v0.130.0) │\n• Working (1s • esc to interrupt)")).toBe("escape");
    expect(detectTmuxInterruptKey("sleep 30\n")).toBe("ctrl-c");
    expect(buildTmuxInterruptKeysArgs("codex-ui", "escape")).toEqual(["send-keys", "-t", "codex-ui", "Escape"]);
    expect(buildTmuxInterruptKeysArgs("codex-ui", "ctrl-c")).toEqual(["send-keys", "-t", "codex-ui", "C-c"]);
  });

  it("delays tmux submission so panes process pasted text before Enter", () => {
    expect(tmuxSubmitDelayMs("tab", "Test")).toBeGreaterThanOrEqual(250);
    expect(tmuxSubmitDelayMs("codex-enter", "Test")).toBeGreaterThanOrEqual(250);
    expect(tmuxSubmitDelayMs("enter", "printf ok")).toBeGreaterThanOrEqual(250);
    expect(tmuxSubmitDelayMs("codex-enter", "")).toBe(0);
    expect(tmuxSubmitDelayMs("enter", "")).toBe(0);
  });

  it("chunks large tmux literal sends without splitting surrogate pairs", () => {
    const chunks = chunkTmuxLiteralText(`abcd🙂efgh`, 5);

    expect(chunks).toEqual(["abcd", "🙂efg", "h"]);
    expect(chunkTmuxLiteralText("abcdef", 3)).toEqual(["abc", "def"]);
    expect(() => chunkTmuxLiteralText("abc", 0)).toThrow("maxChunkLength");
  });

  it("removes terminal-only blank rows without changing captured history", () => {
    expect(trimTmuxCapture("first\nsecond\n   \n\n")).toBe("first\nsecond");
    expect(trimTmuxCapture("prompt $ ")).toBe("prompt $");
    expect(trimTmuxCapture("\n \t\n")).toBe("");
  });

  it("recognizes wide OpenCode alternate-screen panes", () => {
    expect(parseTmuxPaneMetadata("opencode\t172\t48\t1\n")).toEqual({
      currentCommand: "opencode",
      width: 172,
      height: 48,
      alternateScreen: true
    });
    expect(isOpenCodeFullTuiPane({ currentCommand: "opencode", width: 172, height: 48, alternateScreen: true })).toBe(true);
    expect(isOpenCodeFullTuiPane({ currentCommand: "opencode", width: 120, height: 48, alternateScreen: true })).toBe(false);
    expect(isOpenCodeFullTuiPane({ currentCommand: "zsh", width: 172, height: 48, alternateScreen: true })).toBe(false);
    expect(() => parseTmuxPaneMetadata("opencode\twide\t48\t1")).toThrow("Invalid tmux pane metadata");
    expect(fitTmuxCaptureSizeForPane(
      { cols: 44, rows: 40 },
      { currentCommand: "opencode", width: 44, height: 40, alternateScreen: true }
    )).toEqual({ cols: 44, rows: 40 });
    expect(fitTmuxCaptureSizeForPane(
      { cols: 135, rows: 40 },
      { currentCommand: "opencode", width: 135, height: 40, alternateScreen: true }
    )).toEqual({ cols: 150, rows: 40 });
    expect(fitTmuxCaptureSizeForPane(
      { cols: 44, rows: 40 },
      { currentCommand: "opencode", width: 44, height: 40, alternateScreen: false }
    )).toEqual({ cols: 44, rows: 40 });
  });

  it("splits display columns without breaking wide glyphs", () => {
    expect(splitDisplayLineAtColumn("ab界cd", 4)).toEqual(["ab界", "cd"]);
    expect(splitDisplayLineAtColumn("terminal", 4)).toEqual(["term", "inal"]);
  });

  it("extracts OpenCode's fixed-width sidebar from a full TUI capture", () => {
    const mainWidth = 88;
    const row = (main: string, sidebar: string) => `${main.padEnd(mainWidth)}${sidebar}`;
    const capture = [
      row("Reply with exactly OK.", "Session title"),
      row("OK", "Context"),
      row("", "25,467 tokens"),
      row("Build auto", "MCP"),
      row("", "• OpenCode 1.18.3")
    ].join("\n");

    expect(splitOpenCodeTuiCapture(capture, 130)).toEqual({
      output: "Reply with exactly OK.\nOK\n\nBuild auto",
      sidebar: {
        kind: "opencode",
        output: "Session title\nContext\n25,467 tokens\nMCP\n• OpenCode 1.18.3"
      }
    });
    expect(splitOpenCodeTuiCapture(row("terminal only", "not a sidebar"), 130)).toBeNull();
  });

  it("splits only visible OpenCode rows and preserves historical scrollback", () => {
    const mainWidth = 88;
    const row = (main: string, sidebar: string) => `${main.padEnd(mainWidth)}${sidebar}`;
    const history = "historical output that must remain intact even when it is wider than the current main pane";
    const capture = [
      history,
      row("current reply", "Session title"),
      row("", "Context"),
      row("Build auto", "25,467 tokens"),
      row("", "• OpenCode 1.18.3")
    ].join("\n");

    expect(splitOpenCodeTuiCapture(capture, 130, 4)).toEqual({
      output: `${history}\ncurrent reply\n\nBuild auto`,
      sidebar: {
        kind: "opencode",
        output: "Session title\nContext\n25,467 tokens\n• OpenCode 1.18.3"
      }
    });
  });
});
