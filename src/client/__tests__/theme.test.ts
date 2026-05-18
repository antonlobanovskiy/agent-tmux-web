import { describe, expect, it } from "vitest";

import { nextColorTheme, normalizeColorTheme, resolveInitialColorTheme } from "../theme.js";

describe("color theme helpers", () => {
  it("accepts only supported stored theme values", () => {
    expect(normalizeColorTheme("light")).toBe("light");
    expect(normalizeColorTheme("dark")).toBe("dark");
    expect(normalizeColorTheme("system")).toBeNull();
    expect(normalizeColorTheme(null)).toBeNull();
  });

  it("uses a stored theme before system preference", () => {
    expect(resolveInitialColorTheme("dark", true)).toBe("dark");
    expect(resolveInitialColorTheme("light", false)).toBe("light");
  });

  it("falls back to the system light preference without a stored theme", () => {
    expect(resolveInitialColorTheme(null, true)).toBe("light");
    expect(resolveInitialColorTheme(null, false)).toBe("dark");
  });

  it("toggles between light and dark", () => {
    expect(nextColorTheme("dark")).toBe("light");
    expect(nextColorTheme("light")).toBe("dark");
  });
});
