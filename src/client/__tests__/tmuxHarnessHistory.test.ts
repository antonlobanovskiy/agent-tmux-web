import { describe, expect, it } from "vitest";

import {
  nextTmuxHarnessFrameScrollTop,
  tmuxHarnessHistoryDirectionFromDelta
} from "../tmuxHarnessHistory.js";

describe("tmux harness history gestures", () => {
  it("maps wheel and swipe deltas to harness page directions", () => {
    expect(tmuxHarnessHistoryDirectionFromDelta(-32)).toBe("up");
    expect(tmuxHarnessHistoryDirectionFromDelta(32)).toBe("down");
    expect(tmuxHarnessHistoryDirectionFromDelta(31)).toBeNull();
  });

  it("rejects invalid deltas and thresholds", () => {
    expect(tmuxHarnessHistoryDirectionFromDelta(Number.NaN)).toBeNull();
    expect(tmuxHarnessHistoryDirectionFromDelta(100, 0)).toBeNull();
  });

  it("scrolls an oversized captured frame before paging harness history", () => {
    const frame = { clientHeight: 700, scrollHeight: 900, scrollTop: 200 };

    expect(nextTmuxHarnessFrameScrollTop(frame, -120)).toBe(80);
    expect(nextTmuxHarnessFrameScrollTop({ ...frame, scrollTop: 0 }, -120)).toBeNull();
    expect(nextTmuxHarnessFrameScrollTop(frame, 120)).toBeNull();
    expect(nextTmuxHarnessFrameScrollTop({ ...frame, scrollTop: 0 }, 120)).toBe(120);
  });
});
