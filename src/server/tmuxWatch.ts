import type { TmuxWatchDto, TmuxWatchEvent } from "../shared/api.js";
import { classifyTmuxStatus } from "../shared/tmuxStatus.js";

export const TMUX_WATCH_CAPTURE_LINES = 220;
export const TMUX_WATCH_MIN_AGE_MS = 2500;
export const TMUX_WATCH_POLL_INTERVAL_MS = 2000;
const TMUX_WATCH_MAX_EVENTS = 500;

type CaptureTmuxPane = (session: string, lines: number) => Promise<string>;
type ListTmuxSessions = () => Promise<Array<{ name: string; activityAtMs?: number; currentCommand?: string }>>;
type TmuxNotificationState = TmuxWatchEvent["state"];
type TmuxNotificationPhase = TmuxNotificationState | null;

type TmuxWatch = {
  session: string;
  label: string;
  startedAtMs: number;
  activityAtMs?: number;
  currentCommand?: string;
  phase?: TmuxNotificationPhase;
  revision: number;
  generation: number;
  candidate?: {
    phase: TmuxNotificationPhase;
    observations: number;
  };
};

export type TmuxWatchStoreOptions = {
  capture: CaptureTmuxPane;
  listSessions?: ListTmuxSessions;
  confirmationPolls?: number;
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
  private readonly listSessions?: ListTmuxSessions;
  private readonly confirmationPolls: number;
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
  private pollInFlight: Promise<TmuxWatchEvent[]> | null = null;

  constructor(options: TmuxWatchStoreOptions) {
    this.capture = options.capture;
    this.listSessions = options.listSessions;
    this.confirmationPolls = Math.max(1, options.confirmationPolls ?? 2);
    this.minAgeMs = options.minAgeMs ?? TMUX_WATCH_MIN_AGE_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? TMUX_WATCH_POLL_INTERVAL_MS;
    this.maxEvents = options.maxEvents ?? TMUX_WATCH_MAX_EVENTS;
    this.now = options.now ?? Date.now;
    this.nextEventId = options.initialEventId ?? Math.max(1, Math.floor(this.now()));
    this.onEvent = options.onEvent;
    this.onError = options.onError;
  }

  startWatch(session: string, label = "Tmux task"): TmuxWatchDto {
    const nowMs = this.now();
    const watch = this.watches.get(session) ?? createWatch(session, nowMs);
    watch.label = label.trim() || "Tmux task";
    watch.startedAtMs = nowMs;
    watch.phase = null;
    watch.candidate = undefined;
    watch.revision += 1;
    watch.generation += 1;
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
    return this.latestBaselineEventId();
  }

  latestBaselineEventId(): number {
    return this.nextEventId - 1;
  }

  getEventsSince(since: number): TmuxWatchEvent[] {
    const latestSettledEventId = this.latestEventId();
    return this.events.filter((event) => (
      event.id > since
      && event.id <= latestSettledEventId
      && this.isCurrentEvent(event)
    ));
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

  pollOnce(): Promise<TmuxWatchEvent[]> {
    if (!this.pollInFlight) {
      this.pollInFlight = this.pollWatches().finally(() => {
        this.pollInFlight = null;
      });
    }
    return this.pollInFlight;
  }

  private async pollWatches(): Promise<TmuxWatchEvent[]> {
    const completed: TmuxWatchEvent[] = [];
    await this.syncSessions();
    const watches = [...this.watches.values()];

    await Promise.all(watches.map(async (watch) => {
      if (this.now() - watch.startedAtMs < this.minAgeMs) {
        return;
      }

      const generation = watch.generation;
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

      if (this.watches.get(watch.session) !== watch || watch.generation !== generation) {
        return;
      }

      const status = classifyTmuxStatus({
        activityAtMs: watch.activityAtMs,
        nowMs: this.now(),
        output
      });
      const event = this.observePhase(watch, notificationPhase(status.kind, watch.currentCommand, output), this.now());
      if (event) {
        completed.push(event);
      }
    }));

    return completed;
  }

  private observePhase(watch: TmuxWatch, phase: TmuxNotificationPhase, observedAtMs: number): TmuxWatchEvent | null {
    if (watch.phase === undefined) {
      watch.phase = phase;
      watch.revision += 1;
      watch.generation += 1;
      return null;
    }

    if (watch.phase === phase) {
      if (watch.candidate) {
        watch.candidate = undefined;
        watch.generation += 1;
      }
      return null;
    }

    if (watch.candidate?.phase === phase) {
      watch.candidate.observations += 1;
    } else {
      watch.candidate = {
        phase,
        observations: 1
      };
    }
    watch.generation += 1;

    if (watch.candidate.observations < this.confirmationPolls) {
      return null;
    }

    watch.candidate = undefined;
    watch.phase = phase;
    watch.revision += 1;
    if (phase === null) {
      watch.startedAtMs = observedAtMs;
      return null;
    }

    const event: TmuxWatchEvent = {
      id: this.reserveEventId(),
      session: watch.session,
      label: watch.label,
      state: phase,
      revision: watch.revision,
      startedAt: new Date(watch.startedAtMs).toISOString(),
      finishedAt: new Date(observedAtMs).toISOString()
    };
    this.events.push(event);
    this.events.sort((left, right) => left.id - right.id);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    this.onEvent?.(event);
    return event;
  }

  private reserveEventId(): number {
    const eventId = this.nextEventId;
    this.nextEventId += 1;
    return eventId;
  }

  private isCurrentEvent(event: TmuxWatchEvent): boolean {
    const watch = this.watches.get(event.session);
    return Boolean(
      watch
      && !watch.candidate
      && watch.phase === event.state
      && watch.revision === event.revision
    );
  }

  private async syncSessions(): Promise<void> {
    if (!this.listSessions) {
      return;
    }

    let sessions: Array<{ name: string; activityAtMs?: number; currentCommand?: string }>;
    try {
      sessions = await this.listSessions();
    } catch (error) {
      this.onError?.(error, "");
      return;
    }

    const seen = new Set<string>();
    const nowMs = this.now();
    for (const session of sessions) {
      seen.add(session.name);
      const watch = this.watches.get(session.name) ?? createWatch(session.name, nowMs);
      watch.activityAtMs = session.activityAtMs;
      watch.currentCommand = session.currentCommand;
      this.watches.set(session.name, watch);
    }
    for (const session of this.watches.keys()) {
      if (!seen.has(session)) {
        this.watches.delete(session);
      }
    }
  }
}

function createWatch(session: string, startedAtMs: number): TmuxWatch {
  return {
    session,
    label: "Tmux session",
    startedAtMs,
    revision: 0,
    generation: 0
  };
}

function notificationPhase(
  kind: ReturnType<typeof classifyTmuxStatus>["kind"],
  currentCommand: string | undefined,
  output: string
): TmuxNotificationPhase {
  if (kind === "needs-permission" || kind === "question") {
    return "waiting-for-input";
  }
  if (kind === "waiting") {
    return currentCommand && isShellTmuxCommand(currentCommand) && looksLikeReturnedShellPrompt(output)
      ? "idle"
      : "waiting-for-input";
  }
  if (kind === "error" && currentCommand && isShellTmuxCommand(currentCommand) && looksLikeReturnedShellPrompt(output)) {
    return "idle";
  }
  if (kind === "idle") {
    if (currentCommand && !isIdleCapableTmuxCommand(currentCommand)) {
      return null;
    }
    if (currentCommand && isShellTmuxCommand(currentCommand) && !looksLikeReturnedShellPrompt(output)) {
      return null;
    }
    return "idle";
  }
  return null;
}

function isIdleCapableTmuxCommand(command: string): boolean {
  return isShellTmuxCommand(command)
    || /^(?:aider|amp|claude|cline|codex|copilot|cursor-agent|gemini|goose|opencode|qwen)$/i.test(command.trim());
}

function isShellTmuxCommand(command: string): boolean {
  return /^(?:ba|da|fi|k|pw|tc|z)?sh$|^nu$/i.test(command.trim());
}

function looksLikeReturnedShellPrompt(output: string): boolean {
  const lastLine = output
    .split(/\r?\n/)
    .map((line) => line.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "").trim())
    .filter(Boolean)
    .at(-1) ?? "";
  return /(?:^|\s)[$#%❯>]\s*$/.test(lastLine) || /^PS\s+.+>\s*$/i.test(lastLine);
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
