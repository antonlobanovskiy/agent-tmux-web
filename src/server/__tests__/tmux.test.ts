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
  tmuxSubmitDelayMs,
  normalizeTmuxSessionName,
  normalizeTmuxToolId,
  parseTmuxSessions,
  parseTmuxTools
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
    expect(parseTmuxTools(undefined)).toEqual([
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
    ]);
  });

  it("parses configured generic tmux tools from JSON", () => {
    expect(parseTmuxTools(JSON.stringify([
      { label: "Gemini CLI", command: "gemini", defaultSessionName: "gemini work" },
      { id: "claude-plan", label: "Claude Plan", command: "claude", modes: [{ label: "Plan", args: "--permission-mode plan", defaultEnabled: true }] }
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
            defaultEnabled: true
          }
        ]
      }
    ]);
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
      command: "codex",
      modes: [{ id: "yolo", label: "Yolo", args: "--yolo" }]
    }, ["yolo"])).toBe("codex --yolo");
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
});
