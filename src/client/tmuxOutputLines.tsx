import { memo } from "react";

import { LinkifiedText } from "./LinkifiedText.js";

export const TmuxOutputLines = memo(function TmuxOutputLines({ output, anchors = true }: { output: string; anchors?: boolean }) {
  return output.split(/\r?\n/).map((line, index) => (
    <span
      className="tmux-output-line"
      data-tmux-anchor-index={anchors ? index : undefined}
      data-tmux-scroll-anchor={anchors ? "" : undefined}
      key={`${index}-${line}`}
    >
      <LinkifiedText text={line || "\u00a0"} />
    </span>
  ));
});
