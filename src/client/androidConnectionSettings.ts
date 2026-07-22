import type { AndroidBridge } from "./androidBridge.js";

function currentAndroidBridge(): AndroidBridge | undefined {
  return typeof window === "undefined" ? undefined : window.AgentTmuxAndroid;
}

export function hasAndroidConnectionSettings(
  bridge: AndroidBridge | undefined = currentAndroidBridge()
): boolean {
  return typeof bridge?.openConnectionSettings === "function";
}

export function openAndroidConnectionSettings(
  bridge: AndroidBridge | undefined = currentAndroidBridge()
): boolean {
  if (!hasAndroidConnectionSettings(bridge)) {
    return false;
  }
  try {
    bridge?.openConnectionSettings?.();
    return true;
  } catch {
    return false;
  }
}
