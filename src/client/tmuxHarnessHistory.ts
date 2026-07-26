export type TmuxHarnessHistoryDirection = "up" | "down";

export const TMUX_HARNESS_HISTORY_GESTURE_THRESHOLD_PX = 32;

type TmuxHarnessFrame = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

export function tmuxHarnessHistoryDirectionFromDelta(
  delta: number,
  threshold = TMUX_HARNESS_HISTORY_GESTURE_THRESHOLD_PX
): TmuxHarnessHistoryDirection | null {
  if (!Number.isFinite(delta) || !Number.isFinite(threshold) || threshold <= 0 || Math.abs(delta) < threshold) {
    return null;
  }
  return delta > 0 ? "down" : "up";
}

export function nextTmuxHarnessFrameScrollTop(frame: TmuxHarnessFrame, delta: number): number | null {
  if (![frame.clientHeight, frame.scrollHeight, frame.scrollTop, delta].every(Number.isFinite)) {
    return null;
  }
  const maxScrollTop = Math.max(0, frame.scrollHeight - frame.clientHeight);
  const nextScrollTop = Math.min(maxScrollTop, Math.max(0, frame.scrollTop + delta));
  return nextScrollTop === frame.scrollTop ? null : nextScrollTop;
}
