export type BrowserNotificationSnapshot = {
  supported: boolean;
  secureContext: boolean;
  permission: NotificationPermission;
};

export type BrowserNotificationAvailability =
  | { available: true }
  | { available: false; message: string };

export function getBrowserNotificationSnapshot(): BrowserNotificationSnapshot {
  const supported = typeof window !== "undefined" && "Notification" in window;

  return {
    supported,
    secureContext: typeof window !== "undefined" && window.isSecureContext,
    permission: supported ? Notification.permission : "default"
  };
}

export function getBrowserNotificationAvailability(snapshot = getBrowserNotificationSnapshot()): BrowserNotificationAvailability {
  if (!snapshot.supported) {
    return { available: false, message: "browser notifications unavailable" };
  }

  if (!snapshot.secureContext) {
    return { available: false, message: "notifications need HTTPS or localhost" };
  }

  if (snapshot.permission === "denied") {
    return { available: false, message: "notifications blocked in browser settings" };
  }

  return { available: true };
}

export function canShowBrowserNotifications(): boolean {
  const snapshot = getBrowserNotificationSnapshot();
  return getBrowserNotificationAvailability(snapshot).available && snapshot.permission === "granted";
}
