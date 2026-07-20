import { describe, expect, it } from "vitest";

import { shouldShowRawTerminalShortcuts, shouldShowTmuxSendForm } from "../rawTerminalMode.js";

describe("raw terminal mode", () => {
  it("hides the tmux send form while Raw input is active", () => {
    expect(shouldShowTmuxSendForm({ terminalActive: true })).toBe(false);
  });

  it("shows Raw shortcut buttons only for mobile input", () => {
    expect(shouldShowRawTerminalShortcuts({ terminalActive: true, mobileInput: true, sessionSelected: true })).toBe(true);
    expect(shouldShowRawTerminalShortcuts({ terminalActive: true, mobileInput: false, sessionSelected: true })).toBe(false);
    expect(shouldShowRawTerminalShortcuts({ terminalActive: false, mobileInput: true, sessionSelected: true })).toBe(false);
    expect(shouldShowRawTerminalShortcuts({ terminalActive: true, mobileInput: true, sessionSelected: false })).toBe(false);
  });
});
