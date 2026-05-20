export const TMUX_SESSION_QUERY_PARAM = "tmuxSession";

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
