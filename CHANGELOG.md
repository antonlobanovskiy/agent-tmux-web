# Changelog

All notable public changes to Agent Tmux Web are documented here.

This is an open-source repository. Public releases must stay generic and must
not include private server URLs, auth tokens, local `.env` files, staged APKs,
uploads, machine-specific service edits, or private signing material.

## 0.1.14 - 2026-06-26

- Made Focus tmux mode opt-in instead of the default session view.
- Cleaned up desktop Focus mode by hiding the duplicate status strip while the
  Focus panel is open.
- Filtered source diffs, code snippets, and terminal spinner/status lines out of
  Focus summaries so code output does not fill the compact cards.
- Bumped the public Android version defaults to `0.1.14` / version code `15`.

## 0.1.13 - 2026-06-26

- Added a Focus tmux view for phone check-ins with agent status, compact recent
  conversation, and recent waiting-session attention items.
- Added tmux agent status classification for permission prompts, questions,
  errors, waiting, running, and idle states.
- Added a Play Store readiness guide and `pnpm android:build:play` for public
  Android App Bundle generation.
- Extended public Android artifact verification to inspect AAB files as well as
  APKs.
- Bumped the public Android version defaults to `0.1.13` / version code `14`.

## 0.1.12 - 2026-06-19

- Made raw terminal mode direct-input only by hiding the tmux send form while
  attached and refocusing the xterm surface after terminal taps or soft-key use.
- Bumped the public Android version defaults to `0.1.12` / version code `13`.

## 0.1.11 - 2026-06-19

- Made HTTP, HTTPS, and `www.` URLs clickable in the default web chat,
  non-GUI terminal capture, and Codex timeline views while keeping code block
  output literal.
- Added link parsing coverage for URL punctuation, `www.` normalization, and
  unsafe schemes.
- Updated the source registry bundle to include all current client helpers and
  tests.
- Bumped the public Android version defaults to `0.1.11` / version code `12`.

## 0.1.10 - 2026-06-03

- Reduced tmux refresh jitter and preserved scroll position in terminal and GUI
  views while sessions continue producing output.
- Added a shadcn-compatible source registry with installable source bundles for
  the full project, web app, VPS deploy kit, Android wrapper, and notifications.
- Documented the source registry in the README.
- Improved large paste handling for Codex composer and tmux prompt inputs.
- Kept desktop Enter-to-send behavior while making mobile keyboard Enter insert
  a newline; mobile users send with the button.
- Chunked large tmux sends and raised the configurable JSON request limit for
  pasted prompts and tmux input.
- Bumped the public Android version defaults to `0.1.10` / version code `11`.

## 0.1.9 - 2026-05-30

- Fixed Android CI public APK artifact naming and verification flow.
- Hardened public/private APK distribution docs and checks.
