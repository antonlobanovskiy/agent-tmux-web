import { describe, expect, it } from "vitest";

import { getBrowserNotificationAvailability, type BrowserNotificationSnapshot } from "../browserNotifications.js";

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
});
