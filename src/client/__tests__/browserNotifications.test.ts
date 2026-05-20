import { afterEach, describe, expect, it } from "vitest";

import { canShowWebSocketTaskNotifications, getBrowserNotificationAvailability, showAgentNotification, type BrowserNotificationSnapshot } from "../browserNotifications.js";

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow
  });
});

function snapshot(overrides: Partial<BrowserNotificationSnapshot>): BrowserNotificationSnapshot {
  return {
    supported: true,
    secureContext: true,
    permission: "default",
    androidBridge: false,
    androidNotificationsEnabled: false,
    ...overrides
  };
}

describe("browser notification availability", () => {
  it("reports unsupported browsers", () => {
    expect(getBrowserNotificationAvailability(snapshot({ supported: false }))).toEqual({
      available: false,
      message: "browser notifications unavailable"
    });
  });

  it("requires a secure browser context", () => {
    expect(getBrowserNotificationAvailability(snapshot({ secureContext: false }))).toEqual({
      available: false,
      message: "notifications need HTTPS or localhost"
    });
  });

  it("reports denied site permissions", () => {
    expect(getBrowserNotificationAvailability(snapshot({ permission: "denied" }))).toEqual({
      available: false,
      message: "notifications blocked in browser settings"
    });
  });

  it("allows notification requests in secure contexts", () => {
    expect(getBrowserNotificationAvailability(snapshot({ permission: "default" }))).toEqual({ available: true });
    expect(getBrowserNotificationAvailability(snapshot({ permission: "granted" }))).toEqual({ available: true });
  });

  it("uses the Android bridge before browser permission rules", () => {
    expect(getBrowserNotificationAvailability(snapshot({
      androidBridge: true,
      androidNotificationsEnabled: true,
      secureContext: false,
      supported: false
    }))).toEqual({ available: true });
  });

  it("reports blocked native Android notifications", () => {
    expect(getBrowserNotificationAvailability(snapshot({
      androidBridge: true,
      androidNotificationsEnabled: false
    }))).toEqual({
      available: false,
      message: "app notifications blocked in Android settings"
    });
  });

  it("uses browser WebSocket task notifications only outside the Android wrapper", () => {
    expect(canShowWebSocketTaskNotifications(snapshot({
      permission: "granted"
    }))).toBe(true);
    expect(canShowWebSocketTaskNotifications(snapshot({
      permission: "default"
    }))).toBe(false);
    expect(canShowWebSocketTaskNotifications(snapshot({
      androidBridge: true,
      androidNotificationsEnabled: true,
      permission: "granted"
    }))).toBe(false);
  });

  it("passes the tmux session target to the Android bridge", () => {
    const calls: unknown[][] = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        AgentTmuxAndroid: {
          notificationsEnabled: () => true,
          notify: () => {
            throw new Error("session-specific notifications should use notifyForSession");
          },
          notifyForSession: (...args: unknown[]) => calls.push(args)
        },
        isSecureContext: false
      }
    });

    showAgentNotification("agent-demo tab is waiting", "Claude finished.", "agent-tmux-web-agent-demo", {
      tmuxSession: "agent-demo"
    });

    expect(calls).toEqual([[
      "agent-demo tab is waiting",
      "Claude finished.",
      "agent-tmux-web-agent-demo",
      "agent-demo"
    ]]);
  });
});
