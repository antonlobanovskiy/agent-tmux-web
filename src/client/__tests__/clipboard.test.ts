import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClipboardText } from "../clipboard.js";

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;

describe("writeClipboardText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  });

  it("uses the Android bridge before browser clipboard APIs", async () => {
    const writeClipboard = vi.fn(() => true);
    const writeText = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { AgentTmuxAndroid: { writeClipboard } }
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } }
    });

    await writeClipboardText("clean mobile draft");

    expect(writeClipboard).toHaveBeenCalledWith("clean mobile draft");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the browser clipboard when the Android bridge is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {}
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } }
    });

    await writeClipboardText("browser copy");

    expect(writeText).toHaveBeenCalledWith("browser copy");
  });
});
