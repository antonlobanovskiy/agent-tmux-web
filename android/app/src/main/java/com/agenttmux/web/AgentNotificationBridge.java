package com.agenttmux.web;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

public final class AgentNotificationBridge {
    private static final String CHANNEL_ID = "agent_tmux_tasks";
    private static final String CHANNEL_NAME = "Agent task status";

    private final Activity activity;
    private final NotificationManager notificationManager;

    public AgentNotificationBridge(Activity activity) {
        this.activity = activity;
        this.notificationManager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        createChannel();
    }

    @JavascriptInterface
    public boolean notificationsEnabled() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && notificationManager != null) {
            return notificationManager.areNotificationsEnabled();
        }

        return true;
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

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || notificationManager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Notifications when a tmux agent is waiting for input.");
        notificationManager.createNotificationChannel(channel);
    }

    private void postNotification(String title, String body, String tag) {
        if (notificationManager == null) {
            return;
        }

        Intent intent = new Intent(activity, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            activity,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(activity, CHANNEL_ID)
            : new Notification.Builder(activity);

        builder
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setShowWhen(true);

        notificationManager.notify(tag, Math.abs(tag.hashCode()), builder.build());
    }

    private static String clean(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}
