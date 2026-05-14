import { describe, expect, it } from "vitest";

import {
  filterSlashCommands,
  parseSlashCommand,
  replaceSlashQuery,
  slashQueryForMessage,
  SLASH_COMMANDS
} from "../slashCommands.js";

describe("slash command composer helpers", () => {
  it("opens completion when the current line starts with a slash", () => {
    expect(slashQueryForMessage("/sta", 4)).toEqual({ start: 0, end: 4, query: "sta" });
    expect(slashQueryForMessage("run tests\n/mo", 13)).toEqual({ start: 10, end: 13, query: "mo" });
  });

  it("does not open completion for slash text in the middle of prose or after args", () => {
    expect(slashQueryForMessage("please use /status", 18)).toBeNull();
    expect(slashQueryForMessage("/model gpt-5.5", 14)).toBeNull();
  });

  it("filters known Codex CLI slash commands by name and description", () => {
    expect(filterSlashCommands("stat").map((command) => command.name)).toContain("/status");
    expect(filterSlashCommands("stat")[0]?.name).toBe("/status");
    expect(filterSlashCommands("reasoning").map((command) => command.name)).toContain("/model");
    expect(SLASH_COMMANDS.length).toBeGreaterThan(20);
  });

  it("replaces the active slash query with a selected command", () => {
    expect(replaceSlashQuery("/sta", 4, "/status")).toEqual({
      message: "/status ",
      selectionStart: 8
    });
  });

  it("parses a slash command name and inline arguments", () => {
    expect(parseSlashCommand("/model gpt-5.5 xhigh")).toEqual({
      name: "/model",
      args: "gpt-5.5 xhigh"
    });
    expect(parseSlashCommand("regular prompt")).toBeNull();
  });
});
