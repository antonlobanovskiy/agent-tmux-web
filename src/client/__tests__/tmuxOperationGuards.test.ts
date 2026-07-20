import { describe, expect, it } from "vitest";

import {
  isCurrentTmuxCaptureOwner,
  shouldAdmitTmuxCapture,
  shouldApplyTmuxCapture,
  shouldApplyTmuxToolLaunch
} from "../tmuxOperationGuards.js";

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

  describe("capture admission", () => {
    const ordinaryCapture = {
      activeManualOwner: null,
      session: "agent-a",
      source: "poll" as const,
      terminalActive: false
    };

    it("rejects capture while Raw is active", () => {
      expect(shouldAdmitTmuxCapture({ ...ordinaryCapture, terminalActive: true })).toBe(false);
    });

    it("rejects capture without a session", () => {
      expect(shouldAdmitTmuxCapture({ ...ordinaryCapture, session: "" })).toBe(false);
    });

    it("rejects non-manual capture while a manual owner is active", () => {
      expect(shouldAdmitTmuxCapture({ ...ordinaryCapture, activeManualOwner: 4 })).toBe(false);
    });

    it("accepts capture from the matching manual owner", () => {
      expect(shouldAdmitTmuxCapture({
        ...ordinaryCapture,
        activeManualOwner: 4,
        owner: 4,
        source: "manual"
      })).toBe(true);
    });

    it("rejects capture from the wrong manual owner", () => {
      expect(shouldAdmitTmuxCapture({
        ...ordinaryCapture,
        activeManualOwner: 4,
        owner: 3,
        source: "manual"
      })).toBe(false);
    });

    it("accepts ordinary capture without a manual owner", () => {
      expect(shouldAdmitTmuxCapture(ordinaryCapture)).toBe(true);
    });
  });

  describe("manual capture owner", () => {
    it("recognizes only the active owner", () => {
      expect(isCurrentTmuxCaptureOwner({ activeManualOwner: 4, owner: 4 })).toBe(true);
      expect(isCurrentTmuxCaptureOwner({ activeManualOwner: 4, owner: 3 })).toBe(false);
      expect(isCurrentTmuxCaptureOwner({ activeManualOwner: null, owner: 4 })).toBe(false);
    });
  });
});
