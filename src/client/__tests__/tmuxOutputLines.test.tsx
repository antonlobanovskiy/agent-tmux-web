import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TmuxOutputLines } from "../tmuxOutputLines.js";

describe("TmuxOutputLines", () => {
  it("renders URLs in raw terminal output as clickable links", () => {
    const html = renderToStaticMarkup(
      <pre>
        <TmuxOutputLines output="Open https://example.com/docs." />
      </pre>
    );

    expect(html).toContain("<a href=\"https://example.com/docs\"");
    expect(html).toContain("target=\"_blank\"");
    expect(html).toContain("rel=\"noreferrer noopener\"");
    expect(html).toContain("https://example.com/docs</a>.");
  });

  it("keeps raw terminal scroll anchors on every line", () => {
    const html = renderToStaticMarkup(
      <pre>
        <TmuxOutputLines output={"first\nwww.example.com"} />
      </pre>
    );

    expect(html).toContain("data-tmux-anchor-index=\"0\"");
    expect(html).toContain("data-tmux-anchor-index=\"1\"");
    expect(html).toContain("href=\"https://www.example.com/\"");
  });

  it("can omit scroll anchors in a secondary terminal pane", () => {
    const html = renderToStaticMarkup(
      <pre>
        <TmuxOutputLines anchors={false} output="Context" />
      </pre>
    );

    expect(html).not.toContain("data-tmux-anchor-index");
    expect(html).not.toContain("data-tmux-scroll-anchor");
  });
});
