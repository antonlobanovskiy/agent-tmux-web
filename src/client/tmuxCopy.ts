const DRAFT_REPLY_PATTERN = /^(?:[•*-]\s*)?Draft reply:\s*$/i;
const LEADING_CODEX_BULLET_PATTERN = /^\s*•\s+/;
const QUOTE_MARKER_PATTERN = /^\s*>\s?/;
const LIST_ITEM_PATTERN = /^\s*(?:[-*•]\s+|\d+[.)]\s+)/;

export function cleanTmuxAssistantCopyText(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const draftLines = extractDraftReplyLines(normalized);
  if (!draftLines) {
    return reflowProseLines(stripLeadingCodexBullet(trimBlankEdges(normalized.split("\n")))).trim();
  }

  const unquoted = draftLines.map((line) => line.replace(QUOTE_MARKER_PATTERN, ""));
  return reflowProseLines(trimBlankEdges(unquoted)).trim();
}

function extractDraftReplyLines(text: string): string[] | null {
  const lines = text.split("\n");
  const draftIndex = lines.findIndex((line) => DRAFT_REPLY_PATTERN.test(line.trim()));
  return draftIndex === -1 ? null : lines.slice(draftIndex + 1);
}

function stripLeadingCodexBullet(lines: string[]): string[] {
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex === -1) {
    return lines;
  }

  const result = [...lines];
  result[firstContentIndex] = result[firstContentIndex].replace(LEADING_CODEX_BULLET_PATTERN, "");
  return result;
}

function reflowProseLines(lines: string[]): string {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (fence) {
      fence.push(line.trimEnd());
      if (trimmed.startsWith("```")) {
        blocks.push(trimBlankEdges(fence).join("\n").trimEnd());
        fence = null;
      }
      continue;
    }

    if (trimmed.startsWith("```")) {
      pushProseBlock(blocks, current);
      current = [];
      fence = [trimmed];
      continue;
    }

    if (!trimmed) {
      pushProseBlock(blocks, current);
      current = [];
      continue;
    }

    current.push(line);
  }

  if (fence) {
    blocks.push(trimBlankEdges(fence).join("\n").trimEnd());
  }

  pushProseBlock(blocks, current);
  return blocks.join("\n\n");
}

function pushProseBlock(blocks: string[], lines: string[]) {
  const blockLines = trimBlankEdges(lines);
  if (blockLines.length === 0) {
    return;
  }

  if (blockLines.some((line) => LIST_ITEM_PATTERN.test(line.trim()))) {
    blocks.push(reflowListBlock(blockLines));
    return;
  }

  blocks.push(blockLines.map((line) => line.trim()).join(" ").replace(/\s+/g, " ").trim());
}

function reflowListBlock(lines: string[]): string {
  const items: string[] = [];
  let current: string[] = [];

  const pushCurrent = () => {
    if (current.length === 0) {
      return;
    }
    items.push(current.join(" ").replace(/\s+/g, " ").trim());
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (LIST_ITEM_PATTERN.test(trimmed)) {
      pushCurrent();
      current = [trimmed];
      continue;
    }
    current.push(trimmed);
  }

  pushCurrent();
  return items.join("\n");
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
