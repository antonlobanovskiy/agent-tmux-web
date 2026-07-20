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

  it("opens browser links in a protected new tab", () => {
    const openWindow = vi.fn(() => ({}) as WindowProxy);

    expect(openRawTerminalLink("www.example.com", { openWindow })).toBe(true);
    expect(openWindow).toHaveBeenCalledWith(
      "https://www.example.com/",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("reports blocked and unsafe links without navigating", () => {
    expect(openRawTerminalLink("https://example.com", { openWindow: () => null })).toBe(false);
    expect(openRawTerminalLink("data:text/plain,secret", { openWindow: vi.fn() })).toBe(false);
  });
});
