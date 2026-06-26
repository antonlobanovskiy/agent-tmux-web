import { looksLikeTmuxWaitingForInput, looksLikeTmuxWorking } from "../shared/tmuxActivity.js";
import type { TmuxChatMessage } from "./tmuxGui.js";

export type TmuxAgentStatusKind = "needs-permission" | "question" | "error" | "waiting" | "running" | "idle";

export type TmuxAgentSummary = {
  kind: TmuxAgentStatusKind;
  title: string;
  detail: string;
  action: string;
  lastLine: string;
};

export type CompactTmuxMessage = {
  id: string;
  role: TmuxChatMessage["role"];
  text: string;
};

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const MAX_COMPACT_MESSAGES = 6;
const MAX_COMPACT_TEXT_LENGTH = 360;
const TERMINAL_OUTPUT_DETAIL = "Terminal output captured; open a detailed view for full output.";

export function summarizeTmuxAgent(output: string, messages: TmuxChatMessage[]): TmuxAgentSummary {
  const lines = meaningfulLines(output);
  const signalLines = lines.filter((line) => !isLowSignalLine(line));
  const lastLine = signalLines.at(-1) ?? "";
  const signalTailText = signalLines.slice(-12).join("\n");
  const latestSummary = summarizeLatestAssistant(messages);
  const summaryDetail = readableDetail(latestSummary || lastLine);

  if (lines.length === 0 && messages.length === 0) {
    return {
      kind: "idle",
      title: "Idle",
      detail: "No output captured yet.",
      action: "Start a CLI tool or send a prompt.",
      lastLine
    };
  }

  if (looksLikePermissionPrompt(signalTailText)) {
    return {
      kind: "needs-permission",
      title: "Needs permission",
      detail: readableDetail(lastLine || latestSummary),
      action: "Review the prompt and approve or reject it.",
      lastLine
    };
  }

  if (looksLikeError(signalTailText)) {
    return {
      kind: "error",
      title: "Error",
      detail: readableDetail(lastLine || latestSummary),
      action: "Open the session and inspect the failure.",
      lastLine
    };
  }

  if (looksLikeQuestion(signalTailText)) {
    return {
      kind: "question",
      title: "Question waiting",
      detail: readableDetail(lastQuestionLine(signalLines) || lastLine || latestSummary),
      action: "Reply with a short answer.",
      lastLine
    };
  }

  if (looksLikeTmuxWaitingForInput(output)) {
    return {
      kind: "waiting",
      title: "Waiting for input",
      detail: summaryDetail,
      action: "Send the next instruction or start another task.",
      lastLine
    };
  }

  if (looksLikeTmuxWorking(output) || lines.length > 0) {
    return {
      kind: "running",
      title: "Running",
      detail: summaryDetail,
      action: "Check back when it asks for input or finishes.",
      lastLine
    };
  }

  return {
    kind: "idle",
    title: "Idle",
    detail: "No active task detected.",
    action: "Send a prompt or launch a tool.",
    lastLine
  };
}

export function buildCompactTmuxMessages(messages: TmuxChatMessage[], maxMessages = MAX_COMPACT_MESSAGES): CompactTmuxMessage[] {
  return messages
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: compactText(removeVerboseBlocks(message.text))
    }))
    .filter((message) => message.text)
    .slice(-maxMessages);
}

function summarizeLatestAssistant(messages: TmuxChatMessage[]): string {
  const latest = [...messages].reverse().find((message) => message.role !== "user");
  return latest ? compactText(removeVerboseBlocks(latest.text)) : "";
}

function meaningfulLines(output: string): string[] {
  return cleanText(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isDecorativeLine(line));
}

function cleanText(text: string): string {
  return text.replace(ANSI_PATTERN, "").replace(OSC_PATTERN, "");
}

function removeVerboseBlocks(text: string): string {
  const lines = cleanText(text).split(/\r?\n/);
  const kept: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed || isDecorativeLine(trimmed) || isLowSignalLine(trimmed)) {
      continue;
    }
    kept.push(trimmed.replace(/^[•*-]\s+/, ""));
  }

  return kept.join(" ");
}

function compactText(text: string): string {
  const normalized = cleanText(text)
    .replace(/^[•*-]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > MAX_COMPACT_TEXT_LENGTH
    ? `${normalized.slice(0, MAX_COMPACT_TEXT_LENGTH - 1).trimEnd()}...`
    : normalized;
}

function readableDetail(text: string): string {
  return compactText(text) || TERMINAL_OUTPUT_DETAIL;
}

function looksLikePermissionPrompt(text: string): boolean {
  return /\b(allow|approve|permission|permissions|authorize|confirm|proceed|continue)\b/i.test(text)
    && /(\?|\[y\/n\]|\[y\/N\]|press enter|yes|no|esc to go back)/i.test(text);
}

function looksLikeQuestion(text: string): boolean {
  return /(?:\?|which\s+\w+|what\s+\w+|should i|do you want|please choose)/i.test(text)
    && !looksLikePermissionPrompt(text);
}

function looksLikeError(text: string): boolean {
  return /\b(error|failed|failure|exception|traceback|exit code [1-9]\d*|command not found)\b/i.test(text);
}

function lastQuestionLine(lines: string[]): string {
  return [...lines].reverse().find((line) => /\?/.test(line)) ?? "";
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
