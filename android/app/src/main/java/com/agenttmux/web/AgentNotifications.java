package com.agenttmux.web;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

final class AgentNotifications {
    private static final String TASK_CHANNEL_ID = "agent_tmux_tasks";
    private static final String TASK_CHANNEL_NAME = "Agent task status";
    private static final String WATCH_CHANNEL_ID = "agent_tmux_watch";
    private static final String WATCH_CHANNEL_NAME = "Agent Tmux watch";

    private AgentNotifications() {
    }

    static boolean notificationsEnabled(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        NotificationManager notificationManager = notificationManager(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && notificationManager != null) {
            return notificationManager.areNotificationsEnabled();
        }

        return true;
    }

    static void postTaskNotification(Context context, String title, String body, String tag) {
        postTaskNotification(context, title, body, tag, "");
    }

    static void postTaskNotification(Context context, String title, String body, String tag, String tmuxSession) {
        if (!notificationsEnabled(context)) {
            return;
        }

        createTaskChannel(context);
        NotificationManager notificationManager = notificationManager(context);
        if (notificationManager == null) {
            return;
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, TASK_CHANNEL_ID)
            : new Notification.Builder(context);
        String safeBody = clean(body, "Task is waiting for input.");
        String safeTag = clean(tag, "agent-tmux-web");
        String safeSession = NotificationTarget.clean(tmuxSession);

        builder
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(clean(title, "Agent Tmux"))
            .setContentText(safeBody)
            .setStyle(new Notification.BigTextStyle().bigText(safeBody))
            .setContentIntent(mainActivityIntent(context, safeSession, NotificationTarget.requestCode(safeTag, safeSession)))
            .setAutoCancel(true)
            .setShowWhen(true);

        notificationManager.notify(safeTag, Math.abs(safeTag.hashCode()), builder.build());
    }

    static Notification buildWatchServiceNotification(Context context) {
        createWatchChannel(context);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, WATCH_CHANNEL_ID)
            : new Notification.Builder(context);

        return builder
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Agent Tmux notifications")
            .setContentText("Watching tmux sessions for completed tasks.")
            .setContentIntent(mainActivityIntent(context, "", 0))
            .setOngoing(true)
            .setShowWhen(false)
            .build();
    }

    private static void createTaskChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager = notificationManager(context);
        if (notificationManager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            TASK_CHANNEL_ID,
            TASK_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Notifications when a tmux agent is waiting for input.");
        notificationManager.createNotificationChannel(channel);
    }

    private static void createWatchChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager = notificationManager(context);
        if (notificationManager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            WATCH_CHANNEL_ID,
            WATCH_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps Agent Tmux completion checks running in the background.");
        notificationManager.createNotificationChannel(channel);
    }

    private static PendingIntent mainActivityIntent(Context context, String tmuxSession, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (!tmuxSession.isEmpty()) {
            intent.putExtra(NotificationTarget.EXTRA_TMUX_SESSION, tmuxSession);
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static NotificationManager notificationManager(Context context) {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private static String clean(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}
