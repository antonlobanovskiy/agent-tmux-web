type TmuxOperationGuard = {
  latestRequestId: number;
  requestId: number;
  selectedSession: string;
  targetSession: string;
};

export type TmuxCaptureSource = "follow" | "manual" | "poll" | "session" | "view";

type TmuxCaptureAdmission = {
  activeManualOwner: number | null;
  historySession: string;
  owner?: number;
  session: string;
  source: TmuxCaptureSource;
  terminalActive: boolean;
};

export function isCurrentTmuxCaptureOwner({
  activeManualOwner,
  owner
}: {
  activeManualOwner: number | null;
  owner: number;
}): boolean {
  return activeManualOwner !== null && activeManualOwner === owner;
}

export function shouldAdmitTmuxCapture({
  activeManualOwner,
  historySession,
  owner,
  session,
  source,
  terminalActive
}: TmuxCaptureAdmission): boolean {
  if (!session || terminalActive) {
    return false;
  }
  if (historySession === session) {
    return false;
  }
  if (source === "manual") {
    return owner !== undefined && isCurrentTmuxCaptureOwner({ activeManualOwner, owner });
  }
  return activeManualOwner === null;
}

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

export function shouldApplyTmuxPrefetch({
  currentEpoch,
  requestEpoch,
  selectedSession,
  targetSession,
  terminalActive
}: {
  currentEpoch: number;
  requestEpoch: number;
  selectedSession: string;
  targetSession: string;
  terminalActive: boolean;
}): boolean {
  return terminalActive && currentEpoch === requestEpoch && selectedSession === targetSession;
}
