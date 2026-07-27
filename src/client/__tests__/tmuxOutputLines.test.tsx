import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TmuxOutputLines } from "../tmuxOutputLines.js";

describe("TmuxOutputLines", () => {
  it("renders URLs as clickable links", () => {
    const html = renderToStaticMarkup(<pre><TmuxOutputLines output="Open https://example.com/docs." /></pre>);
    expect(html).toContain("<a href=\"https://example.com/docs\"");
    expect(html).toContain("target=\"_blank\"");
    expect(html).toContain("rel=\"noreferrer noopener\"");
  });

  it("keeps scroll anchors on stream lines and omits them from details", () => {
    const stream = renderToStaticMarkup(<pre><TmuxOutputLines output={"first\nsecond"} /></pre>);
    const details = renderToStaticMarkup(<pre><TmuxOutputLines anchors={false} output="Context" /></pre>);
    expect(stream).toContain("data-tmux-anchor-index=\"0\"");
    expect(stream).toContain("data-tmux-anchor-index=\"1\"");
    expect(details).not.toContain("data-tmux-anchor-index");
    expect(details).not.toContain("data-tmux-scroll-anchor");
  });
});
