import type { UploadedFileDto } from "../shared/api.js";

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

type ClipboardImageItem = {
  getAsFile: () => File | null;
  kind: string;
  type: string;
};

type ClipboardImageSource = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ClipboardImageItem> | null;
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

export function extractPastedImageFiles(source: ClipboardImageSource): File[] {
  const imageFilesFromItems = Array.from(source.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => ({ file: item.getAsFile(), itemType: item.type }))
    .filter((entry): entry is { file: File; itemType: string } => entry.file !== null)
    .filter((entry) => isImageFile(entry.file, entry.itemType))
    .map((entry, index) => normalizePastedImageFile(entry.file, index, entry.itemType));

  if (imageFilesFromItems.length > 0) {
    return imageFilesFromItems;
  }

  return Array.from(source.files ?? [])
    .filter((file) => isImageFile(file))
    .map((file, index) => normalizePastedImageFile(file, index));
}

export function buildPastedPromptText(pastedText: string, attachmentText: string): string {
  const cleanAttachmentText = attachmentText.trim();
  if (!pastedText) {
    return cleanAttachmentText;
  }
  if (!cleanAttachmentText) {
    return pastedText;
  }
  return `${pastedText.trimEnd()}\n\n${cleanAttachmentText}`;
}

export function formatUploadedFilesForPrompt(files: UploadedFileDto[]): string {
  const label = files.length === 1 ? "Attached file" : "Attached files";
  return `${label}: ${files.map((file) => file.reference).join(" ")}`;
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

function normalizePastedImageFile(file: File, index: number, itemType = ""): File {
  const name = file.name.trim();
  if (name) {
    return file;
  }

  const type = file.type || itemType || "image/png";
  return new File([file], `pasted-image-${index + 1}${imageExtensionForMimeType(type)}`, {
    lastModified: file.lastModified,
    type
  });
}

function isImageFile(file: File, itemType = ""): boolean {
  if (/^image\//i.test(file.type) || /^image\//i.test(itemType)) {
    return true;
  }
  return /\.(avif|bmp|gif|hei[cf]|jpe?g|png|svg|tiff?|webp)$/i.test(file.name);
}

function imageExtensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) {
    return ".jpg";
  }
  if (normalized.includes("svg")) {
    return ".svg";
  }
  if (normalized.includes("heic")) {
    return ".heic";
  }
  if (normalized.includes("heif")) {
    return ".heif";
  }
  if (normalized.includes("avif")) {
    return ".avif";
  }
  if (normalized.includes("webp")) {
    return ".webp";
  }
  if (normalized.includes("gif")) {
    return ".gif";
  }
  if (normalized.includes("bmp")) {
    return ".bmp";
  }
  if (normalized.includes("tiff")) {
    return ".tiff";
  }
  return ".png";
}
