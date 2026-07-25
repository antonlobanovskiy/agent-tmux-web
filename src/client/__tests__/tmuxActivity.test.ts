import { describe, expect, it } from "vitest";

import { looksLikeTmuxWaitingForInput, looksLikeTmuxWorking } from "../../shared/tmuxActivity.js";
import { classifyTmuxStatus, mergeTmuxSessionStatus } from "../../shared/tmuxStatus.js";

describe("tmux activity detection", () => {
  it("detects Codex working output", () => {
    expect(looksLikeTmuxWorking("• Working (12s • esc to interrupt)")).toBe(true);
    expect(looksLikeTmuxWaitingForInput("• Working (12s • esc to interrupt)")).toBe(false);
  });

  it("detects live OpenCode working and waiting footers", () => {
    const workingFooter = "⬝⬝⬝■■■■■  esc interrupt    174.0K (35%)  ctrl+p commands    • OpenCode 1.18.4";
    const waitingFooter = "/workspace/project  139.6K (28%)  ctrl+p commands";

    expect(looksLikeTmuxWorking(workingFooter)).toBe(true);
    expect(looksLikeTmuxWaitingForInput(workingFooter)).toBe(false);
    expect(classifyTmuxStatus({ output: workingFooter }).health).toBe("green");
    expect(looksLikeTmuxWorking(waitingFooter)).toBe(false);
    expect(looksLikeTmuxWaitingForInput(waitingFooter)).toBe(true);
    expect(classifyTmuxStatus({ output: waitingFooter })).toMatchObject({ kind: "waiting", health: "gray" });
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

  it("uses a newer ordinary prompt instead of an older working line", () => {
    const output = [
      "• Working (45s • esc to interrupt)",
      "Done.",
      "agent-demo $"
    ].join("\n");

    expect(looksLikeTmuxWorking(output)).toBe(false);
    expect(looksLikeTmuxWaitingForInput(output)).toBe(true);
  });

  it("does not let an old completion marker override newer work", () => {
    const output = [
      "Goal achieved",
      "• Working (3s • esc to interrupt)"
    ].join("\n");

    expect(looksLikeTmuxWorking(output)).toBe(true);
    expect(looksLikeTmuxWaitingForInput(output)).toBe(false);
  });

  it("orders generic questions and permission prompts against working output", () => {
    expect(looksLikeTmuxWaitingForInput([
      "• Working (3s • esc to interrupt)",
      "Allow this command? [y/N]"
    ].join("\n"))).toBe(true);
    expect(looksLikeTmuxWorking([
      "Which branch should I use?",
      "• Working (3s • esc to interrupt)"
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

  it("uses conventional status-light colors", () => {
    expect(classifyTmuxStatus({ output: "Working (3s • esc to interrupt)" }).health).toBe("green");
    expect(classifyTmuxStatus({ output: "Allow this command? [y/N]" }).health).toBe("amber");
    expect(classifyTmuxStatus({ output: "Error: command failed" }).health).toBe("red");
    expect(classifyTmuxStatus({ output: "quiet output" }).health).toBe("gray");
  });

  it("keeps a recent shell failure red when the prompt returns", () => {
    expect(classifyTmuxStatus({ output: "bash: nope: command not found\nuser@host $" }))
      .toMatchObject({ kind: "error", health: "red" });
  });

  it("keeps visible actionable and error states ahead of native harness status", () => {
    const running = classifyTmuxStatus({ output: "Working (3s • esc to interrupt)" });
    expect(mergeTmuxSessionStatus(classifyTmuxStatus({ output: "Error: command failed" }), running).kind).toBe("error");
    expect(mergeTmuxSessionStatus(classifyTmuxStatus({ output: "Allow this command? [y/N]" }), running).kind).toBe("needs-permission");
    expect(mergeTmuxSessionStatus(classifyTmuxStatus({ output: "quiet output" }), running).kind).toBe("running");
  });

  it("uses amber only for visible choices or approvals", () => {
    expect(classifyTmuxStatus({ output: "Which branch should I use?\nctrl+p commands" }))
      .toMatchObject({ kind: "waiting", health: "gray" });
    expect(classifyTmuxStatus({ output: "Next steps:\n1. Create an account\n2. Configure the repository\nctrl+p commands" }))
      .toMatchObject({ kind: "waiting", health: "gray" });
    expect(classifyTmuxStatus({ output: "Choose a branch:\n› 1. main\n  2. release\nPress enter to confirm or esc to go back" }))
      .toMatchObject({ kind: "question", health: "amber" });
    expect(classifyTmuxStatus({ output: "Allow this command? [y/N]" }))
      .toMatchObject({ kind: "needs-permission", health: "amber" });
  });

  it("lets the current idle prompt clear historical failures", () => {
    const completedRun = [
      "FAIL src/server/example.test.ts",
      "AssertionError: expected waiting but received idle",
      "The tests were fixed and now pass.",
      "Build auto · GPT-5.6 Sol · xhigh",
      "/workspace/project  ctrl+p commands"
    ].join("\n");

    expect(classifyTmuxStatus({ output: completedRun })).toMatchObject({ kind: "waiting", health: "gray" });
  });

  it("lets the current idle prompt clear historical approval controls", () => {
    const completedApproval = [
      "Allow this command? [y/N]",
      "Approved and completed.",
      "/workspace/project  ctrl+p commands"
    ].join("\n");

    expect(classifyTmuxStatus({ output: completedApproval })).toMatchObject({ kind: "waiting", health: "gray" });
  });
});
