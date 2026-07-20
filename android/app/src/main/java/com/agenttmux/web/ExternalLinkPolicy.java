package com.agenttmux.web;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

final class ExternalLinkPolicy {
    private ExternalLinkPolicy() {
    }

    static boolean isHttpWebLink(String requestedUrl) {
        return normalizeHttpWebLink(requestedUrl) != null;
    }

    static String normalizeHttpWebLink(String requestedUrl) {
        if (requestedUrl == null || containsWhitespaceOrControl(requestedUrl)) {
            return null;
        }

        URI requested = parse(requestedUrl);
        if (requested == null
            || requested.isOpaque()
            || !isHttpScheme(requested.getScheme())
            || requested.getRawAuthority() == null
            || requested.getRawUserInfo() != null) {
            return null;
        }

        // JavaScript URL serialization supplies IDNs as punycode, so raw Unicode hosts stay invalid.
        String host = requested.getHost();
        if (host == null || host.isEmpty() || !hasValidPort(requested, host)) {
            return null;
        }

        String asciiUrl = requested.toASCIIString();
        return requested.getScheme().toLowerCase(Locale.ROOT)
            + asciiUrl.substring(requested.getScheme().length());
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

    static boolean shouldShowUserLinkActions(String requestedUrl) {
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

    static boolean canOpenInAppWebView(String requestedUrl, String configuredServerUrl) {
        URI requested = parse(requestedUrl);
        if (requested == null || !isHttpScheme(requested.getScheme())) {
            return false;
        }

        URI configuredServer = parse(configuredServerUrl);
        return configuredServer != null
            && isHttpScheme(configuredServer.getScheme())
            && sameOrigin(requested, configuredServer);
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

    private static boolean containsWhitespaceOrControl(String value) {
        for (int index = 0; index < value.length(); index += 1) {
            char character = value.charAt(index);
            if (Character.isWhitespace(character)
                || Character.isSpaceChar(character)
                || Character.isISOControl(character)) {
                return true;
            }
        }
        return false;
    }

    private static boolean hasValidPort(URI requested, String host) {
        int port = requested.getPort();
        if (port < -1 || port > 65535) {
            return false;
        }

        String rawAuthority = requested.getRawAuthority();
        if (rawAuthority.equalsIgnoreCase(host)) {
            return port == -1;
        }

        String hostWithPortSeparator = host + ":";
        if (!rawAuthority.regionMatches(
            true,
            0,
            hostWithPortSeparator,
            0,
            hostWithPortSeparator.length()
        )) {
            return false;
        }

        String rawPort = rawAuthority.substring(hostWithPortSeparator.length());
        if (rawPort.isEmpty()) {
            return false;
        }

        int parsedPort = 0;
        for (int index = 0; index < rawPort.length(); index += 1) {
            char digit = rawPort.charAt(index);
            if (digit < '0' || digit > '9') {
                return false;
            }
            int value = digit - '0';
            if (parsedPort > (65535 - value) / 10) {
                return false;
            }
            parsedPort = parsedPort * 10 + value;
        }

        return port == parsedPort;
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
