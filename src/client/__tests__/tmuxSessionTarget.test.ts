import { describe, expect, it } from "vitest";

import { readRequestedTmuxSession, removeRequestedTmuxSession } from "../tmuxSessionTarget.js";

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
});
