import { describe, expect, it } from "vitest";

import { parseTmuxChatOutput, splitTmuxChatMessage } from "../tmuxGui.js";

describe("parseTmuxChatOutput", () => {
  it("turns Codex tmux transcript prompts into chat messages", () => {
    const messages = parseTmuxChatOutput([
      "• Tests passed.",
      "",
      "────────────────────────────────────────────────────────",
      "› Explain this codebase",
      "",
      "• This project is a mobile control panel for terminal agents.",
      "  It manages tmux sessions.",
      "",
      "gpt-5.5 xhigh fast · ~/dev/agent-tmux-web Goal achieved (3m)"
    ].join("\n"));

    expect(messages).toEqual([
      { id: "assistant-0", role: "assistant", text: "• Tests passed." },
      { id: "user-1", role: "user", text: "Explain this codebase" },
      {
        id: "assistant-2",
        role: "assistant",
        text: "• This project is a mobile control panel for terminal agents.\n  It manages tmux sessions."
      }
    ]);
  });

  it("falls back to a terminal message when no Codex prompt is visible", () => {
    expect(parseTmuxChatOutput("❯ pnpm test\n25 passed")).toEqual([
      { id: "assistant-0", role: "assistant", text: "❯ pnpm test\n25 passed" }
    ]);
  });

  it("ignores the active input prompt at the bottom of the tmux pane", () => {
    const messages = parseTmuxChatOutput([
      "• Done.",
      "",
      "─ Worked for 2m 25s ─────────────────────────────────────────",
      "",
      "",
      "› Summarize recent commits",
      "",
      "  gpt-5.5 xhigh fast · ~/dev Goal achieved (20m)"
    ].join("\n"));

    expect(messages).toEqual([
      { id: "assistant-0", role: "assistant", text: "• Done." }
    ]);
  });

  it("splits command output sections into code blocks", () => {
    expect(splitTmuxChatMessage([
      "• Ran pnpm test",
      "  └ Test Files 7 passed",
      "    Tests 27 passed",
      "",
      "Implemented the GUI view."
    ].join("\n"))).toEqual([
      { id: "part-0", kind: "text", text: "• Ran pnpm test" },
      { id: "part-1", kind: "code", label: "terminal", text: "  └ Test Files 7 passed\n    Tests 27 passed" },
      { id: "part-2", kind: "text", text: "Implemented the GUI view." }
    ]);
  });

  it("keeps fenced code blocks as code parts", () => {
    expect(splitTmuxChatMessage("Use this:\n```ts\nconst ok = true;\n```\nDone.")).toEqual([
      { id: "part-0", kind: "text", text: "Use this:" },
      { id: "part-1", kind: "code", label: "ts", text: "const ok = true;" },
      { id: "part-2", kind: "text", text: "Done." }
    ]);
  });
});
