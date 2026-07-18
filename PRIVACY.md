# Agent Tmux Web Privacy Policy

Effective date: July 18, 2026

Agent Tmux Web is an open-source Android and web client for an Agent Tmux Web
server selected and operated by the user. The project is developed and
maintained by Anton Lobanovskiy.

## Data The App Handles

The Android app stores the following information in its private app storage:

- The server URL entered by the user.
- The optional authentication token entered by the user.
- WebView cookies, local storage, theme, launcher pins, custom launchers, and
  other preferences created by the connected web interface.

Android cloud backup is disabled for the app. This local configuration remains
on the device during normal updates made with the same application ID and
signing identity. Clearing the app's storage or uninstalling it deletes the
local configuration.

## Network Traffic

The app connects only to the Agent Tmux Web server configured by the user. It
may send prompts, terminal input, uploaded files, notification polling requests,
and the optional authentication token to that server. It receives terminal
output, session metadata, and uploaded-file responses from that server.

The project maintainer does not operate an intermediary service and does not
receive this traffic. The selected server's operator is responsible for that
server's storage, access controls, retention, and privacy practices.

HTTPS encrypts traffic in transit. The app also permits HTTP because many users
connect over a LAN, VPN, or Tailscale network. HTTP does not provide application-
layer transport encryption, so users should limit it to a trusted private
network or use an authenticated HTTPS reverse proxy.

## Collection, Sharing, And Tracking

The app contains no advertising, analytics, telemetry, or third-party tracking
SDK. The project maintainer does not collect, sell, rent, or share personal data
through the app.

## Android Permissions

The app uses network access to reach the user-configured server, notifications
and a foreground data-sync service for optional session alerts, and Android's
system file picker when the user chooses a file to upload. It does not request
broad access to device storage.

## Children

Agent Tmux Web is a developer tool and is not directed to children under 13.

## Changes

Material changes to this policy will be published in this repository and the
effective date above will be updated.

## Contact

Privacy questions can be submitted to the project maintainer through the
[Agent Tmux Web issue tracker](https://github.com/antonlobanovskiy/agent-tmux-web/issues).
