export type RawTerminalTapContext = {
  baseY: number;
  cursorY: number;
  pageY?: number;
  rows: number;
  screenHeight: number;
  screenPageTop: number;
  viewportY: number;
};

type RawTerminalKeyEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export function rawTerminalExtendedKeySequence(event: RawTerminalKeyEvent): string | null {
  const modifiedEnter = event.key === "Enter" && event.shiftKey;
  const modifiedApplicationChord = event.key.length === 1
    && event.ctrlKey
    && event.shiftKey
    && !isRawTerminalClipboardKey(event);
  if (!modifiedEnter && !modifiedApplicationChord) {
    return null;
  }

  const keyCode = event.key === "Enter" ? 13 : event.key.codePointAt(0);
  if (keyCode === undefined) {
    return null;
  }
  const modifiers = 1
    + (event.shiftKey ? 1 : 0)
    + (event.altKey ? 2 : 0)
    + (event.ctrlKey ? 4 : 0)
    + (event.metaKey ? 8 : 0);
  return `\x1b[${keyCode};${modifiers}u`;
}

export function shouldProcessRawTerminalKeyEvent(event: RawTerminalKeyEvent): boolean {
  const key = event.key.toLowerCase();
  const browserPaste = key === "v" && (event.ctrlKey || event.metaKey);
  const browserCopy = key === "c" && (event.metaKey || (event.ctrlKey && event.shiftKey));
  if (browserPaste || browserCopy) {
    return false;
  }

  if (event.key === "Insert" && ((event.ctrlKey && !event.shiftKey) || (event.shiftKey && !event.ctrlKey))) {
    return false;
  }

  return true;
}

function isRawTerminalClipboardKey(event: RawTerminalKeyEvent): boolean {
  const key = event.key.toLowerCase();
  return key === "c" || key === "v";
}

export function shouldFocusRawTerminalTap({
  baseY,
  cursorY,
  pageY,
  rows,
  screenHeight,
  screenPageTop,
  viewportY
}: RawTerminalTapContext): boolean {
  if (![baseY, cursorY, pageY, rows, screenHeight, screenPageTop, viewportY].every(Number.isFinite)) {
    return false;
  }
  if (!Number.isInteger(rows) || rows <= 0 || screenHeight <= 0) {
    return false;
  }
  if (!Number.isInteger(cursorY) || cursorY < 0 || cursorY >= rows || viewportY !== baseY) {
    return false;
  }

  const screenBottom = screenPageTop + screenHeight;
  if (!Number.isFinite(screenBottom) || pageY! < screenPageTop || pageY! >= screenBottom) {
    return false;
  }

  const row = Math.floor((pageY! - screenPageTop) / (screenHeight / rows));
  return row === cursorY;
}

export function shouldShowTmuxSendForm({
  terminalActive,
  sessionSelected
}: {
  terminalActive: boolean;
  sessionSelected: boolean;
}): boolean {
  return sessionSelected && !terminalActive;
}

export function shouldShowRawTerminalShortcuts({
  terminalActive,
  mobileInput,
  sessionSelected
}: {
  terminalActive: boolean;
  mobileInput: boolean;
  sessionSelected: boolean;
}): boolean {
  return terminalActive && mobileInput && sessionSelected;
}

export function shouldShowTmuxJumpToLatest({
  terminalActive,
  sessionSelected,
  tmuxAtBottom
}: {
  terminalActive: boolean;
  sessionSelected: boolean;
  tmuxAtBottom: boolean;
}): boolean {
  return sessionSelected && !terminalActive && !tmuxAtBottom;
}
