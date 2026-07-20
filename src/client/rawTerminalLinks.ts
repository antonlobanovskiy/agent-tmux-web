import type { AndroidBridge } from "./androidBridge.js";

export type RawTerminalLinkEnvironment = {
  androidBridge?: Pick<AndroidBridge, "openExternalLink">;
  openWindow?: (url?: string | URL, target?: string, features?: string) => WindowProxy | null;
};

export function normalizeRawTerminalUrl(value: string): string | null {
  const trimmed = value.trim();
  const candidate = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function openRawTerminalLink(value: string, environment: RawTerminalLinkEnvironment = {}): boolean {
  const url = normalizeRawTerminalUrl(value);
  if (!url) {
    return false;
  }

  const androidBridge = environment.androidBridge
    ?? (typeof window === "undefined" ? undefined : window.AgentTmuxAndroid);
  if (typeof androidBridge?.openExternalLink === "function") {
    try {
      return androidBridge.openExternalLink(url) !== false;
    } catch {
      return false;
    }
  }

  const openWindow = environment.openWindow
    ?? (typeof window === "undefined" ? undefined : window.open.bind(window));
  if (!openWindow) {
    return false;
  }
  try {
    openWindow(url, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
