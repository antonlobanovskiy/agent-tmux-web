package com.agenttmux.web;

import java.net.URI;
import java.net.URISyntaxException;

final class ExternalLinkPolicy {
    private ExternalLinkPolicy() {
    }

    static boolean shouldOpenInExternalBrowser(String requestedUrl, String configuredServerUrl) {
        URI requested = parse(requestedUrl);
        if (requested == null) {
            return false;
        }

        String requestedScheme = requested.getScheme();
        if (isWebViewInternalScheme(requestedScheme)) {
            return false;
        }

        if (!isHttpScheme(requestedScheme)) {
            return requestedScheme != null && !requestedScheme.trim().isEmpty();
        }

        URI configuredServer = parse(configuredServerUrl);
        if (configuredServer == null || !isHttpScheme(configuredServer.getScheme())) {
            return true;
        }

        return !sameOrigin(requested, configuredServer);
    }

    static boolean shouldOpenPopupInExternalBrowser(String requestedUrl) {
        URI requested = parse(requestedUrl);
        if (requested == null) {
            return false;
        }

        String requestedScheme = requested.getScheme();
        if (isWebViewInternalScheme(requestedScheme)) {
            return false;
        }

        return requestedScheme != null && !requestedScheme.trim().isEmpty();
    }

    private static URI parse(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        try {
            return new URI(value.trim());
        } catch (URISyntaxException error) {
            return null;
        }
    }

    private static boolean sameOrigin(URI left, URI right) {
        return equalsIgnoreCase(left.getScheme(), right.getScheme())
            && equalsIgnoreCase(left.getHost(), right.getHost())
            && effectivePort(left) == effectivePort(right);
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        String scheme = uri.getScheme();
        if ("http".equalsIgnoreCase(scheme)) {
            return 80;
        }
        if ("https".equalsIgnoreCase(scheme)) {
            return 443;
        }
        return -1;
    }

    private static boolean isHttpScheme(String scheme) {
        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }

    private static boolean isWebViewInternalScheme(String scheme) {
        return "about".equalsIgnoreCase(scheme)
            || "blob".equalsIgnoreCase(scheme)
            || "data".equalsIgnoreCase(scheme);
    }

    private static boolean equalsIgnoreCase(String left, String right) {
        if (left == null || right == null) {
            return left == right;
        }
        return left.equalsIgnoreCase(right);
    }
}
