package com.agenttmux.web;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public final class AgentNotificationBridge {
    @FunctionalInterface
    interface UiThreadRunner {
        void run(Runnable action);
    }

    private final Activity activity;
    private final UiThreadRunner uiThreadRunner;
    private final Runnable openConnectionSettings;

    public AgentNotificationBridge(Activity activity, Runnable openConnectionSettings) {
        this(activity, activity::runOnUiThread, openConnectionSettings);
    }

    AgentNotificationBridge(
        Activity activity,
        UiThreadRunner uiThreadRunner,
        Runnable openConnectionSettings
    ) {
        this.activity = activity;
        this.uiThreadRunner = uiThreadRunner;
        this.openConnectionSettings = openConnectionSettings;
    }

    @JavascriptInterface
    public void openConnectionSettings() {
        uiThreadRunner.run(openConnectionSettings);
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
            clean(body, "A tmux session needs input."),
            clean(tag, "agent-tmux-web"),
            clean(tmuxSession, "")
        ));
    }

    @JavascriptInterface
    public void setWatchPollingEnabled(boolean enabled) {
        activity.runOnUiThread(() -> {
            if (!enabled) {
                WatchPollingService.setEnabled(activity, false);
            } else if (notificationsEnabled()) {
                WatchPollingService.setEnabled(activity, true);
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

    @JavascriptInterface
    public boolean openExternalLink(String url) {
        String safeUrl = ExternalLinkPolicy.normalizeHttpWebLink(url);
        if (safeUrl == null || activityUnavailable()) {
            return false;
        }
        activity.runOnUiThread(() -> {
            if (activityUnavailable()) {
                return;
            }
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(safeUrl));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                activity.startActivity(intent);
            } catch (ActivityNotFoundException | SecurityException error) {
                Toast.makeText(activity, "No app can open this link", Toast.LENGTH_SHORT).show();
            }
        });
        return true;
    }

    private boolean activityUnavailable() {
        return activity.isFinishing()
            || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1
                && activity.isDestroyed());
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
