import { describe, expect, it } from "vitest";

import { TMUX_WATCH_CAPTURE_LINES, TmuxWatchStore } from "../tmuxWatch.js";

describe("tmux watch store", () => {
  it("waits for the minimum age before polling a watched session", async () => {
    let now = 1_000;
    const captures: string[] = [];
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 2500,
      now: () => now,
      capture: async (session) => {
        captures.push(session);
        return "agent-demo $";
      }
    });

    store.startWatch("agent-demo", "Tmux task");
    await store.pollOnce();
    expect(captures).toEqual([]);

    now = 3_600;
    const completed = await store.pollOnce();
    expect(captures).toEqual(["agent-demo"]);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      id: 1,
      session: "agent-demo",
      label: "Tmux task"
    });
  });

  it("leaves a watch active while the pane still looks busy", async () => {
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      now: () => 5_000,
      capture: async () => "• Working (12s • esc to interrupt)"
    });

    store.startWatch("codex", "Codex");
    expect(await store.pollOnce()).toEqual([]);
    expect(store.listWatches()).toHaveLength(1);
  });

  it("records events and exposes only events after the requested cursor", async () => {
    let output = "codex $";
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      now: () => 10_000,
      capture: async (_session, lines) => {
        expect(lines).toBe(TMUX_WATCH_CAPTURE_LINES);
        return output;
      }
    });

    store.startWatch("codex", "Codex");
    await store.pollOnce();

    output = "claude $";
    store.startWatch("claude", "Claude");
    await store.pollOnce();

    expect(store.latestEventId()).toBe(2);
    expect(store.getEventsSince(0).map((event) => event.session)).toEqual(["codex", "claude"]);
    expect(store.getEventsSince(1).map((event) => event.session)).toEqual(["claude"]);
  });
});
