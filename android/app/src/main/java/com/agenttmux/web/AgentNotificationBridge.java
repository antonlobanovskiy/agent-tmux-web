package com.agenttmux.web;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
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
        notifyForSession(title, body, tag, "");
    }

    @JavascriptInterface
    public void notifyForSession(String title, String body, String tag, String tmuxSession) {
        if (!notificationsEnabled()) {
            return;
        }

        activity.runOnUiThread(() -> postNotification(
            clean(title, "Agent Tmux"),
            clean(body, "Task is waiting for input."),
            clean(tag, "agent-tmux-web"),
            clean(tmuxSession, "")
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

    @JavascriptInterface
    public boolean writeClipboard(String text) {
        String safeText = text == null ? "" : text;
        try {
            activity.runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard != null) {
                    clipboard.setPrimaryClip(ClipData.newPlainText("Agent Tmux", safeText));
                }
            });
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    private void postNotification(String title, String body, String tag, String tmuxSession) {
        AgentNotifications.postTaskNotification(activity, title, body, tag, tmuxSession);
    }

    private static String clean(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}
