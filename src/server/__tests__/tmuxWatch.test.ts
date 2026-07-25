import { describe, expect, it } from "vitest";

import { TMUX_WATCH_CAPTURE_LINES, TmuxWatchStore } from "../tmuxWatch.js";

describe("tmux watch store", () => {
  it("waits for the minimum age before polling a watched session", async () => {
    let now = 1_000;
    const captures: string[] = [];
    const store = new TmuxWatchStore({
      initialEventId: 1,
      confirmationPolls: 1,
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
      label: "Tmux task",
      state: "waiting-for-input",
      revision: 2
    });
  });

  it("leaves a watch active while the pane still looks busy", async () => {
    const store = new TmuxWatchStore({
      initialEventId: 1,
      confirmationPolls: 1,
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
      confirmationPolls: 1,
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

  it("baselines existing sessions without notifying, then emits once per confirmed transition", async () => {
    let output = "plain shell output";
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      confirmationPolls: 2,
      now: () => 10_000,
      listSessions: async () => [{ name: "codex", activityAtMs: 10_000 }],
      capture: async () => output
    });

    expect(await store.pollOnce()).toEqual([]);
    expect(store.latestEventId()).toBe(0);

    output = "• Working (2s • esc to interrupt)";
    expect(await store.pollOnce()).toEqual([]);
    expect(await store.pollOnce()).toEqual([]);

    output = "Which branch should I use?";
    expect(await store.pollOnce()).toEqual([]);
    const waiting = await store.pollOnce();
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ state: "waiting-for-input", session: "codex" });
    expect(await store.pollOnce()).toEqual([]);

    output = "• Working (4s • esc to interrupt)";
    expect(await store.pollOnce()).toEqual([]);
    expect(await store.pollOnce()).toEqual([]);
    output = "completed without a prompt marker";
    expect(await store.pollOnce()).toEqual([]);
    const idle = await store.pollOnce();
    expect(idle).toHaveLength(1);
    expect(idle[0]).toMatchObject({ state: "idle", session: "codex" });
    expect(await store.pollOnce()).toEqual([]);
  });

  it("waits for a generic foreground command to return to the shell before emitting idle", async () => {
    let currentCommand = "sleep";
    let output = "$ sleep 60";
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      confirmationPolls: 1,
      now: () => 10_000,
      listSessions: async () => [{ name: "shell", currentCommand }],
      capture: async () => output
    });

    await store.pollOnce();
    expect(await store.pollOnce()).toEqual([]);
    currentCommand = "bash";
    output = "user@host $";
    expect(await store.pollOnce()).toMatchObject([{ state: "idle", session: "shell" }]);
  });

  it("emits idle when a failed shell command returns to the prompt", async () => {
    let currentCommand = "sleep";
    let output = "$ sleep 60";
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      confirmationPolls: 1,
      now: () => 10_000,
      listSessions: async () => [{ name: "shell", currentCommand }],
      capture: async () => output
    });

    await store.pollOnce();
    currentCommand = "bash";
    output = "bash: nope: command not found\nuser@host $";
    expect(await store.pollOnce()).toMatchObject([{ state: "idle", session: "shell" }]);
  });

  it("does not emit idle for an in-progress shell error without a returned prompt", async () => {
    let output = "running shell step";
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      confirmationPolls: 1,
      now: () => 10_000,
      listSessions: async () => [{ name: "shell", currentCommand: "bash" }],
      capture: async () => output
    });

    await store.pollOnce();
    output = "Error: retrying in 10 seconds";
    expect(await store.pollOnce()).toEqual([]);
  });

  it("keeps shell questions without a returned prompt in the input-needed state", async () => {
    let output = "running shell step";
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      confirmationPolls: 1,
      now: () => 10_000,
      listSessions: async () => [{ name: "shell", currentCommand: "bash" }],
      capture: async () => output
    });

    await store.pollOnce();
    output = "Which branch should I use?";
    expect(await store.pollOnce()).toMatchObject([{ state: "waiting-for-input", session: "shell" }]);
  });

  it("hides events whose session state is changing", async () => {
    let output = "agent-demo $";
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      confirmationPolls: 1,
      now: () => 10_000,
      capture: async () => output
    });

    store.startWatch("agent-demo", "Codex");
    await store.pollOnce();
    expect(store.getEventsSince(0)).toHaveLength(1);

    output = "• Working (1s • esc to interrupt)";
    const changingStore = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      confirmationPolls: 2,
      now: () => 10_000,
      capture: async () => output
    });
    changingStore.startWatch("agent-demo", "Codex");
    output = "agent-demo $";
    await changingStore.pollOnce();
    expect(changingStore.latestEventId()).toBe(0);
    expect(changingStore.latestBaselineEventId()).toBe(0);
    expect(changingStore.getEventsSince(0)).toEqual([]);
    await changingStore.pollOnce();
    expect(changingStore.getEventsSince(0)).toHaveLength(1);

    output = "• Working (1s • esc to interrupt)";
    await changingStore.pollOnce();
    expect(changingStore.latestEventId()).toBe(1);
    expect(changingStore.latestBaselineEventId()).toBe(1);
    expect(changingStore.getEventsSince(0)).toEqual([]);
  });

  it("assigns event IDs in confirmed broadcast order", async () => {
    const captures: Array<{ session: string; resolve: (output: string) => void }> = [];
    const broadcasts: Array<{ id: number; session: string }> = [];
    const store = new TmuxWatchStore({
      initialEventId: 1,
      minAgeMs: 0,
      confirmationPolls: 2,
      now: () => 10_000,
      capture: (session) => new Promise((resolve) => {
        captures.push({ session, resolve });
      }),
      onEvent: ({ id, session }) => broadcasts.push({ id, session })
    });

    store.startWatch("alpha", "Alpha");
    store.startWatch("beta", "Beta");

    const firstPoll = store.pollOnce();
    await Promise.resolve();
    expect(captures.map(({ session }) => session)).toEqual(["alpha", "beta"]);
    captures[0].resolve("alpha $");
    captures[1].resolve("beta $");
    await firstPoll;

    captures.length = 0;
    const secondPoll = store.pollOnce();
    await Promise.resolve();
    expect(captures.map(({ session }) => session)).toEqual(["alpha", "beta"]);
    captures[1].resolve("beta $");
    captures[0].resolve("alpha $");

    expect((await secondPoll).map(({ id, session }) => ({ id, session }))).toEqual([
      { id: 1, session: "beta" },
      { id: 2, session: "alpha" }
    ]);
    expect(broadcasts).toEqual([
      { id: 1, session: "beta" },
      { id: 2, session: "alpha" }
    ]);
  });
});
