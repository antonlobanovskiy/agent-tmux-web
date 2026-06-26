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
    const summary = summarizeTmuxAgent("Working... press Ctrl-C to interrupt", [
      { id: "user-0", role: "user", text: "Check the mobile layout" },
      { id: "assistant-1", role: "assistant", text: "• Inspecting screenshots.\n• Running viewport checks." }
    ]);

    expect(summary.kind).toBe("running");
    expect(summary.detail).toBe("Inspecting screenshots. Running viewport checks.");
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
});
