import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  buildCodexTmuxCommand,
  buildOpenCodeSqliteArgs,
  buildTmuxCancelModeArgs,
  buildTmuxCreateSessionArgs,
  buildTmuxCapturePaneArgs,
  buildTmuxKillSessionArgs,
  buildTmuxInterruptKeysArgs,
  buildTmuxPaneInModeArgs,
  buildTmuxSubmitKeysArgs,
  buildTmuxToolCommand,
  chunkTmuxLiteralText,
  buildTmuxNewSessionArgs,
  detectTmuxInterruptKey,
  detectTmuxSubmitKey,
  extractOpenCodeSessionId,
  fitTmuxCaptureSizeForPane,
  tmuxSubmitDelayMs,
  normalizeTmuxSessionName,
  normalizeTmuxCaptureLines,
  normalizeTmuxToolId,
  isOpenCodeFullTuiPane,
  matchOpenCodePaneSession,
  parseTmuxPaneMetadata,
  parseOpenCodeSessionStates,
  parseTmuxSessions,
  parseTmuxTools,
  readOpenCodeTextStream,
  renderOpenCodeTextStream,
  splitDisplayLineAtColumn,
  splitOpenCodeTuiCapture,
  trimTmuxCapture
} from "../tmux.js";
import { TMUX_CAPTURE_HISTORY_LINES } from "../../shared/api.js";

const execFileAsync = promisify(execFile);

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
        attached: true,
        clientCount: 1
      },
      {
        name: "kartbite",
        windows: 3,
        created: "Sun May 10 15:10:14 2026",
        attached: false,
        clientCount: 0
      },
      {
        name: "dev:api",
        windows: 2,
        created: "Wed May 13 00:02:01 2026",
        attached: false,
        clientCount: 0
      }
    ]);
  });

  it("parses formatted session rows with activity metadata", () => {
    const output = [
      "agent-tmux-web\t1\t1779925303\t0\t1779925303\topencode\t1517\t/home/dev/codex-web\tOC | Task\twith tab",
      "radchenko-business\t2\t1780351746\t2\t1782255086\tzsh\t2001\t/home/dev"
    ].join("\n");

    expect(parseTmuxSessions(output)).toEqual([
      {
        name: "agent-tmux-web",
        windows: 1,
        created: "2026-05-27T23:41:43.000Z",
        createdAtMs: 1779925303000,
        attached: false,
        clientCount: 0,
        panePid: 1517,
        currentPath: "/home/dev/codex-web",
        activityAtMs: 1779925303000,
        currentCommand: "opencode",
        paneTitle: "OC | Task\twith tab"
      },
      {
        name: "radchenko-business",
        windows: 2,
        created: "2026-06-01T22:09:06.000Z",
        createdAtMs: 1780351746000,
        attached: true,
        clientCount: 2,
        panePid: 2001,
        currentPath: "/home/dev",
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

describe("OpenCode harness status", () => {
  it("extracts only valid explicit session ids from process arguments", () => {
    expect(extractOpenCodeSessionId(["opencode", "-s", "ses_06e992681ffewzWD1b0KC1mDa9", "--auto"]))
      .toBe("ses_06e992681ffewzWD1b0KC1mDa9");
    expect(extractOpenCodeSessionId(["opencode", "--session", "ses_abc123"])).toBe("ses_abc123");
    expect(extractOpenCodeSessionId(["opencode", "--auto"])).toBeNull();
    expect(extractOpenCodeSessionId(["opencode", "-s", "unsafe id"])).toBeNull();
  });

  it("maps native question, running, and completed states to status lights", () => {
    const states = parseOpenCodeSessionStates(JSON.stringify([
      { sessionId: "ses_choice", messageId: "msg_1", completedAt: null, choicePending: 1 },
      { sessionId: "ses_running", messageId: "msg_2", completedAt: null, choicePending: 0 },
      { sessionId: "ses_idle", messageId: "msg_3", completedAt: 123, choicePending: 0 },
      { sessionId: "ses_empty", messageId: null, completedAt: null, choicePending: 0 }
    ]));

    expect(states.get("ses_choice")).toEqual({ kind: "question", health: "amber", title: "Choice required" });
    expect(states.get("ses_running")).toEqual({ kind: "running", health: "green", title: "Running" });
    expect(states.get("ses_idle")).toEqual({ kind: "idle", health: "gray", title: "Idle" });
    expect(states.get("ses_empty")).toEqual({ kind: "idle", health: "gray", title: "Idle" });
  });

  it("matches an automatic OpenCode process only to one root session title in its directory", () => {
    const sessions = [
      { id: "ses_active", directory: "/workspace/app", title: "Improving TTY formatting across harnesses" },
      { id: "ses_other", directory: "/workspace/app", title: "Older task" },
      { id: "ses_elsewhere", directory: "/workspace/other", title: "Improving TTY formatting across harnesses" }
    ];

    expect(matchOpenCodePaneSession(sessions, "/workspace/app", "OC | Improving TTY formatting across harne..."))
      .toBe("ses_active");
    expect(matchOpenCodePaneSession(sessions, "/workspace/app", "OC | Older task")).toBe("ses_other");
    expect(matchOpenCodePaneSession(sessions, "/workspace/app", "OpenCode")).toBeNull();
    expect(matchOpenCodePaneSession([
      ...sessions,
      { id: "ses_ambiguous", directory: "/workspace/app", title: "Improving TTY formatting across harnesses again" }
    ], "/workspace/app", "OC | Improving TTY formatting across harne...")).toBeNull();
  });

  it("renders persisted user and assistant text without loading tool payloads", () => {
    expect(renderOpenCodeTextStream(JSON.stringify([
      { messageId: "msg_user", role: "user", text: "First request" },
      { messageId: "msg_assistant_1", role: "assistant", text: "Progress update" },
      { messageId: "msg_assistant_2", role: "assistant", text: "Final answer" },
      { messageId: "msg_tool", role: "assistant", text: null },
      { messageId: "msg_user_2", role: "user", text: "Follow-up" }
    ]))).toBe([
      "You",
      "",
      "First request",
      "",
      "Assistant",
      "",
      "Progress update",
      "",
      "Final answer",
      "",
      "You",
      "",
      "Follow-up"
    ].join("\n"));
    expect(renderOpenCodeTextStream("not json")).toBeNull();
    expect(renderOpenCodeTextStream(JSON.stringify([
      { messageId: "msg_code", role: "assistant", text: "  const indented = true;\nvalue  " }
    ]))).toBe("Assistant\n\n  const indented = true;\nvalue  ");
  });

  it("reads OpenCode text read-only and returns revisions, unchanged responses, and append deltas", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "agent-tmux-opencode-"));
    const databaseDirectory = path.join(dataRoot, "opencode");
    const databasePath = path.join(databaseDirectory, "opencode.db");
    const originalDataHome = process.env.XDG_DATA_HOME;
    await mkdir(databaseDirectory);
    process.env.XDG_DATA_HOME = dataRoot;

    try {
      await execFileAsync("sqlite3", [databasePath, `
        CREATE TABLE message (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          time_created INTEGER NOT NULL,
          time_updated INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE part (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          time_created INTEGER NOT NULL,
          time_updated INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        INSERT INTO message VALUES (
          'msg_user', 'ses_TestReadOnly', 1, 1, '{"role":"user"}'
        );
        INSERT INTO part VALUES (
          'prt_user', 'msg_user', 'ses_TestReadOnly', 1, 1,
          '{"type":"text","text":"First request"}'
        );
        INSERT INTO part VALUES (
          'prt_tool', 'msg_user', 'ses_TestReadOnly', 2, 2,
          '{"type":"tool","payload":"excluded"}'
        );
      `]);

      const initial = await readOpenCodeTextStream("ses_TestReadOnly");
      expect(initial).toMatchObject({
        output: "You\n\nFirst request",
        outputAppend: false,
        outputUnchanged: false
      });
      expect(initial?.revision).toMatch(/^\d+:\d+:\d+$/);

      expect(await readOpenCodeTextStream("ses_TestReadOnly", initial?.revision)).toEqual({
        output: null,
        outputAppend: false,
        outputUnchanged: true,
        revision: initial?.revision
      });

      await execFileAsync("sqlite3", [databasePath, `
        UPDATE part
        SET time_updated = 3,
            data = '{"type":"text","text":"First request\\ncontinued"}'
        WHERE id = 'prt_user';
      `]);
      const appended = await readOpenCodeTextStream("ses_TestReadOnly", initial?.revision);
      expect(appended).toMatchObject({
        output: "\ncontinued",
        outputAppend: true,
        outputUnchanged: false
      });
      expect(appended?.revision).not.toBe(initial?.revision);

      process.env.XDG_DATA_HOME = path.join(dataRoot, "missing");
      await expect(readOpenCodeTextStream("ses_MissingDatabase")).rejects.toThrow();
      await expect(access(path.join(dataRoot, "missing", "opencode", "opencode.db"))).rejects.toThrow();
    } finally {
      if (originalDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = originalDataHome;
      }
      await rm(dataRoot, { force: true, recursive: true });
    }
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

  it("gives app-created panes enough history without lowering a larger tmux setting", () => {
    expect(buildTmuxCreateSessionArgs("agent-ui", "/workspace", 2000)).toEqual([
      "set-option", "-g", "history-limit", String(TMUX_CAPTURE_HISTORY_LINES), ";",
      "new-session", "-d", "-x", "160", "-y", "40", "-s", "agent-ui", "-c", "/workspace"
    ]);
    expect(buildTmuxCreateSessionArgs("agent-ui", null, null).slice(0, 7)).toEqual([
      "start-server", ";", "set-option", "-g", "history-limit", String(TMUX_CAPTURE_HISTORY_LINES), ";"
    ]);
    expect(buildTmuxCreateSessionArgs("agent-ui", null, 10_000)).toEqual(
      buildTmuxNewSessionArgs("agent-ui")
    );
  });

  it("normalizes deep capture requests to finite bounded whole rows", () => {
    expect(normalizeTmuxCaptureLines(Number.NaN)).toBe(TMUX_CAPTURE_HISTORY_LINES);
    expect(normalizeTmuxCaptureLines(Number.POSITIVE_INFINITY)).toBe(TMUX_CAPTURE_HISTORY_LINES);
    expect(normalizeTmuxCaptureLines(-10)).toBe(20);
    expect(normalizeTmuxCaptureLines(250.9)).toBe(250);
    expect(normalizeTmuxCaptureLines(50_000)).toBe(TMUX_CAPTURE_HISTORY_LINES);
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

  it("joins soft-wrapped shell history without joining alternate-screen TUI rows", () => {
    expect(buildTmuxCapturePaneArgs("shell", 5000, true)).toEqual([
      "capture-pane", "-p", "-J", "-t", "shell", "-S", "-5000"
    ]);
    expect(buildTmuxCapturePaneArgs("harness", 5000, false)).toEqual([
      "capture-pane", "-p", "-t", "harness", "-S", "-5000"
    ]);
  });

  it("opens the OpenCode database read-only", () => {
    expect(buildOpenCodeSqliteArgs("/tmp/missing.db", "SELECT 1")).toEqual([
      "-readonly", "-json", "/tmp/missing.db", "SELECT 1"
    ]);
    expect(buildOpenCodeSqliteArgs("/tmp/missing.db", "SELECT 1", false)).toEqual([
      "-readonly", "/tmp/missing.db", "SELECT 1"
    ]);
  });

  it("recognizes wide OpenCode alternate-screen panes", () => {
    expect(parseTmuxPaneMetadata("opencode\t172\t48\t1\n")).toEqual({
      currentCommand: "opencode",
      width: 172,
      height: 48,
      alternateScreen: true
    });
    expect(isOpenCodeFullTuiPane({ currentCommand: "opencode", width: 172, height: 48, alternateScreen: true })).toBe(true);
    expect(isOpenCodeFullTuiPane({ currentCommand: "/usr/local/bin/opencode.exe", width: 172, height: 48, alternateScreen: true })).toBe(true);
    expect(isOpenCodeFullTuiPane({ currentCommand: "opencode", width: 120, height: 48, alternateScreen: true })).toBe(false);
    expect(isOpenCodeFullTuiPane({ currentCommand: "zsh", width: 172, height: 48, alternateScreen: true })).toBe(false);
    expect(() => parseTmuxPaneMetadata("opencode\twide\t48\t1")).toThrow("Invalid tmux pane metadata");
    expect(parseTmuxPaneMetadata("opencode\t172\t48\t1\t458362\t/workspace/app\tOC | Active task\n")).toEqual({
      currentCommand: "opencode",
      width: 172,
      height: 48,
      alternateScreen: true,
      panePid: 458362,
      currentPath: "/workspace/app",
      paneTitle: "OC | Active task"
    });
    expect(fitTmuxCaptureSizeForPane(
      { cols: 44, rows: 40 },
      { currentCommand: "opencode", width: 44, height: 40, alternateScreen: true }
    )).toEqual({ cols: 126, rows: 40 });
    expect(fitTmuxCaptureSizeForPane(
      { cols: 135, rows: 40 },
      { currentCommand: "opencode", width: 135, height: 40, alternateScreen: true }
    )).toEqual({ cols: 135, rows: 40 });
    expect(fitTmuxCaptureSizeForPane(
      { cols: 122, rows: 40 },
      { currentCommand: "opencode", width: 122, height: 40, alternateScreen: true }
    )).toEqual({ cols: 126, rows: 40 });
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
