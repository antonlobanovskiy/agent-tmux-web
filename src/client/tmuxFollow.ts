export const TMUX_CAPTURE_POLL_INTERVAL_MS = 1000;
export const TMUX_SEND_FOLLOW_DELAYS_MS = [150, 700, 1600, 3200, 6500];

export type TmuxFollowState = {
  selectedTmux: string;
  terminalActive: boolean;
  documentHidden: boolean;
  manualCaptureInFlight: boolean;
};

export function shouldAutoCaptureTmux({ selectedTmux, terminalActive, documentHidden, manualCaptureInFlight }: TmuxFollowState): boolean {
  return Boolean(selectedTmux) && !terminalActive && !documentHidden && !manualCaptureInFlight;
}
