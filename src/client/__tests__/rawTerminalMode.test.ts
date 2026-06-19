import { describe, expect, it } from "vitest";

import { shouldShowTmuxSendForm } from "../rawTerminalMode.js";

describe("raw terminal mode", () => {
  it("hides the tmux send form while raw terminal input is active", () => {
    expect(shouldShowTmuxSendForm({ terminalActive: true })).toBe(false);
  });

  it("shows the tmux send form outside raw terminal input mode", () => {
    expect(shouldShowTmuxSendForm({ terminalActive: false })).toBe(true);
  });
});
