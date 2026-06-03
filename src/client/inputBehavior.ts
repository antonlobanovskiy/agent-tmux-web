export type InputDeviceContext = {
  coarsePointer?: boolean;
  maxTouchPoints?: number;
  platform?: string;
  userAgent?: string;
  userAgentDataMobile?: boolean;
};

export type TextareaPasteResult = {
  selectionEnd: number;
  selectionStart: number;
  value: string;
};

type EnterKeyLike = {
  key: string;
  shiftKey: boolean;
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    mobile?: boolean;
  };
};

const MOBILE_USER_AGENT_PATTERN = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function applyTextareaPaste(value: string, selectionStart: number, selectionEnd: number, pastedText: string): TextareaPasteResult {
  const start = clampSelection(selectionStart, value.length);
  const end = clampSelection(Math.max(selectionEnd, start), value.length);
  const nextCaret = start + pastedText.length;

  return {
    value: `${value.slice(0, start)}${pastedText}${value.slice(end)}`,
    selectionStart: nextCaret,
    selectionEnd: nextCaret
  };
}

export function readInputDeviceContext(): InputDeviceContext {
  if (typeof navigator === "undefined") {
    return {};
  }

  const nav = navigator as NavigatorWithUserAgentData;
  return {
    coarsePointer: typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: none) and (pointer: coarse)").matches
      : undefined,
    maxTouchPoints: nav.maxTouchPoints,
    platform: nav.platform,
    userAgent: nav.userAgent,
    userAgentDataMobile: nav.userAgentData?.mobile
  };
}

export function isMobileInputDevice(context: InputDeviceContext): boolean {
  if (context.userAgentDataMobile === true) {
    return true;
  }

  const userAgent = context.userAgent ?? "";
  if (MOBILE_USER_AGENT_PATTERN.test(userAgent)) {
    return true;
  }

  if (context.platform === "MacIntel" && (context.maxTouchPoints ?? 0) > 1) {
    return true;
  }

  return context.coarsePointer === true
    && (context.maxTouchPoints ?? 0) > 0
    && !/Windows NT|X11|Linux x86_64/i.test(userAgent);
}

export function shouldSubmitTextareaEnter(event: EnterKeyLike, context = readInputDeviceContext()): boolean {
  return event.key === "Enter" && !event.shiftKey && !isMobileInputDevice(context);
}

function clampSelection(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return max;
  }
  return Math.max(0, Math.min(value, max));
}
