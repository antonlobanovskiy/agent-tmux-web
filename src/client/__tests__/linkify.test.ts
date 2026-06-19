import { describe, expect, it } from "vitest";

import { linkifyText } from "../linkify.js";

describe("linkifyText", () => {
  it("turns http and https URLs into link parts", () => {
    expect(linkifyText("Open https://example.com/path?item=1 and http://example.org")).toEqual([
      { kind: "text", text: "Open " },
      { kind: "link", text: "https://example.com/path?item=1", href: "https://example.com/path?item=1" },
      { kind: "text", text: " and " },
      { kind: "link", text: "http://example.org", href: "http://example.org/" }
    ]);
  });

  it("normalizes www URLs to https links", () => {
    expect(linkifyText("Visit www.example.com/docs")).toEqual([
      { kind: "text", text: "Visit " },
      { kind: "link", text: "www.example.com/docs", href: "https://www.example.com/docs" }
    ]);
  });

  it("keeps trailing sentence punctuation outside the link", () => {
    expect(linkifyText("See (https://example.com/docs).")).toEqual([
      { kind: "text", text: "See (" },
      { kind: "link", text: "https://example.com/docs", href: "https://example.com/docs" },
      { kind: "text", text: ")." }
    ]);
  });

  it("keeps unsafe schemes as plain text", () => {
    expect(linkifyText("Do not link javascript:alert(1) or ftp://example.com")).toEqual([
      { kind: "text", text: "Do not link javascript:alert(1) or ftp://example.com" }
    ]);
  });
});
