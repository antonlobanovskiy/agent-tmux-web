export type ColorTheme = "dark" | "light";

export const COLOR_THEME_STORAGE_KEY = "agent-tmux-web.theme";

export function normalizeColorTheme(value: unknown): ColorTheme | null {
  return value === "dark" || value === "light" ? value : null;
}

export function resolveInitialColorTheme(storedTheme: unknown, prefersLight: boolean): ColorTheme {
  return normalizeColorTheme(storedTheme) ?? (prefersLight ? "light" : "dark");
}

export function nextColorTheme(theme: ColorTheme): ColorTheme {
  return theme === "dark" ? "light" : "dark";
}
