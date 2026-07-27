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

  it("parses compact captures without blank rows between headings", () => {
    expect(parseOpenCodeSidebar("Session title\nContext\n25,467 tokens\nMCP\n• github Connected\nLSP\nDisabled\nTodo\n[ ] Ship\n~/dev\n• OpenCode 1.18.5")).toEqual({
      title: "Session title",
      sections: [
        { id: "context", title: "Context", lines: ["25,467 tokens"] },
        { id: "mcp", title: "MCP", lines: ["• github Connected"] },
        { id: "lsp", title: "LSP", lines: ["Disabled"] },
        { id: "todo", title: "Todo", lines: ["[ ] Ship"] }
      ]
    });
  });

  it("removes compact TUI border remnants before parsing sections", () => {
    expect(parseOpenCodeSidebar([
      "Image attachment review              █",
      "                                       █",
      "Context                              █",
      "252,472 tokens                       ▀",
      "50% used",
      "$0.00 spent",
      "",
      "▼ MCP",
      "• github Connected"
    ].join("\n"))).toEqual({
      title: "Image attachment review",
      sections: [
        { id: "context", title: "Context", lines: ["252,472 tokens", "50% used", "$0.00 spent"] },
        { id: "mcp", title: "MCP", lines: ["• github Connected"] }
      ]
    });
  });
});
