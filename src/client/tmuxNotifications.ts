export type TmuxDoneNotification = {
  title: string;
  body: string;
  tag: string;
  tmuxSession: string;
};

export function buildTmuxDoneNotification(session: string, label: string): TmuxDoneNotification {
  const tmuxSession = session.trim();
  const taskLabel = label.trim() || "Tmux task";
  return {
    title: `${tmuxSession} tab is waiting`,
    body: `${taskLabel} finished in ${tmuxSession} and is waiting for input.`,
    tag: `agent-tmux-web-${tmuxSession}`,
    tmuxSession
  };
}
