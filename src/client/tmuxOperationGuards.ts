type TmuxOperationGuard = {
  latestRequestId: number;
  requestId: number;
  selectedSession: string;
  targetSession: string;
};

export function shouldApplyTmuxToolLaunch({
  latestRequestId,
  requestId,
  selectedSession,
  targetSession
}: TmuxOperationGuard): boolean {
  return requestId === latestRequestId && selectedSession === targetSession;
}

export function shouldApplyTmuxCapture({
  terminalActive,
  ...operation
}: TmuxOperationGuard & { terminalActive: boolean }): boolean {
  return !terminalActive && shouldApplyTmuxToolLaunch(operation);
}
