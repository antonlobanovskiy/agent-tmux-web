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
});
