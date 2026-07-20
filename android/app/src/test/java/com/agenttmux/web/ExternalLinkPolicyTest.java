package com.agenttmux.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
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
    public void rejectsOpaqueHttpLinks() {
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https:example.com/path"));
    }

    @Test
    public void rejectsAuthoritylessHttpLinks() {
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("http:/path"));
    }

    @Test
    public void rejectsHttpLinksWithoutAHost() {
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https:///path"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https://:443/path"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https://?query"));
    }

    @Test
    public void rejectsMalformedOrOversizedPorts() {
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https://example.com:"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https://example.com:not-a-port"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https://example.com:65536"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink(
            "https://example.com:999999999999999999999"
        ));
    }

    @Test
    public void rejectsHttpLinksWithUserInfo() {
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink(
            "https://user:password@example.com/private"
        ));
    }

    @Test
    public void rejectsEmbeddedWhitespaceAndControlCharacters() {
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https://exa mple.com/path"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https://example.com/line\nbreak"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("https://example.com/a\u0085b"));
    }

    @Test
    public void rejectsNullAndEmptyHttpLinks() {
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink(null));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink(""));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("   "));
    }

    @Test
    public void rejectsUnsafeSchemes() {
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("javascript:alert(1)"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("file:///tmp/private.txt"));
        assertNull(ExternalLinkPolicy.normalizeHttpWebLink("data:text/html,unsafe"));
    }

    @Test
    public void preservesMixedCaseHttpLinksWithQueryAndFragment() {
        assertEquals(
            "HtTpS://Example.COM/docs?tab=raw#output",
            ExternalLinkPolicy.normalizeHttpWebLink(
                "HtTpS://Example.COM/docs?tab=raw#output"
            )
        );
    }

    @Test
    public void preservesIpv4HttpLinks() {
        assertEquals(
            "http://192.0.2.10/resource",
            ExternalLinkPolicy.normalizeHttpWebLink("http://192.0.2.10/resource")
        );
    }

    @Test
    public void preservesBracketedIpv6HttpLinks() {
        assertEquals(
            "https://[2001:db8::1]:8443/resource",
            ExternalLinkPolicy.normalizeHttpWebLink(
                "https://[2001:db8::1]:8443/resource"
            )
        );
    }

    @Test
    public void acceptsValidPortBoundaries() {
        assertEquals(
            "http://example.com:0/",
            ExternalLinkPolicy.normalizeHttpWebLink("http://example.com:0/")
        );
        assertEquals(
            "https://example.com:65535/",
            ExternalLinkPolicy.normalizeHttpWebLink("https://example.com:65535/")
        );
    }

    @Test
    public void preservesPercentEncodedPaths() {
        assertEquals(
            "https://example.com/a%2Fb%20c",
            ExternalLinkPolicy.normalizeHttpWebLink("https://example.com/a%2Fb%20c")
        );
    }

    @Test
    public void convertsAcceptedLinksToAscii() {
        assertEquals(
            "https://example.com/caf%C3%A9",
            ExternalLinkPolicy.normalizeHttpWebLink("https://example.com/caf\u00e9")
        );
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
