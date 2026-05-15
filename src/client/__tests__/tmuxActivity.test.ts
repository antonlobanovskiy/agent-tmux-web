import { describe, expect, it } from "vitest";

import { looksLikeTmuxWaitingForInput, looksLikeTmuxWorking } from "../../shared/tmuxActivity.js";

describe("tmux activity detection", () => {
  it("detects Codex working output", () => {
    expect(looksLikeTmuxWorking("• Working (12s • esc to interrupt)")).toBe(true);
    expect(looksLikeTmuxWaitingForInput("• Working (12s • esc to interrupt)")).toBe(false);
  });

  it("detects a Codex input prompt after work completes", () => {
    expect(looksLikeTmuxWaitingForInput([
      "Implemented the requested change.",
      "Verified tests.",
      "│ › │"
    ].join("\n"))).toBe(true);
  });

  it("detects shell-style prompts", () => {
    expect(looksLikeTmuxWaitingForInput("pnpm test\n40 tests passed\nagent-demo $")).toBe(true);
    expect(looksLikeTmuxWaitingForInput("developer in ~/work/project\n❯")).toBe(true);
  });

  it("does not treat old user prompts as idle state", () => {
    expect(looksLikeTmuxWaitingForInput("› Review the release checklist\n• Still running analysis")).toBe(false);
  });

  it("detects Codex completion status even when no prompt line is visible", () => {
    expect(looksLikeTmuxWaitingForInput([
      "Implemented the requested change.",
      "Verified tests.",
      "› Summarize recent commits",
      "gpt-5.5 xhigh fast · ~/dev                                Goal achieved (5m)"
    ].join("\n"))).toBe(true);
  });

  it("does not let older working lines block a later completion status", () => {
    expect(looksLikeTmuxWorking([
      "• Working (45s • esc to interrupt)",
      "",
      "Done.",
      "gpt-5.5 xhigh fast · ~/dev                                Goal achieved (1m)"
    ].join("\n"))).toBe(false);
    expect(looksLikeTmuxWaitingForInput([
      "• Working (45s • esc to interrupt)",
      "",
      "Done.",
      "gpt-5.5 xhigh fast · ~/dev                                Goal achieved (1m)"
    ].join("\n"))).toBe(true);
  });

  it("detects Codex confirmation prompts as waiting for input", () => {
    expect(looksLikeTmuxWaitingForInput([
      "Replace goal?",
      "› 1. Replace current goal  Set the new objective and start it now",
      "  2. Cancel                Keep the current goal",
      "Press enter to confirm or esc to go back"
    ].join("\n"))).toBe(true);
  });
});
