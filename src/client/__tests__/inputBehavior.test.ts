import { describe, expect, it } from "vitest";

import {
  applyTextareaPaste,
  isMobileInputDevice,
  shouldSubmitTextareaEnter
} from "../inputBehavior.js";

describe("input behavior", () => {
  it("splices large pasted text at the active textarea selection", () => {
    const pastedText = "x".repeat(120_000);
    const result = applyTextareaPaste("hello world", 6, 11, pastedText);

    expect(result.value).toBe(`hello ${pastedText}`);
    expect(result.selectionStart).toBe(6 + pastedText.length);
    expect(result.selectionEnd).toBe(result.selectionStart);
  });

  it("submits Enter on desktop textareas but keeps Shift+Enter for newlines", () => {
    const desktop = {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
      maxTouchPoints: 0,
      platform: "Linux x86_64"
    };

    expect(shouldSubmitTextareaEnter({ key: "Enter", shiftKey: false }, desktop)).toBe(true);
    expect(shouldSubmitTextareaEnter({ key: "Enter", shiftKey: true }, desktop)).toBe(false);
    expect(shouldSubmitTextareaEnter({ key: "a", shiftKey: false }, desktop)).toBe(false);
  });

  it("does not submit Enter from mobile textarea keyboards", () => {
    expect(shouldSubmitTextareaEnter(
      { key: "Enter", shiftKey: false },
      {
        userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
        maxTouchPoints: 5,
        platform: "Linux armv8l"
      }
    )).toBe(false);
    expect(shouldSubmitTextareaEnter(
      { key: "Enter", shiftKey: false },
      {
        maxTouchPoints: 5,
        platform: "iPhone",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
      }
    )).toBe(false);
  });

  it("treats iPadOS desktop user agents as mobile input devices", () => {
    expect(isMobileInputDevice({
      maxTouchPoints: 5,
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15"
    })).toBe(true);
  });
});
