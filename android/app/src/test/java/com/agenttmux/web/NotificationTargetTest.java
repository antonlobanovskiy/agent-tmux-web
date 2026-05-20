package com.agenttmux.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import org.junit.Test;

public final class NotificationTargetTest {
    @Test
    public void buildsSessionSpecificNotificationText() {
        assertEquals("agent-demo tab is waiting", NotificationTarget.title("agent-demo"));
        assertEquals(
            "Claude finished in agent-demo and is waiting for input.",
            NotificationTarget.body("Claude", "agent-demo")
        );
    }

    @Test
    public void buildsJavascriptDispatchForExistingWebView() {
        assertEquals(
            "window.dispatchEvent(new CustomEvent('agent-tmux-open-session',{detail:{session:\"agent-demo\"}}));",
            NotificationTarget.openSessionScript("agent-demo")
        );
    }

    @Test
    public void escapesJavascriptSessionNames() {
        assertEquals(
            "window.dispatchEvent(new CustomEvent('agent-tmux-open-session',{detail:{session:\"agent\\\\\\\"demo\"}}));",
            NotificationTarget.openSessionScript("agent\\\"demo")
        );
    }

    @Test
    public void usesDifferentPendingIntentRequestCodesForDifferentSessions() {
        assertNotEquals(
            NotificationTarget.requestCode("agent-tmux-watch-codex", "codex"),
            NotificationTarget.requestCode("agent-tmux-watch-claude", "claude")
        );
    }
}
