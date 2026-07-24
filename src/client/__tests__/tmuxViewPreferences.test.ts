import { describe, expect, it } from "vitest";

import {
  parseTmuxSessionViewModes,
  resolveTmuxViewMode
} from "../tmuxViewPreferences.js";

describe("tmux view preferences", () => {
  it("parses only valid saved session views", () => {
    expect(parseTmuxSessionViewModes(JSON.stringify({ admin: "tty", app: "raw", bad: "other", "": "gui" })))
      .toEqual({ admin: "tty", app: "raw" });
    expect(parseTmuxSessionViewModes("invalid")).toEqual({});
  });

  it("remembers views per session and falls back to the configured default", () => {
    const views = { admin: "tty" as const, app: "raw" as const };
    expect(resolveTmuxViewMode("app", "focus", "remember", views)).toBe("raw");
    expect(resolveTmuxViewMode("new", "focus", "remember", views)).toBe("focus");
    expect(resolveTmuxViewMode("app", "focus", "default", views)).toBe("focus");
  });
});
