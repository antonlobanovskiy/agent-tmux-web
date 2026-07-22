export type RawTerminalTapContext = {
  baseY: number;
  cursorY: number;
  pageY?: number;
  rows: number;
  screenHeight: number;
  screenPageTop: number;
  viewportY: number;
};

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
