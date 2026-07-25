package com.agenttmux.web;

import static android.content.Context.MODE_PRIVATE;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class WatchPollingService extends Service {
    private static final int FOREGROUND_NOTIFICATION_ID = 6174;
    private static final long POLL_INTERVAL_MS = 8000;
    private static final String PREFS_NAME = "agent_tmux_web";
    private static final String PREF_SERVER_URL = "server_url";
    private static final String PREF_AUTH_TOKEN = "auth_token";
    private static final String PREF_WATCH_POLLING_ENABLED = "watch_polling_enabled";
    private static final String PREF_WATCH_LAST_EVENT_ID = "watch_last_event_id";
    private static final String PREF_WATCH_GENERATION = "watch_generation";
    private static final Object BASELINE_LOCK = new Object();

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable pollRunnable = this::poll;
    private volatile boolean running;
    private volatile boolean polling;
    private SharedPreferences preferences;

    public static void setEnabled(Context context, boolean enabled) {
        synchronized (BASELINE_LOCK) {
            SharedPreferences prefs = preferences(context);
            boolean wasEnabled = prefs.getBoolean(PREF_WATCH_POLLING_ENABLED, false);
            SharedPreferences.Editor editor = prefs.edit()
                .putBoolean(PREF_WATCH_POLLING_ENABLED, enabled);
            if (enabled != wasEnabled) {
                editor.putLong(PREF_WATCH_GENERATION, prefs.getLong(PREF_WATCH_GENERATION, 0) + 1);
            }
            if (enabled) {
                if (!wasEnabled) {
                    editor.remove(PREF_WATCH_LAST_EVENT_ID);
                }
            } else {
                editor.remove(PREF_WATCH_LAST_EVENT_ID);
            }
            editor.apply();
        }
        if (enabled) {
            start(context);
        } else {
            stop(context);
        }
    }

    public static boolean isEnabled(Context context) {
        return preferences(context).getBoolean(PREF_WATCH_POLLING_ENABLED, false);
    }

    public static void startIfEnabled(Context context) {
        if (isEnabled(context)) {
            start(context);
        }
    }

    public static void updateConnection(Context context, String serverUrl, String authToken) {
        synchronized (BASELINE_LOCK) {
            SharedPreferences prefs = preferences(context);
            prefs.edit()
                .putString(PREF_SERVER_URL, normalizeServerUrl(serverUrl))
                .putString(PREF_AUTH_TOKEN, authToken == null ? "" : authToken.trim())
                .remove(PREF_WATCH_LAST_EVENT_ID)
                .putLong(PREF_WATCH_GENERATION, prefs.getLong(PREF_WATCH_GENERATION, 0) + 1)
                .apply();
        }
    }

    private static void start(Context context) {
        Intent intent = new Intent(context, WatchPollingService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    private static void stop(Context context) {
        context.stopService(new Intent(context, WatchPollingService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        preferences = preferences(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!isEnabled(this) || !AgentNotifications.notificationsEnabled(this) || serverUrl().isEmpty()) {
            running = false;
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(FOREGROUND_NOTIFICATION_ID, AgentNotifications.buildWatchServiceNotification(this));
        running = true;
        schedule(1000);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacks(pollRunnable);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void schedule(long delayMs) {
        if (!running) {
            return;
        }
        handler.removeCallbacks(pollRunnable);
        handler.postDelayed(pollRunnable, delayMs);
    }

    private void poll() {
        if (polling) {
            schedule(POLL_INTERVAL_MS);
            return;
        }

        polling = true;
        new Thread(() -> {
            try {
                pollInBackground();
            } finally {
                polling = false;
                schedule(POLL_INTERVAL_MS);
            }
        }, "agent-tmux-watch-poll").start();
    }

    private void pollInBackground() {
        if (!isEnabled(this) || !AgentNotifications.notificationsEnabled(this)) {
            running = false;
            stopSelf();
            return;
        }

        PollSnapshot snapshot = pollSnapshot();
        WatchPollingLogic.PollDecision decision = WatchPollingLogic.advance(
            snapshot.lastEventId,
            snapshot.needsBaseline,
            fetchEvents(snapshot)
        );
        synchronized (BASELINE_LOCK) {
            if (!decision.shouldPersist || !WatchPollingLogic.isCurrentGeneration(snapshot.generation, preferences.getLong(PREF_WATCH_GENERATION, 0))) {
                return;
            }

            for (WatchPollingLogic.WatchEvent event : decision.events) {
                AgentNotifications.postTaskNotification(
                    this,
                    NotificationTarget.title(event.session, event.state),
                    NotificationTarget.body(event.label, event.session, event.state),
                    NotificationTarget.tag(event.session),
                    event.session
                );
            }

            preferences.edit()
                .putLong(PREF_WATCH_LAST_EVENT_ID, decision.nextEventId)
                .apply();
        }
    }

    private PollSnapshot pollSnapshot() {
        synchronized (BASELINE_LOCK) {
            return new PollSnapshot(
                !preferences.contains(PREF_WATCH_LAST_EVENT_ID),
                preferences.getLong(PREF_WATCH_LAST_EVENT_ID, 0),
                preferences.getLong(PREF_WATCH_GENERATION, 0),
                serverUrl(),
                authToken()
            );
        }
    }

    private WatchPollingLogic.PollResult fetchEvents(PollSnapshot snapshot) {
        HttpURLConnection connection = null;
        try {
            Uri uri = Uri.parse(snapshot.serverUrl + "/api/tmux/watch/events")
                .buildUpon()
                .appendQueryParameter("since", String.valueOf(snapshot.lastEventId))
                .build();
            connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "AgentTmuxAndroidWatch/" + BuildConfig.VERSION_NAME);
            connection.setRequestProperty("x-agent-tmux-web-client", "android-watch");
            if (!snapshot.authToken.isEmpty()) {
                connection.setRequestProperty("x-agent-tmux-web-token", snapshot.authToken);
            }

            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                return WatchPollingLogic.parseResponse(code, "", snapshot.lastEventId);
            }
            return WatchPollingLogic.parseResponse(code, readAll(connection.getInputStream()), snapshot.lastEventId);
        } catch (Exception error) {
            return WatchPollingLogic.failure(snapshot.lastEventId);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String serverUrl() {
        String stored = preferences.getString(PREF_SERVER_URL, "");
        if (stored == null || stored.trim().isEmpty()) {
            return normalizeServerUrl(BuildConfig.DEFAULT_SERVER_URL);
        }
        return normalizeServerUrl(stored);
    }

    private String authToken() {
        String stored = preferences.getString(PREF_AUTH_TOKEN, "");
        if (stored == null || stored.trim().isEmpty()) {
            return BuildConfig.DEFAULT_AUTH_TOKEN.trim();
        }
        return stored.trim();
    }

    private static String readAll(InputStream inputStream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private static String normalizeServerUrl(String value) {
        if (value == null) {
            return "";
        }

        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return "";
        }

        if (!trimmed.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*")) {
            trimmed = "http://" + trimmed;
        }

        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    }

    private static final class PollSnapshot {
        final boolean needsBaseline;
        final long lastEventId;
        final long generation;
        final String serverUrl;
        final String authToken;

        PollSnapshot(boolean needsBaseline, long lastEventId, long generation, String serverUrl, String authToken) {
            this.needsBaseline = needsBaseline;
            this.lastEventId = lastEventId;
            this.generation = generation;
            this.serverUrl = serverUrl;
            this.authToken = authToken;
        }
    }

}
