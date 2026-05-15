import type { TmuxWatchDto, TmuxWatchEvent } from "../shared/api.js";
import { looksLikeTmuxWaitingForInput } from "../shared/tmuxActivity.js";

export const TMUX_WATCH_CAPTURE_LINES = 220;
export const TMUX_WATCH_MIN_AGE_MS = 2500;
export const TMUX_WATCH_POLL_INTERVAL_MS = 2000;
const TMUX_WATCH_MAX_EVENTS = 500;

type CaptureTmuxPane = (session: string, lines: number) => Promise<string>;

type TmuxWatch = {
  session: string;
  label: string;
  startedAtMs: number;
};

export type TmuxWatchStoreOptions = {
  capture: CaptureTmuxPane;
  minAgeMs?: number;
  pollIntervalMs?: number;
  maxEvents?: number;
  initialEventId?: number;
  now?: () => number;
  onEvent?: (event: TmuxWatchEvent) => void;
  onError?: (error: unknown, session: string) => void;
};

export class TmuxWatchStore {
  private readonly capture: CaptureTmuxPane;
  private readonly minAgeMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxEvents: number;
  private readonly now: () => number;
  private readonly onEvent?: (event: TmuxWatchEvent) => void;
  private readonly onError?: (error: unknown, session: string) => void;
  private readonly watches = new Map<string, TmuxWatch>();
  private readonly events: TmuxWatchEvent[] = [];
  private nextEventId: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: TmuxWatchStoreOptions) {
    this.capture = options.capture;
    this.minAgeMs = options.minAgeMs ?? TMUX_WATCH_MIN_AGE_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? TMUX_WATCH_POLL_INTERVAL_MS;
    this.maxEvents = options.maxEvents ?? TMUX_WATCH_MAX_EVENTS;
    this.now = options.now ?? Date.now;
    this.nextEventId = options.initialEventId ?? Math.max(1, Math.floor(this.now()));
    this.onEvent = options.onEvent;
    this.onError = options.onError;
  }

  startWatch(session: string, label = "Tmux task"): TmuxWatchDto {
    const watch: TmuxWatch = {
      session,
      label: label.trim() || "Tmux task",
      startedAtMs: this.now()
    };
    this.watches.set(session, watch);
    return toDto(watch);
  }

  cancelWatch(session: string): void {
    this.watches.delete(session);
  }

  listWatches(): TmuxWatchDto[] {
    return [...this.watches.values()].map(toDto);
  }

  latestEventId(): number {
    return this.events.at(-1)?.id ?? 0;
  }

  getEventsSince(since: number): TmuxWatchEvent[] {
    return this.events.filter((event) => event.id > since);
  }

  startAutoPoll(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
    this.timer.unref();
  }

  stopAutoPoll(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  async pollOnce(): Promise<TmuxWatchEvent[]> {
    const completed: TmuxWatchEvent[] = [];
    const watches = [...this.watches.values()];

    await Promise.all(watches.map(async (watch) => {
      if (this.now() - watch.startedAtMs < this.minAgeMs) {
        return;
      }

      let output: string;
      try {
        output = await this.capture(watch.session, TMUX_WATCH_CAPTURE_LINES);
      } catch (error) {
        if (isMissingTmuxSessionError(error)) {
          this.cancelWatch(watch.session);
        }
        this.onError?.(error, watch.session);
        return;
      }

      if (this.watches.get(watch.session) !== watch || !looksLikeTmuxWaitingForInput(output)) {
        return;
      }

      completed.push(this.completeWatch(watch, this.now()));
    }));

    return completed;
  }

  private completeWatch(watch: TmuxWatch, finishedAtMs: number): TmuxWatchEvent {
    this.watches.delete(watch.session);
    const event: TmuxWatchEvent = {
      id: this.nextEventId,
      session: watch.session,
      label: watch.label,
      startedAt: new Date(watch.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString()
    };
    this.nextEventId += 1;
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    this.onEvent?.(event);
    return event;
  }
}

function toDto(watch: TmuxWatch): TmuxWatchDto {
  return {
    session: watch.session,
    label: watch.label,
    startedAt: new Date(watch.startedAtMs).toISOString()
  };
}

function isMissingTmuxSessionError(error: unknown): boolean {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const text = `${String(record.message ?? "")}\n${String(record.stderr ?? "")}`.toLowerCase();
  return text.includes("can't find") || text.includes("can't find pane") || text.includes("no current target");
}
