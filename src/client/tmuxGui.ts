export type TmuxChatMessage = {
  id: string;
  role: "assistant" | "user" | "terminal";
  text: string;
};

export type TmuxChatPart = {
  id: string;
  kind: "text" | "code";
  text: string;
  label?: string;
};

const ansiPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function parseTmuxChatOutput(output: string): TmuxChatMessage[] {
  const messages: TmuxChatMessage[] = [];
  let assistantLines: string[] = [];
  let pendingUserPrompt = "";

  const pushAssistant = () => {
    const text = trimBlankEdges(assistantLines).join("\n").trim();
    assistantLines = [];
    if (text) {
      messages.push({ id: `assistant-${messages.length}`, role: "assistant", text });
    }
  };

  const pushPendingUserPrompt = () => {
    if (pendingUserPrompt) {
      messages.push({ id: `user-${messages.length}`, role: "user", text: pendingUserPrompt });
      pendingUserPrompt = "";
    }
  };

  for (const rawLine of output.split(/\r?\n/)) {
    const line = cleanTerminalLine(rawLine);
    const trimmed = line.trim();

    if (!trimmed) {
      if (assistantLines.length > 0 && assistantLines[assistantLines.length - 1] !== "") {
        assistantLines.push("");
      }
      continue;
    }

    if (isTerminalChrome(trimmed)) {
      continue;
    }

    const userPrompt = trimmed.match(/^›\s+(.+)$/);
    if (userPrompt) {
      pushAssistant();
      pendingUserPrompt = userPrompt[1].trim();
      continue;
    }

    pushPendingUserPrompt();
    assistantLines.push(line.trimEnd());
  }

  pushAssistant();

  if (messages.length === 0 && output.trim()) {
    return [{ id: "terminal-0", role: "terminal", text: cleanTerminalLine(output).trim() }];
  }

  return messages;
}

export function splitTmuxChatMessage(text: string): TmuxChatPart[] {
  const parts: TmuxChatPart[] = [];
  let textLines: string[] = [];
  let codeLines: string[] = [];
  let fenceLabel = "";
  let inFence = false;

  const pushText = () => {
    const partText = trimBlankEdges(textLines).join("\n").trim();
    textLines = [];
    if (partText) {
      parts.push({ id: `part-${parts.length}`, kind: "text", text: partText });
    }
  };

  const pushCode = (label = fenceLabel || "terminal") => {
    const partText = trimBlankEdges(codeLines).join("\n").trimEnd();
    codeLines = [];
    fenceLabel = "";
    if (partText) {
      parts.push({ id: `part-${parts.length}`, kind: "code", text: partText, label });
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const fence = line.trim().match(/^```([\w.+-]*)/);
    if (fence) {
      if (inFence) {
        pushCode(fenceLabel || "code");
        inFence = false;
        continue;
      }

      pushText();
      pushCode();
      inFence = true;
      fenceLabel = fence[1] || "code";
      continue;
    }

    if (inFence) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      if (codeLines.length > 0 && textLines.length === 0) {
        codeLines.push("");
      } else if (textLines.length > 0) {
        textLines.push("");
      }
      continue;
    }

    if (isCodeLikeLine(line) || (codeLines.length > 0 && !startsNarrativeLine(line))) {
      pushText();
      codeLines.push(line);
      continue;
    }

    pushCode();
    textLines.push(line);
  }

  if (inFence) {
    pushCode(fenceLabel || "code");
  } else {
    pushCode();
    pushText();
  }

  return parts.length > 0 ? parts : [{ id: "part-0", kind: "text", text }];
}

function cleanTerminalLine(line: string): string {
  return line
    .replace(ansiPattern, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\s+$/g, "");
}

function isTerminalChrome(line: string): boolean {
  const compact = line.replace(/\s/g, "");
  return /^[─━═-]{8,}$/.test(compact)
    || /^gpt-[\w.-]+\s+/i.test(line)
    || /^worked for \d/i.test(line)
    || /^[─━═-]+\s*worked for \d/i.test(line)
    || /^goal achieved\b/i.test(line)
    || line === "No tmux output captured.";
}

function isCodeLikeLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[❯$>]\s+/.test(trimmed)
    || /^(pnpm|npm|yarn|uv|git|gh|curl|tmux|node|python|python3|pytest|systemctl|journalctl|cat|rg|sed|ls)\b/.test(trimmed)
    || /^[{}[\]],?$/.test(trimmed)
    || /^"[^"]+"\s*:/.test(trimmed)
    || /^\s{2,}(?:[└├│]|["'{[}]|\S.*[:=] )/.test(line);
}

function startsNarrativeLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[•*-]\s/.test(trimmed)
    || /^(Implemented|Changed|Added|Fixed|Verified|Found|The|This|I\s|You\s|It\s|What\s|Why\s|How\s)/.test(trimmed);
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) {
    start += 1;
  }
  while (end > start && !lines[end - 1].trim()) {
    end -= 1;
  }
  return lines.slice(start, end);
}
