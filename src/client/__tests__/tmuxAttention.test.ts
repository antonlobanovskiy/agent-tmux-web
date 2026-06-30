import { describe, expect, it } from "vitest";

import type { TmuxWatchEvent } from "../../shared/api.js";
import { buildTmuxAttentionEvents } from "../tmuxAttention.js";

describe("buildTmuxAttentionEvents", () => {
  const events: TmuxWatchEvent[] = [
    { id: 4, session: "agent-tmux-web", label: "Codex", startedAt: "2026-06-30T12:00:00.000Z", finishedAt: "2026-06-30T12:04:00.000Z" },
    { id: 3, session: "kartbite", label: "Codex", startedAt: "2026-06-30T12:00:00.000Z", finishedAt: "2026-06-30T12:03:00.000Z" },
    { id: 2, session: "agent-tmux-web", label: "Claude", startedAt: "2026-06-30T12:00:00.000Z", finishedAt: "2026-06-30T12:02:00.000Z" },
    { id: 1, session: "trading", label: "Gemini", startedAt: "2026-06-30T12:00:00.000Z", finishedAt: "2026-06-30T12:01:00.000Z" }
  ];

  it("omits the selected session and keeps one newest event per remaining session", () => {
    expect(buildTmuxAttentionEvents(events, { selectedSession: "kartbite", limit: 3 })).toEqual([
      events[0],
      events[3]
    ]);
  });

  it("applies the limit after selected-session filtering and session dedupe", () => {
    expect(buildTmuxAttentionEvents(events, { selectedSession: "admin", limit: 2 })).toEqual([
      events[0],
      events[1]
    ]);
  });
});
