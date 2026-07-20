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
