package com.agenttmux.web;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.webkit.JavascriptInterface;

import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.Test;

public final class AgentNotificationBridgeTest {
    @Test
    public void exposesExternalLinkOpenerToJavascript() throws Exception {
        Method method = AgentNotificationBridge.class.getMethod("openExternalLink", String.class);
        assertNotNull(method.getAnnotation(JavascriptInterface.class));
        assertEquals(boolean.class, method.getReturnType());
    }

    @Test
    public void exposesClipboardWriterToJavascript() throws Exception {
        Method method = AgentNotificationBridge.class.getMethod("writeClipboard", String.class);

        assertNotNull(method.getAnnotation(JavascriptInterface.class));
        assertEquals(boolean.class, method.getReturnType());
    }

    @Test
    public void exposesConnectionSettingsToJavascript() throws Exception {
        Method method = AgentNotificationBridge.class.getMethod("openConnectionSettings");
        assertNotNull(method.getAnnotation(JavascriptInterface.class));
        assertEquals(void.class, method.getReturnType());
    }

    @Test
    public void opensConnectionSettingsOnTheUiThread() {
        AtomicBoolean scheduled = new AtomicBoolean(false);
        AtomicBoolean opened = new AtomicBoolean(false);
        AgentNotificationBridge bridge = new AgentNotificationBridge(
            null,
            action -> {
                scheduled.set(true);
                action.run();
            },
            () -> opened.set(true)
        );

        bridge.openConnectionSettings();

        assertTrue(scheduled.get());
        assertTrue(opened.get());
    }
}
