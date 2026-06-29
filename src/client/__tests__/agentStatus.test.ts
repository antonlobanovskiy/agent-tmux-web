import { describe, expect, it } from "vitest";

import { buildCompactTmuxMessages, summarizeTmuxAgent } from "../agentStatus.js";
import type { TmuxChatMessage } from "../tmuxGui.js";

describe("summarizeTmuxAgent", () => {
  it("detects permission prompts", () => {
    const summary = summarizeTmuxAgent([
      "Codex wants to run:",
      "  git push origin main",
      "Allow this command? [y/N]"
    ].join("\n"), []);

    expect(summary.kind).toBe("needs-permission");
    expect(summary.title).toBe("Needs permission");
    expect(summary.action).toBe("Review the prompt and approve or reject it.");
  });

  it("detects questions waiting for an answer", () => {
    const summary = summarizeTmuxAgent("Which branch should I target for the PR?", []);

    expect(summary.kind).toBe("question");
    expect(summary.title).toBe("Question waiting");
    expect(summary.action).toBe("Reply with a short answer.");
  });

  it("detects errors before generic waiting state", () => {
    const summary = summarizeTmuxAgent([
      "pnpm build",
      "Build failed with exit code 1",
      "agent-demo $"
    ].join("\n"), []);

    expect(summary.kind).toBe("error");
    expect(summary.title).toBe("Error");
  });

  it("uses tmux prompt detection for waiting sessions", () => {
    const summary = summarizeTmuxAgent([
      "Goal achieved",
      "agent-demo $"
    ].join("\n"), []);

    expect(summary.kind).toBe("waiting");
    expect(summary.title).toBe("Waiting for input");
  });

  it("summarizes the latest meaningful assistant message", () => {
    const summary = summarizeTmuxAgent(
      "Working... press Ctrl-C to interrupt",
      [
        { id: "user-0", role: "user", text: "Check the mobile layout" },
        { id: "assistant-1", role: "assistant", text: "• Inspecting screenshots.\n• Running viewport checks." }
      ],
      { activityAtMs: 1_000_000, nowMs: 1_000_000 }
    );

    expect(summary.kind).toBe("running");
    expect(summary.health).toBe("green");
    expect(summary.detail).toBe("Inspecting screenshots. Running viewport checks.");
  });

  it("treats stale working output as idle", () => {
    const summary = summarizeTmuxAgent(
      "Working... press Ctrl-C to interrupt",
      [],
      {
        activityAtMs: 1_000_000,
        nowMs: 1_000_000 + (24 * 60 * 60 * 1000)
      }
    );

    expect(summary.kind).toBe("idle");
    expect(summary.health).toBe("yellow");
    expect(summary.title).toBe("Idle");
  });

  it("does not treat arbitrary recent output as running", () => {
    const summary = summarizeTmuxAgent(
      "Ran tests successfully\nagent-demo $",
      [],
      { activityAtMs: 1_000_000, nowMs: 1_000_100 }
    );

    expect(summary.kind).toBe("waiting");
    expect(summary.health).toBe("yellow");
  });

  it("does not treat code mentioning needs-permission as a permission prompt", () => {
    const summary = summarizeTmuxAgent(
      [
        "Did you review what you changed above?",
        "permission, .tmux-focus-hero.running, .tmux-focus-hero.waiting",
        "const relevantConsole = consoleMessages.filter((message) => !message.includes(\"favicon\"));",
        "Working (14m 39s • esc to interrupt)"
      ].join("\n"),
      [],
      { activityAtMs: 1_000_000, nowMs: 1_000_100 }
    );

    expect(summary.kind).toBe("running");
    expect(summary.health).toBe("green");
  });

  it("does not let old error text override active working output", () => {
    const summary = summarizeTmuxAgent(
      [
        "Error: Project(s) \"chromium\" not found.",
        "Running rendered check",
        "Working (14m 39s • esc to interrupt)"
      ].join("\n"),
      [],
      { activityAtMs: 1_000_000, nowMs: 1_000_100 }
    );

    expect(summary.kind).toBe("running");
    expect(summary.health).toBe("green");
  });

  it("does not use raw source diffs as the running summary", () => {
    const summary = summarizeTmuxAgent("Working... press Ctrl-C to interrupt", [
      {
        id: "assistant-1",
        role: "assistant",
        text: [
          "1089 + line-height: 1.45;",
          "1090 +}",
          "1092 +.tmux-focus-section {",
          "1093 +  display: grid;"
        ].join("\n")
      }
    ]);

    expect(summary.kind).toBe("running");
    expect(summary.detail).toBe("Terminal output captured; open a detailed view for full output.");
  });

  it("does not treat git status markers as questions", () => {
    const summary = summarizeTmuxAgent([
      "Working... press Ctrl-C to interrupt",
      " M src/client/App.tsx",
      "?? src/client/agentStatus.ts"
    ].join("\n"), []);

    expect(summary.kind).toBe("running");
    expect(summary.title).toBe("Running");
    expect(summary.detail).toBe("Terminal output captured; open a detailed view for full output.");
  });
});

describe("buildCompactTmuxMessages", () => {
  it("keeps recent prompts and summaries while dropping verbose code output", () => {
    const messages: TmuxChatMessage[] = [
      { id: "user-0", role: "user", text: "Run tests" },
      {
        id: "assistant-1",
        role: "assistant",
        text: [
          "• Ran pnpm test",
          "```terminal",
          "Test Files 18 passed",
          "Tests 85 passed",
          "```",
          "Everything passed."
        ].join("\n")
      }
    ];

    expect(buildCompactTmuxMessages(messages)).toEqual([
      { id: "user-0", role: "user", text: "Run tests" },
      { id: "assistant-1", role: "assistant", text: "Ran pnpm test Everything passed." }
    ]);
  });

  it("drops unfenced source diff output from compact messages", () => {
    const messages: TmuxChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        text: [
          "diff --git a/src/client/styles.css b/src/client/styles.css",
          "@@ -1089,6 +1089,12 @@",
          "1089 + line-height: 1.45;",
          "1090 +}",
          "1092 +.tmux-focus-section {",
          "1093 +  display: grid;"
        ].join("\n")
      }
    ];

    expect(buildCompactTmuxMessages(messages)).toEqual([]);
  });
});
