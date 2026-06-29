import type { TmuxSessionStatusDto, TmuxSessionStatusHealth, TmuxSessionStatusKind } from "./api.js";
import { looksLikeTmuxWaitingForInput, looksLikeTmuxWorking } from "./tmuxActivity.js";

export type TmuxStatusInput = {
  activityAtMs?: number | null;
  nowMs?: number;
  output?: string;
  runningActivityWindowMs?: number;
};

export const DEFAULT_RUNNING_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;

export function classifyTmuxStatus(input: TmuxStatusInput): TmuxSessionStatusDto {
  const output = input.output ?? "";
  const signalText = meaningfulSignalLines(output).slice(-12).join("\n");
  const activeRecently = isActiveRecently(input);

  if (looksLikePermissionPrompt(signalText)) {
    return status("needs-permission");
  }

  if (looksLikeTmuxWorking(output) && activeRecently) {
    return status("running");
  }

  if (looksLikeError(signalText)) {
    return status("error");
  }

  if (looksLikeTmuxWaitingForInput(output)) {
    return status("waiting");
  }

  if (looksLikeQuestion(signalText)) {
    return status("question");
  }

  return status("idle");
}

function isActiveRecently(input: TmuxStatusInput): boolean {
  if (typeof input.activityAtMs !== "number" || input.activityAtMs <= 0) {
    return true;
  }
  const nowMs = input.nowMs ?? Date.now();
  const windowMs = input.runningActivityWindowMs ?? DEFAULT_RUNNING_ACTIVITY_WINDOW_MS;
  return nowMs - input.activityAtMs <= windowMs;
}

function status(kind: TmuxSessionStatusKind): TmuxSessionStatusDto {
  return {
    kind,
    health: healthForKind(kind),
    title: titleForKind(kind)
  };
}

function healthForKind(kind: TmuxSessionStatusKind): TmuxSessionStatusHealth {
  if (kind === "running") {
    return "green";
  }
  if (kind === "error") {
    return "red";
  }
  return "yellow";
}

function titleForKind(kind: TmuxSessionStatusKind): string {
  switch (kind) {
    case "needs-permission":
      return "Needs permission";
    case "question":
      return "Question waiting";
    case "error":
      return "Error";
    case "waiting":
      return "Waiting for input";
    case "running":
      return "Running";
    case "idle":
      return "Idle";
  }
}

function meaningfulSignalLines(output: string): string[] {
  return cleanText(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isDecorativeLine(line) && !isLowSignalLine(line));
}

function cleanText(text: string): string {
  return text.replace(ANSI_PATTERN, "").replace(OSC_PATTERN, "");
}

function looksLikePermissionPrompt(text: string): boolean {
  return text.split(/\r?\n/).some((line) => (
    /\b(allow|approve|permission|permissions|authorize|confirm|proceed|continue)\b/i.test(line)
    && /(\?|\[[yY]\/[nN]\]|press enter|\byes\b|\bno\b|esc to go back)/i.test(line)
  ));
}

function looksLikeQuestion(text: string): boolean {
  return /(?:\?|which\s+\w+|what\s+\w+|should i|do you want|please choose)/i.test(text)
    && !looksLikePermissionPrompt(text);
}

function looksLikeError(text: string): boolean {
  return /\b(error|failed|failure|exception|traceback|exit code [1-9]\d*|command not found)\b/i.test(text);
}

function isDecorativeLine(line: string): boolean {
  const compact = line.replace(/\s/g, "");
  return /^[╭╰├┤│─━═└┘┌┐┴┬┼-]{5,}$/.test(compact)
    || /^worked for \d/i.test(line)
    || /^gpt-[\w.-]+\s+/i.test(line);
}

function isLowSignalLine(line: string): boolean {
  return /^```/.test(line)
    || /^diff --git\b/.test(line)
    || /^index [0-9a-f]+\.\.[0-9a-f]+/.test(line)
    || /^@@\s/.test(line)
    || /^[+-]{3}\s/.test(line)
    || /^\d+\s+[+-]\s*/.test(line)
    || /^[+-]\s*(?:[{}()[\],;]|\.[\w-]+|#[\w-]+|(?:import|export|const|let|function|return|if|for|while|type|interface|class)\b)/.test(line)
    || /^[{}()[\],;]+$/.test(line)
    || /^\?\?\s+\S+/.test(line)
    || /^[ MADRCU]{1,2}\s+\S+/.test(line)
    || /(?:working|thinking|running).*?(?:interrupt|esc|ctrl-c)/i.test(line)
    || /(?:esc|ctrl-c)\s+to\s+interrupt/i.test(line)
    || /^(pnpm|npm|yarn|git|gh|curl|tmux|node|python|python3|pytest|systemctl|journalctl)\b/.test(line)
    || /^Test Files\b/.test(line)
    || /^Tests\b/.test(line)
    || /^\d+\s+(?:passed|failed|skipped)\b/i.test(line)
    || /^[│└├╰╭]/.test(line);
}
