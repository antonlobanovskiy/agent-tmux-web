import { describe, expect, it, vi } from "vitest";

import {
  installRawTerminalGestureGuard,
  shouldBlockRawTerminalGesture
} from "../rawTerminalGestureGuard.js";

describe("Raw terminal gesture guard", () => {
  it("blocks only gestures with non-finite coordinates", () => {
    expect(shouldBlockRawTerminalGesture({ clientX: 12, clientY: 24, pageX: 12, pageY: 24 })).toBe(false);
    expect(shouldBlockRawTerminalGesture({ clientX: undefined, clientY: 24, pageX: 12, pageY: 24 })).toBe(true);
    expect(shouldBlockRawTerminalGesture({ clientX: Number.NaN, clientY: 24, pageX: 12, pageY: 24 })).toBe(true);
  });

  it("registers in capture phase, blocks invalid inertia, and removes exactly", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const node = { addEventListener, removeEventListener };
    const cleanup = installRawTerminalGestureGuard(node);
    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    const stopImmediatePropagation = vi.fn();

    listener({
      clientX: undefined,
      clientY: undefined,
      pageX: undefined,
      pageY: undefined,
      stopImmediatePropagation
    } as unknown as Event);
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();

    cleanup();
    expect(addEventListener).toHaveBeenCalledWith("-xterm-gesturechange", listener, true);
    expect(removeEventListener).toHaveBeenCalledWith("-xterm-gesturechange", listener, true);
  });
});
