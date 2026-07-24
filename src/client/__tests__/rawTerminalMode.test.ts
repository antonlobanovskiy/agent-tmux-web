import { describe, expect, it } from "vitest";

import {
  rawTerminalExtendedKeySequence,
  shouldFocusRawTerminalTap,
  shouldProcessRawTerminalKeyEvent,
  shouldShowRawTerminalShortcuts,
  shouldShowTmuxJumpToLatest,
  shouldShowTmuxSendForm
} from "../rawTerminalMode.js";

const cursorTap = {
  baseY: 12,
  cursorY: 3,
  pageY: 170,
  rows: 4,
  screenHeight: 80,
  screenPageTop: 100,
  viewportY: 12
};

describe("raw terminal mode", () => {
  it("keeps terminal-emulator clipboard shortcuts in the browser", () => {
    const keyEvent = {
      altKey: false,
      ctrlKey: false,
      key: "v",
      metaKey: false,
      shiftKey: false
    };

    expect(shouldProcessRawTerminalKeyEvent({ ...keyEvent, ctrlKey: true })).toBe(false);
    expect(shouldProcessRawTerminalKeyEvent({ ...keyEvent, ctrlKey: true, shiftKey: true })).toBe(false);
    expect(shouldProcessRawTerminalKeyEvent({ ...keyEvent, key: "c", ctrlKey: true, shiftKey: true })).toBe(false);
    expect(shouldProcessRawTerminalKeyEvent({ ...keyEvent, metaKey: true })).toBe(false);
    expect(shouldProcessRawTerminalKeyEvent({ ...keyEvent, key: "c", metaKey: true })).toBe(false);
    expect(shouldProcessRawTerminalKeyEvent({ ...keyEvent, key: "Insert", shiftKey: true })).toBe(false);
    expect(shouldProcessRawTerminalKeyEvent({ ...keyEvent, key: "Insert", ctrlKey: true })).toBe(false);
  });

  it("passes application shortcuts and modified keys through xterm", () => {
    const keyEvent = {
      altKey: false,
      ctrlKey: false,
      key: "Enter",
      metaKey: false,
      shiftKey: true
    };

    expect(shouldProcessRawTerminalKeyEvent(keyEvent)).toBe(true);
    expect(shouldProcessRawTerminalKeyEvent({ ...keyEvent, key: "c", ctrlKey: true, shiftKey: false })).toBe(true);
  });

  it("encodes modified Enter and Ctrl+Shift application chords for tmux", () => {
    const keyEvent = {
      altKey: false,
      ctrlKey: false,
      key: "Enter",
      metaKey: false,
      shiftKey: true
    };

    expect(rawTerminalExtendedKeySequence(keyEvent)).toBe("\x1b[13;2u");
    expect(rawTerminalExtendedKeySequence({ ...keyEvent, ctrlKey: true })).toBe("\x1b[13;6u");
    expect(rawTerminalExtendedKeySequence({ ...keyEvent, key: "P", ctrlKey: true })).toBe("\x1b[80;6u");
    expect(rawTerminalExtendedKeySequence({ ...keyEvent, key: "v", ctrlKey: true })).toBeNull();
    expect(rawTerminalExtendedKeySequence({ ...keyEvent, key: "ArrowUp" })).toBeNull();
  });

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

describe("Raw terminal touch focus", () => {
  it("accepts only a tap in the visible cursor row", () => {
    expect(shouldFocusRawTerminalTap(cursorTap)).toBe(true);
    expect(shouldFocusRawTerminalTap({ ...cursorTap, pageY: 150 })).toBe(false);
    expect(shouldFocusRawTerminalTap({ ...cursorTap, cursorY: 1 })).toBe(false);
  });

  it("rejects cursor-row coordinates while the cursor page is below scrollback", () => {
    expect(shouldFocusRawTerminalTap({ ...cursorTap, viewportY: 8 })).toBe(false);
  });

  it("uses half-open row and screen boundaries", () => {
    expect(shouldFocusRawTerminalTap({ ...cursorTap, pageY: 160 })).toBe(true);
    expect(shouldFocusRawTerminalTap({ ...cursorTap, pageY: 159.999 })).toBe(false);
    expect(shouldFocusRawTerminalTap({ ...cursorTap, pageY: 180 })).toBe(false);
  });

  it.each([
    { pageY: undefined },
    { pageY: Number.NaN },
    { rows: 0 },
    { rows: 2.5 },
    { screenHeight: 0 },
    { screenHeight: Number.POSITIVE_INFINITY },
    { screenPageTop: Number.NaN },
    { cursorY: -1 },
    { cursorY: 4 }
  ])("fails closed for invalid tap state %#", (patch) => {
    expect(shouldFocusRawTerminalTap({ ...cursorTap, ...patch })).toBe(false);
  });
});
