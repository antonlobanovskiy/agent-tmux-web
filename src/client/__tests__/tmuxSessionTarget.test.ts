import { describe, expect, it } from "vitest";

import type { TmuxSessionDto } from "../../shared/api.js";
import {
  orderTmuxSessionsByPins,
  parsePinnedTmuxSessionNames,
  readRequestedTmuxSession,
  removeRequestedTmuxSession,
  togglePinnedTmuxSessionName
} from "../tmuxSessionTarget.js";

describe("tmux session notification targets", () => {
  it("reads the requested tmux session from the URL query", () => {
    expect(readRequestedTmuxSession("?token=abc&tmuxSession=agent-demo")).toBe("agent-demo");
  });

  it("trims and ignores blank requested sessions", () => {
    expect(readRequestedTmuxSession("?tmuxSession=%20codex%20")).toBe("codex");
    expect(readRequestedTmuxSession("?tmuxSession=%20%20")).toBe("");
  });

  it("removes the consumed session target without dropping auth token", () => {
    const url = new URL("https://example.test/?token=abc&tmuxSession=agent-demo");

    expect(removeRequestedTmuxSession(url)).toBe("https://example.test/?token=abc");
  });

  it("parses, deduplicates, and toggles pinned session names", () => {
    expect(parsePinnedTmuxSessionNames(JSON.stringify([" admin ", "admin", 4, "health"]))).toEqual(["admin", "health"]);
    expect(parsePinnedTmuxSessionNames("not json")).toEqual([]);
    expect(togglePinnedTmuxSessionName(["admin"], "health")).toEqual(["admin", "health"]);
    expect(togglePinnedTmuxSessionName(["admin", "health"], "admin")).toEqual(["health"]);
  });

  it("moves pinned sessions to the top without reordering either group", () => {
    const session = (name: string): TmuxSessionDto => ({ name, windows: 1, created: "now", attached: false });
    const ordered = orderTmuxSessionsByPins(
      [session("admin"), session("agent-tmux-web"), session("health"), session("kartbite")],
      ["health", "admin"]
    );

    expect(ordered.map(({ name }) => name)).toEqual(["admin", "health", "agent-tmux-web", "kartbite"]);
  });
});
