package com.agenttmux.web;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;

import android.webkit.JavascriptInterface;

import java.lang.reflect.Method;

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
}
