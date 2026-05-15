const ansiPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function looksLikeTmuxWorking(output: string): boolean {
  const tail = meaningfulTail(output, 12);
  const lastWorkingLine = lastIndexWhere(tail, isWorkingLine);
  if (lastWorkingLine === -1) {
    return false;
  }
  const lastCompletionLine = lastIndexWhere(tail, isCompletionLine);
  return lastWorkingLine > lastCompletionLine;
}

export function looksLikeTmuxWaitingForInput(output: string): boolean {
  if (!output.trim()) {
    return false;
  }

  const tail = meaningfulTail(output, 12);
  if (tail.some((line) => isCompletionLine(line) || isConfirmationPromptLine(line))) {
    return true;
  }

  if (tail.some((line) => isWorkingLine(line))) {
    return false;
  }

  return tail.slice(-4).some((line) => isPromptLine(line));
}

function cleanOutput(output: string): string {
  return output
    .replace(ansiPattern, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "");
}

function isDecorativeLine(line: string): boolean {
  const compact = line.replace(/\s/g, "");
  return /^[╭╰├┤│─━═└┘┌┐┴┬┼-]{5,}$/.test(compact)
    || /^worked for \d/i.test(line);
}

function meaningfulTail(output: string, lineCount: number): string[] {
  return cleanOutput(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isDecorativeLine(line))
    .slice(-lineCount);
}

function isWorkingLine(line: string): boolean {
  const normalized = line.toLowerCase();
  return /(?:working|thinking|running).*?(?:interrupt|esc|ctrl-c)/.test(normalized)
    || /(?:esc|ctrl-c)\s+to\s+interrupt/.test(normalized)
    || /press\s+(?:esc|ctrl-c)\s+to\s+interrupt/.test(normalized);
}

function isCompletionLine(line: string): boolean {
  return /\bgoal achieved\b/i.test(line)
    || /^worked for \d/i.test(line)
    || /\btask complete\b/i.test(line);
}

function isConfirmationPromptLine(line: string): boolean {
  return /press enter to confirm/i.test(line)
    || /esc to go back/i.test(line)
    || /^replace goal\?/i.test(line);
}

function lastIndexWhere(lines: string[], predicate: (line: string) => boolean): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (predicate(lines[index])) {
      return index;
    }
  }
  return -1;
}

function isPromptLine(line: string): boolean {
  const withoutBox = line.replace(/^│\s*/, "").replace(/\s*│$/, "").trim();
  return /^(?:›|>|❯|\$|#)$/.test(withoutBox)
    || /(?:^|\s)(?:❯|\$|#)$/.test(withoutBox)
    || /^[\w.@:/~+-]+(?:\s+[\w.@:/~+-]+)*\s*(?:❯|\$|#)$/.test(withoutBox);
}
