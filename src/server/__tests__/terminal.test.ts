import { describe, expect, it } from "vitest";

import {
  buildScriptArgsForTmuxAttach,
  buildTmuxAttachShellCommand,
  buildTmuxDisplayWindowSizeArgs,
  buildTmuxRestoreManualSizeArgs,
  buildTmuxRestoreWindowStateCommandSequence,
  buildTmuxSetWindowSizeOptionArgs,
  buildTmuxShowWindowSizeOptionArgs,
  normalizeTerminalSize
} from "../terminal.js";

describe("browser tmux terminal helpers", () => {
  it("builds util-linux script args for attaching to tmux inside a pty", () => {
    expect(buildScriptArgsForTmuxAttach("codex-ui")).toEqual([
      "-qfec",
      "tmux attach-session -t codex-ui",
      "/dev/null"
    ]);
    expect(buildScriptArgsForTmuxAttach("codex-ui", { ignoreSize: true })).toEqual([
      "-qfec",
      "tmux attach-session -f ignore-size -t codex-ui",
      "/dev/null"
    ]);
  });

  it("shell-quotes tmux session names before embedding them in script commands", () => {
    expect(buildTmuxAttachShellCommand("codex work's")).toBe("tmux attach-session -t 'codex work'\\''s'");
    expect(buildTmuxAttachShellCommand("codex work's", { ignoreSize: true })).toBe("tmux attach-session -f ignore-size -t 'codex work'\\''s'");
  });

  it("normalizes browser terminal dimensions to a safe tmux size", () => {
    expect(normalizeTerminalSize(10, 4)).toEqual({ cols: 20, rows: 8 });
    expect(normalizeTerminalSize(999, 999)).toEqual({ cols: 240, rows: 80 });
    expect(normalizeTerminalSize(132, 36)).toEqual({ cols: 132, rows: 36 });
  });

  it("builds commands for restoring tmux window size state after detach", () => {
    expect(buildTmuxDisplayWindowSizeArgs("codex-ui")).toEqual([
      "display-message",
      "-p",
      "-t",
      "codex-ui",
      "#{window_width} #{window_height}"
    ]);
    expect(buildTmuxShowWindowSizeOptionArgs("codex-ui")).toEqual([
      "show-window-options",
      "-v",
      "-t",
      "codex-ui",
      "window-size"
    ]);
    expect(buildTmuxSetWindowSizeOptionArgs("codex-ui", "latest")).toEqual([
      "set-window-option",
      "-t",
      "codex-ui",
      "window-size",
      "latest"
    ]);
    expect(buildTmuxRestoreManualSizeArgs("codex-ui", { cols: 132, rows: 36 })).toEqual([
      "resize-window",
      "-t",
      "codex-ui",
      "-x",
      "132",
      "-y",
      "36"
    ]);
    expect(
      buildTmuxRestoreWindowStateCommandSequence("codex-ui", {
        size: { cols: 132, rows: 36 },
        windowSizeOption: "latest"
      })
    ).toEqual([
      ["resize-window", "-t", "codex-ui", "-x", "132", "-y", "36"],
      ["set-window-option", "-t", "codex-ui", "window-size", "latest"]
    ]);
  });
});
