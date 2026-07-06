import { describe, expect, it } from "vitest";

import { cleanTmuxAssistantCopyText } from "../tmuxCopy.js";

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

  it("leaves non-draft assistant output unchanged apart from edge whitespace", () => {
    expect(cleanTmuxAssistantCopyText("\n• Tests passed.\n\n```sh\npnpm test\n```\n")).toBe("• Tests passed.\n\n```sh\npnpm test\n```");
  });
});
