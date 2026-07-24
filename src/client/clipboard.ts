import type { AndroidBridge } from "./androidBridge.js";

export async function writeClipboardText(text: string): Promise<void> {
  if (writeAndroidClipboardText(text)) {
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some Android WebViews deny the async Clipboard API on HTTP origins.
    }
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard copy failed");
  }

  const previouslyFocused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.select();
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
    if (previouslyFocused?.isConnected) {
      previouslyFocused.focus({ preventScroll: true });
    }
  }
  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

function writeAndroidClipboardText(text: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const bridge: AndroidBridge | undefined = window.AgentTmuxAndroid;
  if (typeof bridge?.writeClipboard !== "function") {
    return false;
  }
  try {
    return bridge.writeClipboard(text) !== false;
  } catch {
    return false;
  }
}
