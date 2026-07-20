package com.agenttmux.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ExternalLinkPolicyTest {
    @Test
    public void onlyRawHttpLinksUseTheExternalLinkBridge() {
        assertTrue(ExternalLinkPolicy.isHttpWebLink("https://example.com/docs"));
        assertTrue(ExternalLinkPolicy.isHttpWebLink("http://example.com"));
        assertFalse(ExternalLinkPolicy.isHttpWebLink("javascript:alert(1)"));
        assertFalse(ExternalLinkPolicy.isHttpWebLink("file:///tmp/private.txt"));
    }

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
    public void showsUserActionsForLongPressedLinks() {
        assertTrue(ExternalLinkPolicy.shouldShowUserLinkActions("https://example.com/docs"));
        assertTrue(ExternalLinkPolicy.shouldShowUserLinkActions("mailto:hello@example.com"));
        assertFalse(ExternalLinkPolicy.shouldShowUserLinkActions("about:blank"));
        assertFalse(ExternalLinkPolicy.shouldShowUserLinkActions("data:text/plain,loading"));
    }

    @Test
    public void onlyAllowsConfiguredServerLinksToOpenInAppWebView() {
        assertTrue(ExternalLinkPolicy.canOpenInAppWebView(
            "http://100.67.212.112:6174/assets/app.js",
            "http://100.67.212.112:6174"
        ));
        assertFalse(ExternalLinkPolicy.canOpenInAppWebView(
            "https://example.com/docs",
            "http://100.67.212.112:6174"
        ));
        assertFalse(ExternalLinkPolicy.canOpenInAppWebView(
            "mailto:hello@example.com",
            "http://100.67.212.112:6174"
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
