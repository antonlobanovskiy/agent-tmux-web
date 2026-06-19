import { Fragment } from "react";

import { linkifyText } from "./linkify.js";

export function LinkifiedText({ text }: { text: string }) {
  return linkifyText(text).map((part, index) => part.kind === "link" ? (
    <a href={part.href} key={`${part.href}-${index}`} rel="noreferrer noopener" target="_blank">
      {part.text}
    </a>
  ) : (
    <Fragment key={`${part.text}-${index}`}>{part.text}</Fragment>
  ));
}
