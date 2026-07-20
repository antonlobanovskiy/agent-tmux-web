type TmuxOperationGuard = {
  latestRequestId: number;
  requestId: number;
  selectedSession: string;
  targetSession: string;
};

export type TmuxCaptureSource = "follow" | "manual" | "poll" | "session" | "view";

type TmuxCaptureAdmission = {
  activeManualOwner: number | null;
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
  owner,
  session,
  source,
  terminalActive
}: TmuxCaptureAdmission): boolean {
  if (!session || terminalActive) {
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
