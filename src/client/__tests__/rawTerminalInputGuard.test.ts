import { describe, expect, it, vi } from "vitest";

import { installRawTerminalInputGuard } from "../rawTerminalInputGuard.js";

function inputEvent(inputType: string, isComposing = false): Event {
  const event = new Event("beforeinput", { cancelable: true });
  Object.defineProperties(event, {
    inputType: { value: inputType },
    isComposing: { value: isComposing }
  });
  return event;
}

function keyEvent(key: string, keyCode: number): Event {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, {
    key: { value: key },
    keyCode: { value: keyCode }
  });
  return event;
}

function textareaTarget() {
  const target = new EventTarget() as EventTarget & Pick<HTMLTextAreaElement, "value" | "setSelectionRange">;
  target.value = "";
  target.setSelectionRange = vi.fn();
  return target as HTMLTextAreaElement;
}

describe("raw terminal mobile input guard", () => {
  it("clears committed composition text after xterm's deferred handler", async () => {
    const textarea = textareaTarget();
    const remove = installRawTerminalInputGuard(textarea, { input: vi.fn() });

    textarea.dispatchEvent(new Event("compositionstart"));
    textarea.value = "swiped word";
    textarea.dispatchEvent(new Event("compositionend"));
    expect(textarea.value).toBe("swiped word");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(textarea.value).toBe("");
    remove();
  });

  it("does not clear a newer composition", async () => {
    const textarea = textareaTarget();
    const remove = installRawTerminalInputGuard(textarea, { input: vi.fn() });

    textarea.dispatchEvent(new Event("compositionstart"));
    textarea.value = "first";
    textarea.dispatchEvent(new Event("compositionend"));
    textarea.dispatchEvent(new Event("compositionstart"));
    textarea.value = "next";

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(textarea.value).toBe("next");
    remove();
  });

  it("turns semantic IME deletes into one terminal delete", async () => {
    const input = vi.fn();
    const textarea = textareaTarget();
    textarea.value = "stale committed text";
    const remove = installRawTerminalInputGuard(textarea, { input });
    const event = inputEvent("deleteContentBackward");

    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(input).toHaveBeenCalledWith("\x7f");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(textarea.value).toBe("");
    remove();
  });

  it("does not duplicate physical delete keys handled by xterm", () => {
    const input = vi.fn();
    const textarea = textareaTarget();
    const remove = installRawTerminalInputGuard(textarea, { input });

    textarea.dispatchEvent(keyEvent("Backspace", 8));
    textarea.dispatchEvent(inputEvent("deleteContentBackward"));
    expect(input).not.toHaveBeenCalled();
    remove();
  });

  it("leaves active composition edits to xterm", () => {
    const input = vi.fn();
    const textarea = textareaTarget();
    const remove = installRawTerminalInputGuard(textarea, { input });
    textarea.dispatchEvent(new Event("compositionstart"));
    const event = inputEvent("deleteContentBackward", true);

    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(input).not.toHaveBeenCalled();
    remove();
  });
});
