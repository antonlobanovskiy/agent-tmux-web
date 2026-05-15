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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

public final class WatchPollingService extends Service {
    private static final int FOREGROUND_NOTIFICATION_ID = 6174;
    private static final long POLL_INTERVAL_MS = 8000;
    private static final String PREFS_NAME = "agent_tmux_web";
    private static final String PREF_SERVER_URL = "server_url";
    private static final String PREF_AUTH_TOKEN = "auth_token";
    private static final String PREF_WATCH_POLLING_ENABLED = "watch_polling_enabled";
    private static final String PREF_WATCH_LAST_EVENT_ID = "watch_last_event_id";
    private static final String PREF_WATCH_ENABLED_AT_MS = "watch_enabled_at_ms";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable pollRunnable = this::poll;
    private volatile boolean running;
    private volatile boolean polling;
    private SharedPreferences preferences;

    public static void setEnabled(Context context, boolean enabled) {
        SharedPreferences.Editor editor = preferences(context).edit()
            .putBoolean(PREF_WATCH_POLLING_ENABLED, enabled);
        if (enabled) {
            editor.putLong(PREF_WATCH_ENABLED_AT_MS, System.currentTimeMillis());
        } else {
            editor.remove(PREF_WATCH_ENABLED_AT_MS);
        }
        editor.apply();
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
            ensureEnabledAt(context);
            start(context);
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

        long lastEventId = preferences.getLong(PREF_WATCH_LAST_EVENT_ID, 0);
        boolean initialized = preferences.contains(PREF_WATCH_LAST_EVENT_ID);
        long enabledAtMs = preferences.getLong(PREF_WATCH_ENABLED_AT_MS, System.currentTimeMillis());
        PollResult result = fetchEvents(lastEventId);
        long nextEventId = Math.max(lastEventId, result.latestEventId);

        for (WatchEvent event : result.events) {
            if (event.id <= lastEventId) {
                continue;
            }
            nextEventId = Math.max(nextEventId, event.id);
            if (!initialized && event.finishedAtMs < enabledAtMs) {
                continue;
            }
            AgentNotifications.postTaskNotification(
                this,
                event.session + " is waiting",
                event.label + " finished and is waiting for input.",
                "agent-tmux-watch-" + event.session
            );
        }

        preferences.edit()
            .putLong(PREF_WATCH_LAST_EVENT_ID, nextEventId)
            .apply();
    }

    private PollResult fetchEvents(long since) {
        HttpURLConnection connection = null;
        try {
            Uri uri = Uri.parse(serverUrl() + "/api/tmux/watch/events")
                .buildUpon()
                .appendQueryParameter("since", String.valueOf(since))
                .build();
            connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "AgentTmuxAndroidWatch/" + BuildConfig.VERSION_NAME);
            connection.setRequestProperty("x-agent-tmux-web-client", "android-watch");
            String token = authToken();
            if (!token.isEmpty()) {
                connection.setRequestProperty("x-agent-tmux-web-token", token);
            }

            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                return new PollResult(since, new ArrayList<>());
            }

            JSONObject root = new JSONObject(readAll(connection.getInputStream()));
            long latestEventId = root.optLong("latestEventId", since);
            JSONArray data = root.optJSONArray("data");
            List<WatchEvent> events = new ArrayList<>();
            if (data != null) {
                for (int index = 0; index < data.length(); index += 1) {
                    JSONObject item = data.optJSONObject(index);
                    if (item == null) {
                        continue;
                    }
                    long id = item.optLong("id", 0);
                    String session = item.optString("session", "").trim();
                    String label = item.optString("label", "Tmux task").trim();
                    long finishedAtMs = parseIsoTime(item.optString("finishedAt", ""));
                    if (id > 0 && !session.isEmpty()) {
                        events.add(new WatchEvent(id, session, label.isEmpty() ? "Tmux task" : label, finishedAtMs));
                    }
                }
            }
            return new PollResult(latestEventId, events);
        } catch (Exception error) {
            return new PollResult(since, new ArrayList<>());
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

    private static void ensureEnabledAt(Context context) {
        SharedPreferences prefs = preferences(context);
        if (prefs.contains(PREF_WATCH_ENABLED_AT_MS)) {
            return;
        }
        prefs.edit()
            .putLong(PREF_WATCH_ENABLED_AT_MS, System.currentTimeMillis())
            .apply();
    }

    private static long parseIsoTime(String value) {
        if (value == null || value.trim().isEmpty()) {
            return 0;
        }
        try {
            return Instant.parse(value.trim()).toEpochMilli();
        } catch (DateTimeParseException error) {
            return 0;
        }
    }

    private static final class PollResult {
        final long latestEventId;
        final List<WatchEvent> events;

        PollResult(long latestEventId, List<WatchEvent> events) {
            this.latestEventId = latestEventId;
            this.events = events;
        }
    }

    private static final class WatchEvent {
        final long id;
        final String session;
        final String label;
        final long finishedAtMs;

        WatchEvent(long id, String session, String label, long finishedAtMs) {
            this.id = id;
            this.session = session;
            this.label = label;
            this.finishedAtMs = finishedAtMs;
        }
    }
}
