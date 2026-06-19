export type LinkifiedTextPart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

const URL_PATTERN = /(^|[\s([{<])((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const TRAILING_SENTENCE_PUNCTUATION = /[.,!?;:]$/;
const WRAPPER_PAIRS: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{"
};

export function linkifyText(text: string): LinkifiedTextPart[] {
  const parts: LinkifiedTextPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const prefix = match[1] ?? "";
    const rawMatch = match[2] ?? "";
    const start = (match.index ?? 0) + prefix.length;
    const { urlText, trailingText } = trimTrailingUrlPunctuation(rawMatch);
    const href = normalizeUrlHref(urlText);

    if (!urlText || !href) {
      continue;
    }

    if (start > lastIndex) {
      parts.push({ kind: "text", text: text.slice(lastIndex, start) });
    }

    parts.push({ kind: "link", text: urlText, href });

    if (trailingText) {
      parts.push({ kind: "text", text: trailingText });
    }

    lastIndex = start + rawMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ kind: "text", text }];
}

function normalizeUrlHref(value: string): string | null {
  const withProtocol = value.startsWith("www.") ? `https://${value}` : value;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function trimTrailingUrlPunctuation(raw: string): { urlText: string; trailingText: string } {
  let urlText = raw;
  let trailingText = "";

  while (urlText && TRAILING_SENTENCE_PUNCTUATION.test(urlText.at(-1) ?? "")) {
    trailingText = `${urlText.at(-1) ?? ""}${trailingText}`;
    urlText = urlText.slice(0, -1);
  }

  while (urlText && shouldTrimClosingWrapper(urlText)) {
    trailingText = `${urlText.at(-1) ?? ""}${trailingText}`;
    urlText = urlText.slice(0, -1);
  }

  return { urlText, trailingText };
}

function shouldTrimClosingWrapper(value: string): boolean {
  const closing = value.at(-1) ?? "";
  const opening = WRAPPER_PAIRS[closing];

  if (!opening) {
    return false;
  }

  return countCharacter(value, closing) > countCharacter(value, opening);
}

function countCharacter(value: string, character: string): number {
  let count = 0;
  for (const current of value) {
    if (current === character) {
      count += 1;
    }
  }
  return count;
}
