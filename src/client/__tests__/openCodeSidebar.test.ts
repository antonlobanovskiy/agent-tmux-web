import { describe, expect, it } from "vitest";

import { parseOpenCodeSidebar } from "../openCodeSidebar.js";

describe("parseOpenCodeSidebar", () => {
  it("turns the fixed OpenCode panel into stable named sections", () => {
    expect(parseOpenCodeSidebar([
      "Obsidian and knowledge management",
      "alternatives",
      "",
      "Context",
      "120,589 tokens",
      "24% used",
      "$0.00 spent",
      "",
      "▼ MCP",
      "• github Connected",
      "• playwright Connected",
      "",
      "LSP",
      "LSPs are disabled",
      "",
      "▼ Todo",
      "[•] Finish reviewed assistant experience",
      "[ ] Build secrets workspace UI",
      "",
      "~/dev",
      "• OpenCode 1.18.3"
    ].join("\n"))).toEqual({
      title: "Obsidian and knowledge management alternatives",
      sections: [
        { id: "context", title: "Context", lines: ["120,589 tokens", "24% used", "$0.00 spent"] },
        { id: "mcp", title: "MCP", lines: ["• github Connected", "• playwright Connected"] },
        { id: "lsp", title: "LSP", lines: ["LSPs are disabled"] },
        { id: "todo", title: "Todo", lines: ["[•] Finish reviewed assistant experience", "[ ] Build secrets workspace UI"] }
      ]
    });
  });

  it("falls back to an OpenCode title for an empty capture", () => {
    expect(parseOpenCodeSidebar("")).toEqual({ title: "OpenCode", sections: [] });
  });
});
