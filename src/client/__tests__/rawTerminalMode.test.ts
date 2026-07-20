import { describe, expect, it } from "vitest";

import { shouldShowRawTerminalShortcuts, shouldShowTmuxJumpToLatest, shouldShowTmuxSendForm } from "../rawTerminalMode.js";

describe("raw terminal mode", () => {
  it("shows the tmux send form only with a selected non-Raw session", () => {
    expect(shouldShowTmuxSendForm({ terminalActive: false, sessionSelected: true })).toBe(true);
    expect(shouldShowTmuxSendForm({ terminalActive: true, sessionSelected: true })).toBe(false);
    expect(shouldShowTmuxSendForm({ terminalActive: false, sessionSelected: false })).toBe(false);
  });

  it("shows Raw shortcut buttons only for mobile input", () => {
    expect(shouldShowRawTerminalShortcuts({ terminalActive: true, mobileInput: true, sessionSelected: true })).toBe(true);
    expect(shouldShowRawTerminalShortcuts({ terminalActive: true, mobileInput: false, sessionSelected: true })).toBe(false);
    expect(shouldShowRawTerminalShortcuts({ terminalActive: false, mobileInput: true, sessionSelected: true })).toBe(false);
    expect(shouldShowRawTerminalShortcuts({ terminalActive: true, mobileInput: true, sessionSelected: false })).toBe(false);
  });

  it("shows jump to latest only for a selected non-Raw session away from the bottom", () => {
    expect(shouldShowTmuxJumpToLatest({ terminalActive: false, sessionSelected: true, tmuxAtBottom: false })).toBe(true);
    expect(shouldShowTmuxJumpToLatest({ terminalActive: true, sessionSelected: true, tmuxAtBottom: false })).toBe(false);
    expect(shouldShowTmuxJumpToLatest({ terminalActive: false, sessionSelected: false, tmuxAtBottom: false })).toBe(false);
    expect(shouldShowTmuxJumpToLatest({ terminalActive: false, sessionSelected: true, tmuxAtBottom: true })).toBe(false);
  });
});
