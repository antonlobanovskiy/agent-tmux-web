package com.agenttmux.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ExternalLinkPolicyTest {
    @Test
    public void keepsConfiguredServerLinksInWebView() {
        assertFalse(ExternalLinkPolicy.shouldOpenInExternalBrowser(
            "http://100.67.212.112:6174/?token=abc",
            "http://100.67.212.112:6174"
        ));
        assertFalse(ExternalLinkPolicy.shouldOpenInExternalBrowser(
            "http://100.67.212.112:6174/assets/app.js",
            "http://100.67.212.112:6174/"
        ));
    }

    @Test
    public void opensDifferentHttpOriginsInExternalBrowser() {
        assertTrue(ExternalLinkPolicy.shouldOpenInExternalBrowser(
            "https://example.com/docs",
            "http://100.67.212.112:6174"
        ));
        assertTrue(ExternalLinkPolicy.shouldOpenInExternalBrowser(
            "http://100.67.212.112:6175/",
            "http://100.67.212.112:6174"
        ));
    }

    @Test
    public void opensAppSchemesInExternalBrowser() {
        assertTrue(ExternalLinkPolicy.shouldOpenInExternalBrowser(
            "mailto:hello@example.com",
            "http://100.67.212.112:6174"
        ));
        assertTrue(ExternalLinkPolicy.shouldOpenInExternalBrowser(
            "tel:+15555550100",
            "http://100.67.212.112:6174"
        ));
    }

    @Test
    public void opensPopupLinksInExternalBrowserEvenWhenSameOrigin() {
        assertTrue(ExternalLinkPolicy.shouldOpenPopupInExternalBrowser(
            "http://100.67.212.112:6174/assets/agent-tmux-web-v0.1.19-private-release.apk"
        ));
        assertTrue(ExternalLinkPolicy.shouldOpenPopupInExternalBrowser(
            "https://example.com/docs"
        ));
    }

    @Test
    public void keepsWebViewInternalSchemesInWebView() {
        assertFalse(ExternalLinkPolicy.shouldOpenInExternalBrowser(
            "about:blank",
            "http://100.67.212.112:6174"
        ));
        assertFalse(ExternalLinkPolicy.shouldOpenInExternalBrowser(
            "data:text/plain,loading",
            "http://100.67.212.112:6174"
        ));
        assertFalse(ExternalLinkPolicy.shouldOpenPopupInExternalBrowser("about:blank"));
    }
}
