import { describe, expect, it } from "vitest";

import {
  applyTextareaPaste,
  buildPastedPromptText,
  extractPastedImageFiles,
  formatUploadedFilesForPrompt,
  isMobileInputDevice,
  readClipboardImageFiles,
  shouldSubmitTextareaEnter
} from "../inputBehavior.js";

describe("input behavior", () => {
  it("splices large pasted text at the active textarea selection", () => {
    const pastedText = "x".repeat(120_000);
    const result = applyTextareaPaste("hello world", 6, 11, pastedText);

    expect(result.value).toBe(`hello ${pastedText}`);
    expect(result.selectionStart).toBe(6 + pastedText.length);
    expect(result.selectionEnd).toBe(result.selectionStart);
  });

  it("extracts image files from clipboard items and ignores non-image entries", () => {
    const image = new File(["image-data"], "", { type: "image/png", lastModified: 123 });
    const textFile = new File(["notes"], "notes.txt", { type: "text/plain" });

    const files = extractPastedImageFiles({
      files: [textFile],
      items: [
        { kind: "string", type: "text/plain", getAsFile: () => null },
        { kind: "file", type: "text/plain", getAsFile: () => textFile },
        { kind: "file", type: "image/png", getAsFile: () => image }
      ]
    });

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("pasted-image-1.png");
    expect(files[0].type).toBe("image/png");
    expect(files[0].lastModified).toBe(123);
  });

  it("falls back to clipboard files when item data has no images", () => {
    const image = new File(["jpeg-data"], "camera.jpg", { type: "image/jpeg" });
    const textFile = new File(["notes"], "notes.txt", { type: "text/plain" });

    const files = extractPastedImageFiles({
      files: [image, textFile],
      items: [{ kind: "string", type: "text/plain", getAsFile: () => null }]
    });

    expect(files).toEqual([image]);
  });

  it("reads screenshot blobs from the async Clipboard API", async () => {
    const image = new Blob(["png-data"], { type: "image/png" });
    const files = await readClipboardImageFiles({
      read: async () => [
        { types: ["text/plain"], getType: async () => new Blob(["text"]) },
        { types: ["image/png"], getType: async () => image }
      ]
    });

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("pasted-image-1.png");
    expect(files[0].type).toBe("image/png");
    expect(files[0].size).toBe(image.size);
  });

  it("preserves clipboard text before inserted uploaded file references", () => {
    const attachment = "Attached file: ~/.agent-tmux/attachments/2026-07-20/paste.png";
    expect(buildPastedPromptText("please review this", attachment))
      .toBe(`please review this\n\n${attachment}`);
    expect(buildPastedPromptText("", attachment)).toBe(attachment);
  });

  it("formats safe attachment references without internal server wording", () => {
    const attachment = formatUploadedFilesForPrompt([{
      name: "photo.png",
      reference: "~/.agent-tmux/attachments/2026-07-20/photo.png",
      size: 5,
      mimeType: "image/png"
    }]);
    expect(attachment).toBe("Attached file: ~/.agent-tmux/attachments/2026-07-20/photo.png");
    expect(attachment).not.toContain("/tmp/");
    expect(attachment).not.toContain("on server");
  });

  it("formats multiple safe attachment references", () => {
    const attachment = formatUploadedFilesForPrompt([
      {
        name: "first.png",
        reference: "~/.agent-tmux/attachments/2026-07-20/first.png",
        size: 5,
        mimeType: "image/png"
      },
      {
        name: "second.png",
        reference: "~/.agent-tmux/attachments/2026-07-20/second.png",
        size: 6,
        mimeType: "image/png"
      }
    ]);
    expect(attachment).toBe(
      "Attached files: ~/.agent-tmux/attachments/2026-07-20/first.png ~/.agent-tmux/attachments/2026-07-20/second.png"
    );
  });

  it("submits Enter on desktop textareas but keeps Shift+Enter for newlines", () => {
    const desktop = {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
      maxTouchPoints: 0,
      platform: "Linux x86_64"
    };

    expect(shouldSubmitTextareaEnter({ key: "Enter", shiftKey: false }, desktop)).toBe(true);
    expect(shouldSubmitTextareaEnter({ key: "Enter", shiftKey: true }, desktop)).toBe(false);
    expect(shouldSubmitTextareaEnter({ key: "a", shiftKey: false }, desktop)).toBe(false);
  });

  it("does not submit Enter from mobile textarea keyboards", () => {
    expect(shouldSubmitTextareaEnter(
      { key: "Enter", shiftKey: false },
      {
        userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
        maxTouchPoints: 5,
        platform: "Linux armv8l"
      }
    )).toBe(false);
    expect(shouldSubmitTextareaEnter(
      { key: "Enter", shiftKey: false },
      {
        maxTouchPoints: 5,
        platform: "iPhone",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
      }
    )).toBe(false);
  });

  it("treats iPadOS desktop user agents as mobile input devices", () => {
    expect(isMobileInputDevice({
      maxTouchPoints: 5,
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15"
    })).toBe(true);
  });
});
