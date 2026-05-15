package com.agenttmux.web;

import android.app.Activity;
import android.webkit.JavascriptInterface;

public final class AgentNotificationBridge {
    private final Activity activity;

    public AgentNotificationBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean notificationsEnabled() {
        return AgentNotifications.notificationsEnabled(activity);
    }

    @JavascriptInterface
    public void notify(String title, String body, String tag) {
        if (!notificationsEnabled()) {
            return;
        }

        activity.runOnUiThread(() -> postNotification(
            clean(title, "Agent Tmux"),
            clean(body, "Task is waiting for input."),
            clean(tag, "agent-tmux-web")
        ));
    }

    @JavascriptInterface
    public void setWatchPollingEnabled(boolean enabled) {
        activity.runOnUiThread(() -> {
            if (enabled && notificationsEnabled()) {
                WatchPollingService.setEnabled(activity, true);
            } else {
                WatchPollingService.setEnabled(activity, false);
            }
        });
    }

    private void postNotification(String title, String body, String tag) {
        AgentNotifications.postTaskNotification(activity, title, body, tag);
    }

    private static String clean(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}
