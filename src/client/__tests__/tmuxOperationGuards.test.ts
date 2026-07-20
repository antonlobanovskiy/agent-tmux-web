import { describe, expect, it } from "vitest";

import { shouldApplyTmuxCapture, shouldApplyTmuxToolLaunch } from "../tmuxOperationGuards.js";

describe("tmux operation guards", () => {
  const currentOperation = {
    requestId: 2,
    latestRequestId: 2,
    targetSession: "agent-a",
    selectedSession: "agent-a"
  };

  it("rejects a capture for a stale session", () => {
    expect(shouldApplyTmuxCapture({
      ...currentOperation,
      selectedSession: "agent-b",
      terminalActive: false
    })).toBe(false);
  });

  it("rejects a capture for a stale request", () => {
    expect(shouldApplyTmuxCapture({
      ...currentOperation,
      latestRequestId: 3,
      terminalActive: false
    })).toBe(false);
  });

  it("rejects a capture after Raw becomes active", () => {
    expect(shouldApplyTmuxCapture({
      ...currentOperation,
      terminalActive: true
    })).toBe(false);
  });

  it("accepts the current non-Raw capture", () => {
    expect(shouldApplyTmuxCapture({
      ...currentOperation,
      terminalActive: false
    })).toBe(true);
  });

  it("rejects a CLI launch response for a stale session", () => {
    expect(shouldApplyTmuxToolLaunch({
      ...currentOperation,
      selectedSession: "agent-b"
    })).toBe(false);
  });

  it("rejects a stale CLI launch request", () => {
    expect(shouldApplyTmuxToolLaunch({
      ...currentOperation,
      latestRequestId: 3
    })).toBe(false);
  });

  it("accepts the current CLI launch response", () => {
    expect(shouldApplyTmuxToolLaunch(currentOperation)).toBe(true);
  });
});
