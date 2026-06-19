export function shouldShowTmuxSendForm({ terminalActive }: { terminalActive: boolean }): boolean {
  return !terminalActive;
}
