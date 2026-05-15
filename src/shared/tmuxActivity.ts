const ansiPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function looksLikeTmuxWorking(output: string): boolean {
  const normalized = cleanOutput(output).toLowerCase();
  return /(?:working|thinking|running).*?(?:interrupt|esc|ctrl-c)/.test(normalized)
    || /(?:esc|ctrl-c)\s+to\s+interrupt/.test(normalized)
    || /press\s+(?:esc|ctrl-c)\s+to\s+interrupt/.test(normalized);
}

export function looksLikeTmuxWaitingForInput(output: string): boolean {
  if (!output.trim() || looksLikeTmuxWorking(output)) {
    return false;
  }

  const tail = cleanOutput(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isDecorativeLine(line))
    .slice(-8);

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
    || /^worked for \d/i.test(line)
    || /^goal achieved\b/i.test(line);
}

function isPromptLine(line: string): boolean {
  const withoutBox = line.replace(/^│\s*/, "").replace(/\s*│$/, "").trim();
  return /^(?:›|>|❯|\$|#)$/.test(withoutBox)
    || /(?:^|\s)(?:❯|\$|#)$/.test(withoutBox)
    || /^[\w.@:/~+-]+(?:\s+[\w.@:/~+-]+)*\s*(?:❯|\$|#)$/.test(withoutBox);
}
