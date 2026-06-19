import { LinkifiedText } from "./LinkifiedText.js";

export function TmuxOutputLines({ output }: { output: string }) {
  return output.split(/\r?\n/).map((line, index) => (
    <span
      className="tmux-output-line"
      data-tmux-anchor-index={index}
      data-tmux-scroll-anchor=""
      key={`${index}-${line}`}
    >
      <LinkifiedText text={line || "\u00a0"} />
    </span>
  ));
}
