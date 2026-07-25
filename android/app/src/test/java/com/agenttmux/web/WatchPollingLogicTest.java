package com.agenttmux.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;

import org.junit.Test;

public final class WatchPollingLogicTest {
    @Test
    public void parsesAndValidatesWatchEvents() {
        WatchPollingLogic.PollResult result = WatchPollingLogic.parseResponse(
            200,
            "{\"latestEventId\":13,\"baselineEventId\":14,\"data\":["
                + "{\"id\":11,\"session\":\" codex \",\"label\":\" \",\"state\":\"waiting-for-input\"},"
                + "{\"id\":12,\"session\":\"agent\\u002d\\\"demo\",\"label\":\"Claude\",\"state\":\"idle\"},"
                + "{\"id\":0,\"session\":\"invalid-id\",\"state\":\"idle\"},"
                + "{\"id\":13,\"session\":\"busy\",\"state\":\"working\"},null]}",
            10
        );

        assertTrue(result.successful);
        assertEquals(13, result.latestEventId);
        assertEquals(14, result.baselineEventId);
        assertEquals(2, result.events.size());
        assertEquals(11, result.events.get(0).id);
        assertEquals("codex", result.events.get(0).session);
        assertEquals("Tmux task", result.events.get(0).label);
        assertEquals("agent-\"demo", result.events.get(1).session);
        assertEquals("idle", result.events.get(1).state);
    }

    @Test
    public void rejectsMalformedAndUnsuccessfulResponses() {
        assertFalse(WatchPollingLogic.parseResponse(200, "{", 7).successful);
        assertFalse(WatchPollingLogic.parseResponse(503, "{}", 7).successful);
    }

    @Test
    public void baselinesFirstSuccessfulResponseWithoutReturningEvents() {
        WatchPollingLogic.PollDecision decision = WatchPollingLogic.advance(
            0,
            true,
            result(8, 10, event(8), event(9))
        );

        assertTrue(decision.shouldPersist);
        assertEquals(10, decision.nextEventId);
        assertTrue(decision.events.isEmpty());
    }

    @Test
    public void filtersStaleEventsAndAdvancesCursorMonotonically() {
        WatchPollingLogic.PollDecision decision = WatchPollingLogic.advance(
            10,
            false,
            result(9, 12, event(9), event(11))
        );

        assertTrue(decision.shouldPersist);
        assertEquals(11, decision.nextEventId);
        assertEquals(1, decision.events.size());
        assertEquals(11, decision.events.get(0).id);
    }

    @Test
    public void advancesPastSuccessfulEmptyResponses() {
        WatchPollingLogic.PollDecision decision = WatchPollingLogic.advance(
            10,
            false,
            result(15, 15)
        );

        assertEquals(15, decision.nextEventId);
        assertTrue(decision.events.isEmpty());
    }

    @Test
    public void doesNotSkipReservedBaselineDuringOngoingPolling() {
        WatchPollingLogic.PollDecision decision = WatchPollingLogic.advance(
            10,
            false,
            result(10, 11)
        );

        assertEquals(10, decision.nextEventId);
    }

    @Test
    public void doesNotAdvanceAfterUnsuccessfulResponse() {
        WatchPollingLogic.PollDecision decision = WatchPollingLogic.advance(
            10,
            false,
            WatchPollingLogic.failure(10)
        );

        assertFalse(decision.shouldPersist);
        assertEquals(10, decision.nextEventId);
        assertTrue(decision.events.isEmpty());
    }

    @Test
    public void rejectsResultsFromAnOlderServerConfiguration() {
        assertTrue(WatchPollingLogic.isCurrentGeneration(4, 4));
        assertFalse(WatchPollingLogic.isCurrentGeneration(4, 5));
    }

    private static WatchPollingLogic.PollResult result(
        long latestEventId,
        long baselineEventId,
        WatchPollingLogic.WatchEvent... events
    ) {
        return new WatchPollingLogic.PollResult(
            true,
            latestEventId,
            baselineEventId,
            Arrays.asList(events)
        );
    }

    private static WatchPollingLogic.WatchEvent event(long id) {
        return new WatchPollingLogic.WatchEvent(id, "agent-demo", "Codex", "idle");
    }
}
