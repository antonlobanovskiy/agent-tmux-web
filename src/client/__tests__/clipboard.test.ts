import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClipboardText } from "../clipboard.js";

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;

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
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument
    });
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: originalHTMLElement
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

  it("restores terminal focus after the execCommand fallback", async () => {
    class FakeHTMLElement {
      isConnected = true;
      focus = vi.fn();
    }
    const focused = new FakeHTMLElement();
    const body = new FakeHTMLElement() as FakeHTMLElement & {
      appendChild: ReturnType<typeof vi.fn>;
      removeChild: ReturnType<typeof vi.fn>;
    };
    body.appendChild = vi.fn();
    body.removeChild = vi.fn();
    const textarea = {
      select: vi.fn(),
      setAttribute: vi.fn(),
      style: {},
      value: ""
    };
    const execCommand = vi.fn(() => true);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {}
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } }
    });
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: FakeHTMLElement
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        activeElement: focused,
        body,
        createElement: vi.fn(() => textarea),
        execCommand
      }
    });

    await writeClipboardText("fallback copy");

    expect(textarea.select).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
    expect(focused.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
