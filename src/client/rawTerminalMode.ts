export function shouldShowTmuxSendForm({ terminalActive }: { terminalActive: boolean }): boolean {
  return !terminalActive;
}

export function shouldShowRawTerminalShortcuts({
  terminalActive,
  mobileInput
}: {
  terminalActive: boolean;
  mobileInput: boolean;
}): boolean {
  return terminalActive && mobileInput;
}
