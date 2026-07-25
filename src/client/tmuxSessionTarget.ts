import type { TmuxSessionDto } from "../shared/api.js";

export const TMUX_SESSION_QUERY_PARAM = "tmuxSession";
export const PINNED_TMUX_SESSIONS_STORAGE_KEY = "agent-tmux-web.pinned-sessions";

export function readRequestedTmuxSession(search: string): string {
  const params = new URLSearchParams(search);
  return normalizeRequestedTmuxSession(params.get(TMUX_SESSION_QUERY_PARAM));
}

export function normalizeRequestedTmuxSession(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function removeRequestedTmuxSession(url: URL): string {
  url.searchParams.delete(TMUX_SESSION_QUERY_PARAM);
  return url.toString();
}

export function parsePinnedTmuxSessionNames(serialized: string | null): string[] {
  if (!serialized) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) {
      return [];
    }
    return [...new Set(value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean))];
  } catch {
    return [];
  }
}

export function togglePinnedTmuxSessionName(pinnedSessionNames: string[], sessionName: string): string[] {
  return pinnedSessionNames.includes(sessionName)
    ? pinnedSessionNames.filter((name) => name !== sessionName)
    : [...pinnedSessionNames, sessionName];
}

export function orderTmuxSessionsByPins(sessions: TmuxSessionDto[], pinnedSessionNames: string[]): TmuxSessionDto[] {
  const pinnedNames = new Set(pinnedSessionNames);
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => Number(pinnedNames.has(right.session.name)) - Number(pinnedNames.has(left.session.name)) || left.index - right.index)
    .map(({ session }) => session);
}
