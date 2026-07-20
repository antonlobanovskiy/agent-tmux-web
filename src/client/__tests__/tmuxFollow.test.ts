import { describe, expect, it } from "vitest";

import {
  shouldAutoCaptureTmux,
  TMUX_CAPTURE_POLL_INTERVAL_MS,
  TMUX_SEND_FOLLOW_DELAYS_MS
} from "../tmuxFollow.js";

describe("tmux follow behavior", () => {
  it("polls captured tmux output only when a capture pane is visible", () => {
    expect(shouldAutoCaptureTmux({ selectedTmux: "codex", terminalActive: false, documentHidden: false, manualCaptureInFlight: false })).toBe(true);
    expect(shouldAutoCaptureTmux({ selectedTmux: "", terminalActive: false, documentHidden: false, manualCaptureInFlight: false })).toBe(false);
    expect(shouldAutoCaptureTmux({ selectedTmux: "codex", terminalActive: true, documentHidden: false, manualCaptureInFlight: false })).toBe(false);
    expect(shouldAutoCaptureTmux({ selectedTmux: "codex", terminalActive: false, documentHidden: true, manualCaptureInFlight: false })).toBe(false);
    expect(shouldAutoCaptureTmux({ selectedTmux: "codex", terminalActive: false, documentHidden: false, manualCaptureInFlight: true })).toBe(false);
  });

  it("uses frequent follow-up captures after sending input", () => {
    expect(TMUX_CAPTURE_POLL_INTERVAL_MS).toBeLessThanOrEqual(1500);
    expect(TMUX_SEND_FOLLOW_DELAYS_MS[0]).toBeLessThanOrEqual(300);
    expect(TMUX_SEND_FOLLOW_DELAYS_MS.at(-1)).toBeGreaterThanOrEqual(5000);
  });
});
