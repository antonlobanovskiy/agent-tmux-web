export type AndroidBridge = {
  notificationsEnabled?: () => boolean;
  notify?: (title: string, body: string, tag: string) => void;
  notifyForSession?: (title: string, body: string, tag: string, tmuxSession: string) => void;
  openExternalLink?: (url: string) => boolean;
  setWatchPollingEnabled?: (enabled: boolean) => void;
  writeClipboard?: (text: string) => boolean;
};

declare global {
  interface Window {
    AgentTmuxAndroid?: AndroidBridge;
  }
}
