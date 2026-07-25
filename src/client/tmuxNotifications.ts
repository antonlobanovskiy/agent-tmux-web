export type TmuxTransitionNotification = {
  title: string;
  body: string;
  tag: string;
  tmuxSession: string;
};

export function buildTmuxTransitionNotification(
  session: string,
  label: string,
  state: "waiting-for-input" | "idle"
): TmuxTransitionNotification {
  const tmuxSession = session.trim();
  const taskLabel = label.trim() || "Tmux task";
  if (state === "idle") {
    return {
      title: `${tmuxSession} is idle`,
      body: `${taskLabel} is idle in ${tmuxSession}.`,
      tag: `agent-tmux-web-${tmuxSession}`,
      tmuxSession
    };
  }
  return {
    title: `${tmuxSession} needs input`,
    body: `${taskLabel} needs input in ${tmuxSession}.`,
    tag: `agent-tmux-web-${tmuxSession}`,
    tmuxSession
  };
}
