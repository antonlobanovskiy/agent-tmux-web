# Changelog

All notable public changes to Agent Tmux Web are documented here.

This is an open-source repository. Public releases must stay generic and must
not include private server URLs, auth tokens, local `.env` files, staged APKs,
uploads, machine-specific service edits, or private signing material.

## Unreleased

## 0.1.21 - 2026-07-18

- Added OpenCode as the first built-in launcher.
- Enabled the OpenCode `Auto` mode by default so new installs launch
  `opencode --auto` from the default tool selection.
- Bumped the public Android version defaults to `0.1.21` / version code `22`.

## 0.1.20 - 2026-07-07

- Removed the Android popup-link fallback that created a hidden WebView before
  launching browser links, improving link tap responsiveness.
- Added a native Android long-press link menu with browser/app chooser and copy
  actions.
- Bumped the public Android version defaults to `0.1.20` / version code `21`.

## 0.1.19 - 2026-07-07

- Fixed tmux clean-copy so normal assistant replies copied from a phone-width
  tmux capture reflow hard-wrapped prose instead of preserving viewport line
  breaks.
- Fixed Android popup link handling so clicked chat/output links launch through
  the device browser instead of being routed back into the app WebView.
- Bumped the public Android version defaults to `0.1.19` / version code `20`.

## 0.1.18 - 2026-07-06

- Added clean-copy controls for tmux GUI assistant replies, including a latest
  reply toolbar action and per-message copy buttons that remove terminal quote
  wrapping from draft replies.
- Added a native Android clipboard bridge so copy actions in the APK write
  directly to the phone clipboard before falling back to browser clipboard APIs.
- Updated `/copy` to use the same mobile-safe clipboard path.
- Bumped the public Android version defaults to `0.1.18` / version code `19`.

## 0.1.17 - 2026-07-06

- Fixed raw tmux mode so browser attach resizes the tmux window immediately,
  preventing interactive redraws such as `/model` from leaving stale content
  outside an older pane size.
- Fixed Android link taps so external links opened from the app are handed to
  the phone's browser instead of loading inside the WebView.
- Bumped the public Android version defaults to `0.1.17` / version code `18`.

## 0.1.16 - 2026-07-03

- Cleaned up the public README flow and refreshed the generated demo/screenshot
  story for the current UI.
- Prevented the top tmux overview and Focus attention lists from showing the
  selected session or repeating the same session multiple times.
- Added clipboard image paste support for the chat composer and tmux prompt.
- Pasted images now upload through the existing temporary server upload path and
  insert an `Attached file on server: ...` prompt reference.
- Bumped the public Android version defaults to `0.1.16` / version code `17`.

## 0.1.15 - 2026-06-29

- Added green, yellow, and red status dots to the tmux session sidebar.
- Based tmux status on session activity metadata plus pane output so stale
  "working" text no longer appears as a live running task.
- Returned per-session status from `/api/tmux/sessions` and refreshed it
  periodically in the web UI.
- Bumped the public Android version defaults to `0.1.15` / version code `16`.

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
