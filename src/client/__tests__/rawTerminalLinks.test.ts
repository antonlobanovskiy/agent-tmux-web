import { describe, expect, it, vi } from "vitest";

import { normalizeRawTerminalUrl, openRawTerminalLink } from "../rawTerminalLinks.js";

describe("raw terminal links", () => {
  it("normalizes safe web links and rejects unsafe schemes", () => {
    expect(normalizeRawTerminalUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(normalizeRawTerminalUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeRawTerminalUrl("www.example.com/help")).toBe("https://www.example.com/help");
    expect(normalizeRawTerminalUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeRawTerminalUrl("file:///tmp/private.txt")).toBeNull();
  });

  it("uses the Android bridge before browser window opening", () => {
    const openExternalLink = vi.fn(() => true);
    const openWindow = vi.fn();

    expect(openRawTerminalLink("https://example.com/docs", {
      androidBridge: { openExternalLink },
      openWindow
    })).toBe(true);
    expect(openExternalLink).toHaveBeenCalledWith("https://example.com/docs");
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("reports Android bridge rejection and failure without browser fallback", () => {
    const openWindow = vi.fn(() => null);

    expect(openRawTerminalLink("https://example.com", {
      androidBridge: { openExternalLink: () => false },
      openWindow
    })).toBe(false);
    expect(openRawTerminalLink("https://example.com", {
      androidBridge: { openExternalLink: () => { throw new Error("failed"); } },
      openWindow
    })).toBe(false);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("reports protected browser dispatch when the opener returns null", () => {
    const openWindow = vi.fn(() => null);

    expect(openRawTerminalLink("www.example.com", { openWindow })).toBe(true);
    expect(openWindow).toHaveBeenCalledWith(
      "https://www.example.com/",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("rejects unsafe links without invoking the browser opener", () => {
    const openWindow = vi.fn(() => null);

    expect(openRawTerminalLink("data:text/plain,blocked", { openWindow })).toBe(false);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("reports unavailable and throwing browser openers", () => {
    expect(openRawTerminalLink("https://example.com")).toBe(false);
    expect(openRawTerminalLink("https://example.com", {
      openWindow: () => { throw new Error("failed"); }
    })).toBe(false);
  });
});
