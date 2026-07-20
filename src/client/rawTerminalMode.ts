export function shouldShowTmuxSendForm({ terminalActive }: { terminalActive: boolean }): boolean {
  return !terminalActive;
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
