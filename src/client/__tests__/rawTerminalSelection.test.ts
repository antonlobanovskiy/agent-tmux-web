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
    await vi.waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(1));
    expect(writeClipboard).toHaveBeenCalledWith("first selection");
    await vi.waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));

    selection = "";
    handler();
    selection = "first selection";
    handler();
    await vi.waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(2));
  });

  it("reports clipboard failures without throwing from the xterm event", async () => {
    const onError = vi.fn();
    const handler = createRawTerminalSelectionHandler({
      readSelection: () => "selected text",
      writeClipboard: async () => { throw new Error("denied"); },
      onError
    });

    expect(() => handler()).not.toThrow();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("Clipboard copy failed"));
  });

  it("reports synchronous clipboard failures and continues with later selections", async () => {
    let selection = "first selection";
    const onError = vi.fn();
    const writeClipboard = vi.fn((text: string) => {
      if (text === "first selection") {
        throw new Error("denied");
      }
      return Promise.resolve();
    });
    const handler = createRawTerminalSelectionHandler({
      readSelection: () => selection,
      writeClipboard,
      onError
    });

    expect(() => handler()).not.toThrow();
    selection = "second selection";
    expect(() => handler()).not.toThrow();

    await vi.waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(2));
    expect(writeClipboard.mock.calls.map(([text]) => text)).toEqual([
      "first selection",
      "second selection"
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Clipboard copy failed");
  });

  it("serializes overlapping selection writes in event order", async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstWrite = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const secondWrite = new Promise<void>((resolve) => { resolveSecond = resolve; });
    const executionOrder: string[] = [];
    let selection = "first selection";
    const writeClipboard = vi.fn((text: string) => {
      executionOrder.push(`start:${text}`);
      const write = text === "first selection" ? firstWrite : secondWrite;
      return write.then(() => { executionOrder.push(`finish:${text}`); });
    });
    const handler = createRawTerminalSelectionHandler({
      readSelection: () => selection,
      writeClipboard
    });

    handler();
    selection = "second selection";
    handler();

    await vi.waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(1));
    expect(writeClipboard).toHaveBeenCalledWith("first selection");
    expect(executionOrder).toEqual(["start:first selection"]);

    resolveSecond();
    await Promise.resolve();
    expect(writeClipboard).toHaveBeenCalledTimes(1);
    expect(executionOrder).toEqual(["start:first selection"]);

    resolveFirst();
    await vi.waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(executionOrder).toEqual([
      "start:first selection",
      "finish:first selection",
      "start:second selection",
      "finish:second selection"
    ]));
  });
});
