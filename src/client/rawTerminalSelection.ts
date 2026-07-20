export type RawTerminalSelectionOptions = {
  onCopied?: () => void;
  onError?: (message: string) => void;
  readSelection: () => string;
  writeClipboard: (text: string) => Promise<void>;
};

export function createRawTerminalSelectionHandler(options: RawTerminalSelectionOptions): () => void {
  let previousSelection = "";
  return () => {
    const selection = options.readSelection();
    if (!selection) {
      previousSelection = "";
      return;
    }
    if (selection === previousSelection) {
      return;
    }
    previousSelection = selection;
    void options.writeClipboard(selection)
      .then(() => options.onCopied?.())
      .catch(() => options.onError?.("Clipboard copy failed"));
  };
}
