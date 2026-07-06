const DRAFT_REPLY_PATTERN = /^(?:[•*-]\s*)?Draft reply:\s*$/i;
const QUOTE_MARKER_PATTERN = /^\s*>\s?/;
const LIST_ITEM_PATTERN = /^\s*(?:[-*•]\s+|\d+[.)]\s+)/;

export function cleanTmuxAssistantCopyText(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const draftLines = extractDraftReplyLines(normalized);
  if (!draftLines) {
    return trimBlankEdges(normalized.split("\n")).join("\n").trim();
  }

  const unquoted = draftLines.map((line) => line.replace(QUOTE_MARKER_PATTERN, ""));
  return reflowProseLines(trimBlankEdges(unquoted)).trim();
}

function extractDraftReplyLines(text: string): string[] | null {
  const lines = text.split("\n");
  const draftIndex = lines.findIndex((line) => DRAFT_REPLY_PATTERN.test(line.trim()));
  return draftIndex === -1 ? null : lines.slice(draftIndex + 1);
}

function reflowProseLines(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const pushCurrent = () => {
    if (current.length === 0) {
      return;
    }
    paragraphs.push(current.join(" ").replace(/\s+/g, " ").trim());
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      pushCurrent();
      continue;
    }

    if (trimmed.startsWith("```")) {
      pushCurrent();
      paragraphs.push(trimmed);
      inFence = !inFence;
      continue;
    }

    if (inFence || LIST_ITEM_PATTERN.test(trimmed)) {
      pushCurrent();
      paragraphs.push(line.trimEnd());
      continue;
    }

    current.push(trimmed);
  }

  pushCurrent();
  return paragraphs.join("\n\n");
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
