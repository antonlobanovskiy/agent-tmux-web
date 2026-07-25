type RawTerminalInputTarget = {
  input(data: string): void;
};

export function installRawTerminalInputGuard(
  textarea: HTMLTextAreaElement | undefined,
  terminal: RawTerminalInputTarget
): () => void {
  if (!textarea) {
    return () => {};
  }

  let composing = false;
  let compositionGeneration = 0;
  let physicalDeletePending = false;
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  let physicalDeleteTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleTextareaCleanup = () => {
    const generation = compositionGeneration;
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
    }
    cleanupTimer = setTimeout(() => {
      cleanupTimer = null;
      if (composing || compositionGeneration !== generation) {
        return;
      }
      textarea.value = "";
      textarea.setSelectionRange?.(0, 0);
    }, 0);
  };

  const handleCompositionStart = () => {
    composing = true;
    compositionGeneration += 1;
  };
  const handleCompositionEnd = () => {
    composing = false;
    scheduleTextareaCleanup();
  };
  const handleInput = (event: Event) => {
    if (!(event as InputEvent).isComposing && !composing) {
      scheduleTextareaCleanup();
    }
  };
  const handleKeyDown = (event: Event) => {
    const keyEvent = event as KeyboardEvent;
    if ((keyEvent.key === "Backspace" || keyEvent.key === "Delete") && keyEvent.keyCode !== 229) {
      physicalDeletePending = true;
      if (physicalDeleteTimer !== null) {
        clearTimeout(physicalDeleteTimer);
      }
      physicalDeleteTimer = setTimeout(() => {
        physicalDeleteTimer = null;
        physicalDeletePending = false;
      }, 0);
    }
  };
  const handleBeforeInput = (event: Event) => {
    const inputEvent = event as InputEvent;
    if (composing || inputEvent.isComposing) {
      return;
    }

    const data = inputEvent.inputType === "deleteContentBackward"
      ? "\x7f"
      : inputEvent.inputType === "deleteContentForward"
        ? "\x1b[3~"
        : "";
    if (!data) {
      return;
    }

    event.preventDefault();
    if (!physicalDeletePending) {
      terminal.input(data);
    }
    scheduleTextareaCleanup();
  };

  textarea.addEventListener("keydown", handleKeyDown, { capture: true });
  textarea.addEventListener("beforeinput", handleBeforeInput);
  textarea.addEventListener("compositionstart", handleCompositionStart);
  textarea.addEventListener("compositionend", handleCompositionEnd);
  textarea.addEventListener("input", handleInput);

  return () => {
    textarea.removeEventListener("keydown", handleKeyDown, { capture: true });
    textarea.removeEventListener("beforeinput", handleBeforeInput);
    textarea.removeEventListener("compositionstart", handleCompositionStart);
    textarea.removeEventListener("compositionend", handleCompositionEnd);
    textarea.removeEventListener("input", handleInput);
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
    }
    if (physicalDeleteTimer !== null) {
      clearTimeout(physicalDeleteTimer);
    }
  };
}
