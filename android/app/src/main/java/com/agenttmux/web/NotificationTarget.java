package com.agenttmux.web;

final class NotificationTarget {
    static final String EXTRA_TMUX_SESSION = "com.agenttmux.web.extra.TMUX_SESSION";
    static final String QUERY_TMUX_SESSION = "tmuxSession";

    private NotificationTarget() {
    }

    static String title(String session) {
        String safeSession = clean(session);
        return safeSession.isEmpty() ? "Agent Tmux tab is waiting" : safeSession + " tab is waiting";
    }

    static String body(String label, String session) {
        String safeLabel = clean(label);
        String safeSession = clean(session);
        if (safeLabel.isEmpty()) {
            safeLabel = "Tmux task";
        }
        if (safeSession.isEmpty()) {
            return safeLabel + " finished and is waiting for input.";
        }
        return safeLabel + " finished in " + safeSession + " and is waiting for input.";
    }

    static String tag(String session) {
        String safeSession = clean(session);
        return safeSession.isEmpty() ? "agent-tmux-watch" : "agent-tmux-watch-" + safeSession;
    }

    static int requestCode(String tag, String session) {
        return Math.abs((clean(tag) + "\n" + clean(session)).hashCode());
    }

    static String openSessionScript(String session) {
        return "window.dispatchEvent(new CustomEvent('agent-tmux-open-session',{detail:{session:"
            + javascriptString(clean(session))
            + "}}));";
    }

    static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static String javascriptString(String value) {
        StringBuilder builder = new StringBuilder("\"");
        for (int index = 0; index < value.length(); index += 1) {
            char character = value.charAt(index);
            switch (character) {
                case '\\':
                    builder.append("\\\\");
                    break;
                case '"':
                    builder.append("\\\"");
                    break;
                case '\n':
                    builder.append("\\n");
                    break;
                case '\r':
                    builder.append("\\r");
                    break;
                case '\t':
                    builder.append("\\t");
                    break;
                default:
                    builder.append(character);
                    break;
            }
        }
        return builder.append("\"").toString();
    }
}
