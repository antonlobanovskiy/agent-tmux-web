export type TmuxViewMode = "tty" | "raw";
export type TmuxViewSwitchPolicy = "remember" | "default";

export const DEFAULT_TMUX_VIEW_STORAGE_KEY = "agent-tmux-web.default-view";
export const TMUX_SESSION_VIEWS_STORAGE_KEY = "agent-tmux-web.session-views";
export const TMUX_VIEW_SWITCH_POLICY_STORAGE_KEY = "agent-tmux-web.view-switch-policy";
export const FALLBACK_TMUX_VIEW_MODE: TmuxViewMode = "tty";
export const FALLBACK_TMUX_VIEW_SWITCH_POLICY: TmuxViewSwitchPolicy = "remember";

export function normalizeTmuxViewMode(value: unknown): TmuxViewMode | null {
  if (value === "raw") {
    return "raw";
  }
  if (value === "text" || value === "tty" || value === "gui" || value === "focus") {
    return "tty";
  }
  return null;
}

export function normalizeTmuxViewSwitchPolicy(value: unknown): TmuxViewSwitchPolicy | null {
  return value === "remember" || value === "default" ? value : null;
}

export function parseTmuxSessionViewModes(serialized: string | null): Record<string, TmuxViewMode> {
  if (!serialized) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed)
      .flatMap(([session, mode]) => {
        const normalizedMode = normalizeTmuxViewMode(mode);
        return session.trim() && normalizedMode ? [[session, normalizedMode]] : [];
      }));
  } catch {
    return {};
  }
}

export function resolveTmuxViewMode(
  session: string,
  defaultMode: TmuxViewMode,
  policy: TmuxViewSwitchPolicy,
  sessionModes: Record<string, TmuxViewMode>
): TmuxViewMode {
  return policy === "remember" ? sessionModes[session] ?? defaultMode : defaultMode;
}
