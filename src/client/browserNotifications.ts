export type BrowserNotificationSnapshot = {
  supported: boolean;
  secureContext: boolean;
  permission: NotificationPermission;
  androidBridge: boolean;
  androidNotificationsEnabled: boolean;
};

export type BrowserNotificationAvailability =
  | { available: true }
  | { available: false; message: string };

type AndroidNotificationBridge = {
  notificationsEnabled?: () => boolean;
  notify?: (title: string, body: string, tag: string) => void;
  notifyForSession?: (title: string, body: string, tag: string, tmuxSession: string) => void;
  setWatchPollingEnabled?: (enabled: boolean) => void;
};

export type AgentNotificationOptions = {
  tmuxSession?: string;
};

declare global {
  interface Window {
    AgentTmuxAndroid?: AndroidNotificationBridge;
  }
}

export function getBrowserNotificationSnapshot(): BrowserNotificationSnapshot {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const androidBridge = hasAndroidNotificationBridge();

  return {
    supported,
    secureContext: typeof window !== "undefined" && window.isSecureContext,
    permission: supported ? Notification.permission : "default",
    androidBridge,
    androidNotificationsEnabled: androidBridge ? androidNotificationsEnabled() : false
  };
}

export function getBrowserNotificationAvailability(snapshot = getBrowserNotificationSnapshot()): BrowserNotificationAvailability {
  if (snapshot.androidBridge) {
    return snapshot.androidNotificationsEnabled
      ? { available: true }
      : { available: false, message: "app notifications blocked in Android settings" };
  }

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
  if (snapshot.androidBridge) {
    return getBrowserNotificationAvailability(snapshot).available;
  }
  return getBrowserNotificationAvailability(snapshot).available && snapshot.permission === "granted";
}

export function canShowWebSocketTaskNotifications(snapshot = getBrowserNotificationSnapshot()): boolean {
  if (snapshot.androidBridge) {
    return false;
  }
  return getBrowserNotificationAvailability(snapshot).available && snapshot.permission === "granted";
}

export function showAgentNotification(title: string, body: string, tag: string, options: AgentNotificationOptions = {}): void {
  if (!canShowBrowserNotifications()) {
    return;
  }

  if (hasAndroidNotificationBridge()) {
    try {
      if (options.tmuxSession && typeof window.AgentTmuxAndroid?.notifyForSession === "function") {
        window.AgentTmuxAndroid.notifyForSession(title, body, tag, options.tmuxSession);
      } else {
        window.AgentTmuxAndroid?.notify?.(title, body, tag);
      }
    } catch {
      // The native bridge can disappear if the WebView is being torn down.
    }
    return;
  }

  try {
    new Notification(title, { body, tag });
  } catch {
    // Browsers can still reject notifications after permission changes.
  }
}

export function setAndroidWatchPollingEnabled(enabled: boolean): void {
  if (!hasAndroidNotificationBridge()) {
    return;
  }

  try {
    window.AgentTmuxAndroid?.setWatchPollingEnabled?.(enabled);
  } catch {
    // The native bridge can disappear if the WebView is being torn down.
  }
}

function hasAndroidNotificationBridge(): boolean {
  return typeof window !== "undefined" && typeof window.AgentTmuxAndroid?.notify === "function";
}

function androidNotificationsEnabled(): boolean {
  try {
    return window.AgentTmuxAndroid?.notificationsEnabled?.() ?? true;
  } catch {
    return false;
  }
}
