# Google Play Listing Packet

## Main Listing

**App name**

Agent Tmux Web

**Short description**

Control private tmux coding-agent sessions from your Android device.

**Full description**

Agent Tmux Web is the Android companion for your self-hosted Agent Tmux Web
server. Tmux keeps terminal agents running on your own machine while the app
gives you a phone-friendly control surface.

Switch among active tmux sessions, read normalized agent output, inspect plain
TTY capture, or attach to the raw terminal when exact shell and TUI interaction
matters. Session status indicators show what is active, waiting for input, or in
an error state. Native notifications can open the session that needs attention.

The app also supports temporary file uploads through your server, clickable
links, stable scrollback while output continues, light and dark themes, pinned
CLI launchers, and locally saved custom commands.

Agent Tmux Web does not host tmux or coding agents on the phone. You must install
and run the open-source Agent Tmux Web server on a computer or VPS you control,
then enter that server URL and optional token in the app. Tailscale, another
private VPN, LAN access, or an authenticated HTTPS reverse proxy is recommended.

The app contains no ads, analytics, hosted AI service, or third-party tracking.
Source code and server setup instructions are available on GitHub.

## Classification

- App or game: App
- Category: Tools
- Ads: No
- Target audience: 18 and over
- Government app: No
- News app: No
- Financial features: No
- Health features: No

Complete the content-rating questionnaire from the actual app behavior; do not
infer answers from this draft when Play Console asks a differently worded
question.

## Data Safety Draft

The project maintainer does not collect or share app data and the app contains
no ads, analytics, or tracking SDK. The app does transmit user-entered prompts,
terminal input, uploaded files, an optional token, and notification requests to
the server chosen and controlled by the user. HTTPS is supported, but HTTP is
also allowed for trusted LAN/VPN/Tailscale deployments, so do not claim that all
traffic is encrypted in transit.

Use these facts when completing Play Console's current questionnaire:

- Server URL and optional token are stored in private on-device app storage.
- Android cloud backup is disabled.
- WebView cookies, local storage, launcher pins, and preferences stay on-device.
- The maintainer has no intermediary backend and cannot access user traffic.
- Users initiate prompt, terminal-input, and file-upload transfers.
- The optional notification watcher polls only the selected server.
- Clearing app storage or uninstalling deletes local app data.
- Server-side deletion and retention are controlled by the server owner.

Google's definitions and questionnaire branching determine whether transfers to
a user-owned server must be declared as collection. Recheck the live form before
submission and keep the answers consistent with [PRIVACY.md](../PRIVACY.md).

## App Access Draft

The app cannot be fully reviewed without an Agent Tmux Web server. Before
production review, provide Google with:

- A limited review-server URL reachable from the public internet.
- A review-only token if authentication is enabled.
- Exact setup steps: open app, enter URL/token, tap Connect.
- A pre-created tmux demo session that exercises GUI, TTY, and raw views.
- Any expiration date or access limitation the reviewer should know.

Do not provide the maintainer's personal Tailscale server or production terminal
account as review access.

## Release Notes

Initial Play testing release:

> Connect to your self-hosted Agent Tmux Web server from Android. This build
> includes session switching, GUI/TTY/raw views, native waiting-session
> notifications, file uploads, browser links, themes, and persistent on-device
> setup across Play updates.
