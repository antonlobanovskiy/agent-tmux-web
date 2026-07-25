import { describe, expect, it } from "vitest";

import { cleanTmuxAssistantCopyText, extractLatestTmuxAssistantText } from "../tmuxCopy.js";

describe("extractLatestTmuxAssistantText", () => {
  it("returns the latest assistant block from captured terminal output", () => {
    expect(extractLatestTmuxAssistantText([
      "› First prompt",
      "",
      "• First response",
      "",
      "› Second prompt",
      "",
      "• Latest response",
      "  continued"
    ].join("\n"))).toBe("• Latest response\n  continued");
  });

  it("ignores terminal chrome", () => {
    expect(extractLatestTmuxAssistantText("› Prompt\nAnswer\nWorked for 12s\nGoal achieved")).toBe("Answer");
  });
});

describe("cleanTmuxAssistantCopyText", () => {
  it("extracts a draft reply and removes terminal quote wrapping", () => {
    expect(cleanTmuxAssistantCopyText([
      "• Draft reply:",
      "",
      "> Thanks. The web/app side is persistent in the",
      "sense that sessions live in",
      "> server-side tmux, not in the browser. So phone",
      "disconnects, browser",
      "> refreshes, app restarts, and even restarting the",
      "agent-tmux-web service do",
      "> not kill the agent sessions.",
      ">",
      "> Full host reboots are different: stock tmux",
      "sessions do not survive a reboot",
      "> unless you add a restore layer."
    ].join("\n"))).toBe([
      "Thanks. The web/app side is persistent in the sense that sessions live in server-side tmux, not in the browser. So phone disconnects, browser refreshes, app restarts, and even restarting the agent-tmux-web service do not kill the agent sessions.",
      "",
      "Full host reboots are different: stock tmux sessions do not survive a reboot unless you add a restore layer."
    ].join("\n"));
  });

  it("preserves code blocks while removing the leading Codex bullet", () => {
    expect(cleanTmuxAssistantCopyText("\n• Tests passed.\n\n```sh\npnpm test\n```\n")).toBe("Tests passed.\n\n```sh\npnpm test\n```");
  });

  it("reflows plain assistant replies that were hard-wrapped by tmux width", () => {
    expect(cleanTmuxAssistantCopyText([
      "Thanks. Sessions live in server-side tmux, so",
      "phone disconnects, browser",
      "  refreshes, app restarts, and even restarting the",
      "web service will not kill",
      "  running agents.",
      "",
      "Host reboots are different: stock tmux does not",
      "survive reboot unless you add",
      "  restore tooling like tmux-resurrect/continuum or a",
      "small systemd bootstrap.",
      "",
      "For 20+ agents, first-class session templates and",
      "reboot restore are probably",
      "  worth building."
    ].join("\n"))).toBe([
      "Thanks. Sessions live in server-side tmux, so phone disconnects, browser refreshes, app restarts, and even restarting the web service will not kill running agents.",
      "",
      "Host reboots are different: stock tmux does not survive reboot unless you add restore tooling like tmux-resurrect/continuum or a small systemd bootstrap.",
      "",
      "For 20+ agents, first-class session templates and reboot restore are probably worth building."
    ].join("\n"));
  });

  it("removes a Codex leading bullet from single-reply prose", () => {
    expect(cleanTmuxAssistantCopyText([
      "• Thanks. Sessions live in server-side tmux, so",
      "phone disconnects, browser",
      "  refreshes, app restarts, and even restarting the",
      "web service will not kill",
      "  running agents.",
      "",
      "Host reboots are different: stock tmux does not",
      "survive reboot unless you add",
      "  restore tooling like tmux-resurrect/continuum or a",
      "small systemd bootstrap.",
      "",
      "For 20+ agents, first-class session templates and",
      "reboot restore are probably",
      "  worth building."
    ].join("\n"))).toBe([
      "Thanks. Sessions live in server-side tmux, so phone disconnects, browser refreshes, app restarts, and even restarting the web service will not kill running agents.",
      "",
      "Host reboots are different: stock tmux does not survive reboot unless you add restore tooling like tmux-resurrect/continuum or a small systemd bootstrap.",
      "",
      "For 20+ agents, first-class session templates and reboot restore are probably worth building."
    ].join("\n"));
  });
});
