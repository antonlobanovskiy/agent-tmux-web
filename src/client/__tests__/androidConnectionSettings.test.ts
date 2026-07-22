import { describe, expect, it, vi } from "vitest";

import {
  hasAndroidConnectionSettings,
  openAndroidConnectionSettings
} from "../androidConnectionSettings.js";

describe("Android connection settings", () => {
  it("is available only when the Android bridge exposes settings", () => {
    expect(hasAndroidConnectionSettings(undefined)).toBe(false);
    expect(hasAndroidConnectionSettings({})).toBe(false);
    expect(hasAndroidConnectionSettings({ openConnectionSettings: () => {} })).toBe(true);
  });

  it("opens native settings and reports bridge failures", () => {
    const openConnectionSettings = vi.fn();

    expect(openAndroidConnectionSettings({ openConnectionSettings })).toBe(true);
    expect(openConnectionSettings).toHaveBeenCalledOnce();
    expect(openAndroidConnectionSettings(undefined)).toBe(false);
    expect(openAndroidConnectionSettings({
      openConnectionSettings: () => { throw new Error("bridge failed"); }
    })).toBe(false);
  });
});
