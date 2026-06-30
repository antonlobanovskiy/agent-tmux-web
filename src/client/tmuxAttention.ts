import type { TmuxWatchEvent } from "../shared/api.js";

export function buildTmuxAttentionEvents(
  events: TmuxWatchEvent[],
  options: { selectedSession?: string; limit?: number } = {}
): TmuxWatchEvent[] {
  const selectedSession = options.selectedSession?.trim();
  const limit = Math.max(0, options.limit ?? events.length);
  const seenSessions = new Set<string>();
  const attentionEvents: TmuxWatchEvent[] = [];

  for (const event of events) {
    const session = event.session.trim();
    if (!session || session === selectedSession || seenSessions.has(session)) {
      continue;
    }

    seenSessions.add(session);
    attentionEvents.push(event);

    if (attentionEvents.length >= limit) {
      break;
    }
  }

  return attentionEvents;
}
