const XTERM_GESTURE_CHANGE_EVENT = "-xterm-gesturechange";

type RawTerminalGestureCoordinates = {
  clientX?: number;
  clientY?: number;
  pageX?: number;
  pageY?: number;
};

type RawTerminalGestureTarget = Pick<HTMLElement, "addEventListener" | "removeEventListener">;

export function shouldBlockRawTerminalGesture(event: RawTerminalGestureCoordinates): boolean {
  return ![event.clientX, event.clientY, event.pageX, event.pageY].every(Number.isFinite);
}

export function installRawTerminalGestureGuard(node: RawTerminalGestureTarget): () => void {
  const stopInvalidInertia = (event: Event) => {
    if (shouldBlockRawTerminalGesture(event as MouseEvent)) {
      event.stopImmediatePropagation();
    }
  };
  node.addEventListener(XTERM_GESTURE_CHANGE_EVENT, stopInvalidInertia, true);
  return () => node.removeEventListener(XTERM_GESTURE_CHANGE_EVENT, stopInvalidInertia, true);
}
