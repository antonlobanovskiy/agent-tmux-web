package com.agenttmux.web;

final class NotificationTarget {
    static final String EXTRA_TMUX_SESSION = "com.agenttmux.web.extra.TMUX_SESSION";
    static final String QUERY_TMUX_SESSION = "tmuxSession";

    private NotificationTarget() {
    }

    static String title(String session, String state) {
        String safeSession = clean(session);
        if ("idle".equals(state)) {
            return safeSession.isEmpty() ? "Agent Tmux is idle" : safeSession + " is idle";
        }
        return safeSession.isEmpty() ? "Agent Tmux needs input" : safeSession + " needs input";
    }

    static String body(String label, String session, String state) {
        String safeLabel = clean(label);
        String safeSession = clean(session);
        if (safeLabel.isEmpty()) {
            safeLabel = "Tmux task";
        }
        if ("idle".equals(state)) {
            return safeSession.isEmpty()
                ? safeLabel + " is idle."
                : safeLabel + " is idle in " + safeSession + ".";
        }
        if (safeSession.isEmpty()) {
            return safeLabel + " needs input.";
        }
        return safeLabel + " needs input in " + safeSession + ".";
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
