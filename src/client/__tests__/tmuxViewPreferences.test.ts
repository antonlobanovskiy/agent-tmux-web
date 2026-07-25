import { describe, expect, it } from "vitest";

import {
  normalizeTmuxViewMode,
  parseTmuxSessionViewModes,
  resolveTmuxViewMode
} from "../tmuxViewPreferences.js";

describe("tmux view preferences", () => {
  it("parses saved session views and migrates removed modes to TTY", () => {
    expect(parseTmuxSessionViewModes(JSON.stringify({ admin: "tty", app: "raw", oldGui: "gui", oldFocus: "focus", bad: "other", "": "gui" })))
      .toEqual({ admin: "tty", app: "raw", oldGui: "tty", oldFocus: "tty" });
    expect(parseTmuxSessionViewModes("invalid")).toEqual({});
    expect(normalizeTmuxViewMode("gui")).toBe("tty");
    expect(normalizeTmuxViewMode("focus")).toBe("tty");
  });

  it("remembers views per session and falls back to the configured default", () => {
    const views = { admin: "tty" as const, app: "raw" as const };
    expect(resolveTmuxViewMode("app", "tty", "remember", views)).toBe("raw");
    expect(resolveTmuxViewMode("new", "tty", "remember", views)).toBe("tty");
    expect(resolveTmuxViewMode("app", "tty", "default", views)).toBe("tty");
  });
});
