package com.agenttmux.web;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class WatchPollingLogic {
    private WatchPollingLogic() {}

    static PollResult parseResponse(int statusCode, String body, long since) {
        if (statusCode < 200 || statusCode >= 300) {
            return failure(since);
        }

        try {
            JSONObject root = new JSONObject(body);
            long latestEventId = root.optLong("latestEventId", since);
            long baselineEventId = root.optLong("baselineEventId", latestEventId);
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
                    String state = item.optString("state", "").trim();
                    if (id > 0 && !session.isEmpty() && isNotificationState(state)) {
                        events.add(new WatchEvent(id, session, label.isEmpty() ? "Tmux task" : label, state));
                    }
                }
            }
            return new PollResult(true, latestEventId, baselineEventId, events);
        } catch (Exception error) {
            return failure(since);
        }
    }

    static PollResult failure(long since) {
        return new PollResult(false, since, since, Collections.emptyList());
    }

    static boolean isCurrentGeneration(long expected, long current) {
        return expected == current;
    }

    static PollDecision advance(long lastEventId, boolean needsBaseline, PollResult result) {
        if (!result.successful) {
            return new PollDecision(false, lastEventId, Collections.emptyList());
        }

        long nextEventId = Math.max(lastEventId, result.latestEventId);
        if (needsBaseline) {
            return new PollDecision(true, Math.max(nextEventId, result.baselineEventId), Collections.emptyList());
        }

        List<WatchEvent> newEvents = new ArrayList<>();
        for (WatchEvent event : result.events) {
            if (event.id <= lastEventId) {
                continue;
            }
            nextEventId = Math.max(nextEventId, event.id);
            newEvents.add(event);
        }
        return new PollDecision(true, nextEventId, newEvents);
    }

    private static boolean isNotificationState(String state) {
        return "waiting-for-input".equals(state) || "idle".equals(state);
    }

    static final class PollResult {
        final boolean successful;
        final long latestEventId;
        final long baselineEventId;
        final List<WatchEvent> events;

        PollResult(boolean successful, long latestEventId, long baselineEventId, List<WatchEvent> events) {
            this.successful = successful;
            this.latestEventId = latestEventId;
            this.baselineEventId = baselineEventId;
            this.events = events;
        }
    }

    static final class PollDecision {
        final boolean shouldPersist;
        final long nextEventId;
        final List<WatchEvent> events;

        PollDecision(boolean shouldPersist, long nextEventId, List<WatchEvent> events) {
            this.shouldPersist = shouldPersist;
            this.nextEventId = nextEventId;
            this.events = events;
        }
    }

    static final class WatchEvent {
        final long id;
        final String session;
        final String label;
        final String state;

        WatchEvent(long id, String session, String label, String state) {
            this.id = id;
            this.session = session;
            this.label = label;
            this.state = state;
        }
    }
}
