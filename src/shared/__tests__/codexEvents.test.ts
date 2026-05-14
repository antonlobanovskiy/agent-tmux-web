import { describe, expect, it } from "vitest";

import { describeCodexNotification, describeThreadItem } from "../codexEvents.js";

describe("describeThreadItem", () => {
  it("summarizes commands and tool calls with useful labels", () => {
    expect(
      describeThreadItem({
        type: "commandExecution",
        id: "cmd1",
        command: "pnpm test",
        cwd: "/workspace/project",
        processId: "p1",
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      })
    ).toMatchObject({
      kind: "tool",
      title: "Shell",
      body: "pnpm test",
      status: "inProgress"
    });

    expect(
      describeThreadItem({
        type: "commandExecution",
        id: "cmd2",
        command: "printf RESULT",
        cwd: "/workspace/project",
        processId: "p2",
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "RESULT_FROM_STDOUT",
        exitCode: 0,
        durationMs: 7
      }).body
    ).toContain("RESULT_FROM_STDOUT");

    expect(
      describeThreadItem({
        type: "mcpToolCall",
        id: "mcp1",
        server: "gmail",
        tool: "send",
        status: "completed",
        arguments: { to: "me@example.com" },
        result: null,
        error: null,
        durationMs: 10
      })
    ).toMatchObject({
      kind: "tool",
      title: "gmail.send",
      status: "completed"
    });
  });
});

describe("describeCodexNotification", () => {
  it("extracts streaming assistant text and command output deltas", () => {
    expect(
      describeCodexNotification({
        method: "item/agentMessage/delta",
        params: { threadId: "t1", turnId: "r1", itemId: "a1", delta: "hello" }
      })
    ).toEqual({
      kind: "assistant-delta",
      threadId: "t1",
      turnId: "r1",
      itemId: "a1",
      text: "hello"
    });

    expect(
      describeCodexNotification({
        method: "item/commandExecution/outputDelta",
        params: { threadId: "t1", turnId: "r1", itemId: "cmd1", delta: "ZXJyb3I=" }
      })
    ).toMatchObject({
      kind: "tool-output",
      threadId: "t1",
      turnId: "r1",
      itemId: "cmd1",
      text: "error"
    });
  });
});
