import { describe, expect, it, vi } from "vitest";

import { createRawTerminalSelectionHandler } from "../rawTerminalSelection.js";

describe("raw terminal selection", () => {
  it("copies changed selections and ignores empty or repeated values", async () => {
    let selection = "";
    const writeClipboard = vi.fn(async () => undefined);
    const onCopied = vi.fn();
    const handler = createRawTerminalSelectionHandler({
      readSelection: () => selection,
      writeClipboard,
      onCopied
    });

    handler();
    selection = "first selection";
    handler();
    handler();
    await Promise.resolve();
    expect(writeClipboard).toHaveBeenCalledTimes(1);
    expect(writeClipboard).toHaveBeenCalledWith("first selection");
    expect(onCopied).toHaveBeenCalledTimes(1);

    selection = "";
    handler();
    selection = "first selection";
    handler();
    await Promise.resolve();
    expect(writeClipboard).toHaveBeenCalledTimes(2);
  });

  it("reports clipboard failures without throwing from the xterm event", async () => {
    const onError = vi.fn();
    const handler = createRawTerminalSelectionHandler({
      readSelection: () => "selected text",
      writeClipboard: async () => { throw new Error("denied"); },
      onError
    });

    expect(() => handler()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith("Clipboard copy failed");
  });
});
