package com.agenttmux.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import org.junit.Test;

public final class NotificationTargetTest {
    @Test
    public void buildsSessionSpecificNotificationText() {
        assertEquals("agent-demo needs input", NotificationTarget.title("agent-demo", "waiting-for-input"));
        assertEquals(
            "Claude needs input in agent-demo.",
            NotificationTarget.body("Claude", "agent-demo", "waiting-for-input")
        );
    }

    @Test
    public void buildsIdleNotificationText() {
        assertEquals("agent-demo is idle", NotificationTarget.title("agent-demo", "idle"));
        assertEquals("Claude is idle in agent-demo.", NotificationTarget.body("Claude", "agent-demo", "idle"));
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
