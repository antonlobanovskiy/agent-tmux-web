import { describe, expect, it } from "vitest";

import { buildTmuxDoneNotification } from "../tmuxNotifications.js";

describe("tmux notification payloads", () => {
  it("includes the waiting tmux tab in display text and launch metadata", () => {
    expect(buildTmuxDoneNotification("agent-demo", "Claude")).toEqual({
      title: "agent-demo tab is waiting",
      body: "Claude finished in agent-demo and is waiting for input.",
      tag: "agent-tmux-web-agent-demo",
      tmuxSession: "agent-demo"
    });
  });

  it("falls back to a generic task label without dropping the session target", () => {
    expect(buildTmuxDoneNotification("codex", "")).toMatchObject({
      body: "Tmux task finished in codex and is waiting for input.",
      tmuxSession: "codex"
    });
  });
});
