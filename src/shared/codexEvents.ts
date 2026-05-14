type JsonRecord = Record<string, unknown>;

export type UiEventKind =
  | "assistant-delta"
  | "reasoning-delta"
  | "plan-delta"
  | "tool-output"
  | "item-started"
  | "item-completed"
  | "status"
  | "unknown";

export type UiEventDescription = {
  kind: UiEventKind;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  title?: string;
  body?: string;
  text?: string;
  status?: string;
};

export type ThreadItemSummary = {
  kind: "user" | "assistant" | "reasoning" | "plan" | "tool" | "file" | "status";
  title: string;
  body: string;
  status?: string;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function prettyJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function maybeDecodeBase64(text: string): string {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) {
    return text;
  }

  try {
    const decoded =
      typeof Buffer !== "undefined"
        ? Buffer.from(text, "base64").toString("utf8")
        : atob(text);
    if (decoded && /^[\t\r\n\x20-\x7e]*$/.test(decoded)) {
      return decoded;
    }
  } catch {
    return text;
  }

  return text;
}

export function describeThreadItem(item: JsonRecord): ThreadItemSummary {
  switch (item.type) {
    case "userMessage":
      return {
        kind: "user",
        title: "You",
        body: Array.isArray(item.content)
          ? item.content.map((entry) => prettyJson(asRecord(entry).text ?? entry)).join("\n")
          : ""
      };
    case "agentMessage":
      return {
        kind: "assistant",
        title: "Agent",
        body: String(item.text ?? "")
      };
    case "reasoning":
      return {
        kind: "reasoning",
        title: "Reasoning",
        body: Array.isArray(item.summary) ? item.summary.join("\n") : ""
      };
    case "plan":
      return {
        kind: "plan",
        title: "Plan",
        body: String(item.text ?? "")
      };
    case "commandExecution":
      return {
        kind: "tool",
        title: "Shell",
        body: formatCommandBody(item),
        status: String(item.status ?? "")
      };
    case "fileChange":
      return {
        kind: "file",
        title: "File Change",
        body: prettyJson(item.changes ?? []),
        status: String(item.status ?? "")
      };
    case "mcpToolCall":
      return {
        kind: "tool",
        title: `${String(item.server ?? "mcp")}.${String(item.tool ?? "tool")}`,
        body: prettyJson(item.arguments ?? {}),
        status: String(item.status ?? "")
      };
    case "dynamicToolCall":
      return {
        kind: "tool",
        title: [item.namespace, item.tool].filter(Boolean).join("."),
        body: prettyJson(item.arguments ?? {}),
        status: String(item.status ?? "")
      };
    case "collabAgentToolCall":
      return {
        kind: "tool",
        title: `Agent ${String(item.tool ?? "tool")}`,
        body: String(item.prompt ?? ""),
        status: String(item.status ?? "")
      };
    case "webSearch":
      return {
        kind: "tool",
        title: "Web Search",
        body: String(item.query ?? ""),
        status: item.action ? prettyJson(item.action) : undefined
      };
    case "imageGeneration":
      return {
        kind: "tool",
        title: "Image Generation",
        body: String(item.revisedPrompt ?? item.result ?? ""),
        status: String(item.status ?? "")
      };
    default:
      return {
        kind: "status",
        title: String(item.type ?? "Event"),
        body: prettyJson(item)
      };
  }
}

function formatCommandBody(item: JsonRecord): string {
  const parts = [String(item.command ?? "")];
  if (typeof item.aggregatedOutput === "string" && item.aggregatedOutput.length > 0) {
    parts.push(`Output:\n${item.aggregatedOutput}`);
  }
  if (typeof item.exitCode === "number") {
    parts.push(`Exit code: ${item.exitCode}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

export function describeCodexNotification(notification: JsonRecord): UiEventDescription {
  const method = String(notification.method ?? "");
  const params = asRecord(notification.params);

  if (method === "item/agentMessage/delta") {
    return {
      kind: "assistant-delta",
      threadId: String(params.threadId ?? ""),
      turnId: String(params.turnId ?? ""),
      itemId: String(params.itemId ?? ""),
      text: String(params.delta ?? "")
    };
  }

  if (method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/textDelta") {
    return {
      kind: "reasoning-delta",
      threadId: String(params.threadId ?? ""),
      turnId: String(params.turnId ?? ""),
      itemId: String(params.itemId ?? ""),
      text: String(params.delta ?? "")
    };
  }

  if (method === "item/plan/delta") {
    return {
      kind: "plan-delta",
      threadId: String(params.threadId ?? ""),
      turnId: String(params.turnId ?? ""),
      itemId: String(params.itemId ?? ""),
      text: String(params.delta ?? "")
    };
  }

  if (method === "item/commandExecution/outputDelta" || method === "command/exec/outputDelta") {
    return {
      kind: "tool-output",
      threadId: typeof params.threadId === "string" ? params.threadId : undefined,
      turnId: typeof params.turnId === "string" ? params.turnId : undefined,
      itemId: String(params.itemId ?? params.processId ?? ""),
      text: maybeDecodeBase64(String(params.delta ?? ""))
    };
  }

  if (method === "item/started" || method === "item/completed") {
    const item = asRecord(params.item);
    const summary = describeThreadItem(item);
    return {
      kind: method === "item/started" ? "item-started" : "item-completed",
      threadId: String(params.threadId ?? ""),
      turnId: String(params.turnId ?? ""),
      itemId: String(item.id ?? ""),
      title: summary.title,
      body: summary.body,
      status: summary.status
    };
  }

  if (method === "thread/status/changed") {
    return {
      kind: "status",
      threadId: String(params.threadId ?? ""),
      status: formatStatus(params.status),
      title: "Thread Status",
      body: formatStatus(params.status)
    };
  }

  return {
    kind: "unknown",
    title: method,
    body: prettyJson(params)
  };
}

function formatStatus(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const record = asRecord(value);
  for (const key of ["status", "state", "turnStatus", "type"]) {
    if (typeof record[key] === "string") {
      return record[key];
    }
  }

  return prettyJson(value);
}
