import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TmuxTtyView } from "../TmuxTtyView.js";

describe("TmuxTtyView", () => {
  it("renders OpenCode terminal and details as separate panes", () => {
    const html = renderToStaticMarkup(
      <TmuxTtyView
        onScroll={vi.fn()}
        output="terminal output"
        sidebar={{ kind: "opencode", output: "Context\n25,467 tokens" }}
      />
    );

    expect(html).toContain("tmux-opencode-terminal mobile-active");
    expect(html).toContain("aria-label=\"OpenCode details\"");
    expect(html).toContain("role=\"tablist\"");
    expect(html).toContain("terminal output");
    expect(html).toContain("25,467 tokens");
  });

  it("keeps ordinary tmux captures in the standard TTY renderer", () => {
    const html = renderToStaticMarkup(<TmuxTtyView onScroll={vi.fn()} output="shell output" />);

    expect(html).toContain("<pre class=\"tmux-output\"");
    expect(html).not.toContain("tmux-opencode-layout");
  });
});
