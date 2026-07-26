import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { TmuxTtyView } from "../TmuxTtyView.js";

describe("TmuxTtyView", () => {
  it("renders the OpenCode stream separately from its details panel", () => {
    const html = renderToStaticMarkup(
      <TmuxTtyView
        historyOwner="harness"
        onHarnessHistory={vi.fn()}
        onScroll={vi.fn()}
        output="assistant stream"
        sidebar={{ kind: "opencode", output: "Context\n25,467 tokens" }}
      />
    );

    expect(html).toContain("tmux-opencode-terminal harness-history mobile-active");
    expect(html).toContain("aria-label=\"OpenCode details\"");
    expect(html).toContain("role=\"tablist\"");
    expect(html).toContain("assistant stream");
    expect(html).toContain("25,467 tokens");
  });

  it("keeps ordinary captures in the selectable TTY renderer", () => {
    const html = renderToStaticMarkup(
      <TmuxTtyView historyOwner="tmux" onHarnessHistory={vi.fn()} onScroll={vi.fn()} output="shell output" />
    );

    expect(html).toContain("<pre class=\"tmux-output\"");
    expect(html).not.toContain("tmux-opencode-layout");
    expect(html).not.toContain("harness-history");
  });

  it("marks active TUI captures as harness-owned history surfaces", () => {
    const html = renderToStaticMarkup(
      <TmuxTtyView historyOwner="harness" onHarnessHistory={vi.fn()} onScroll={vi.fn()} output="agent output" />
    );

    expect(html).toContain("tmux-output harness-history");
    expect(html).toContain("Swipe or use Page Up and Page Down");
    expect(html).toContain("tabindex=\"0\"");
  });

  it("clears whichever mobile pane owns the forwarded scroll ref", () => {
    const source = readFileSync(join(process.cwd(), "src/client/TmuxTtyView.tsx"), "utf8");

    expect(source).toMatch(/function assignDetails[\s\S]*mobilePane === "details"[\s\S]*assignForwardedRef\(ref, node\)/);
  });
});
