# Google Play Readiness

Agent Tmux Web can be published to Google Play as a generic WebView client for a
user-owned Agent Tmux Web server. The store artifact must not include a private
server URL, auth token, local signing material, staged APKs, uploads, or
machine-specific files.

## Build Artifact

Google Play uses Android App Bundles to generate device-specific APKs. Build the
public upload bundle with blank defaults:

```bash
pnpm android:build:play
```

The bundle is written to:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

The command also runs the public Android artifact string check against the AAB.
Configure all four `agentTmuxRelease*` signing properties before uploading this
bundle to Play. Without them, local verification falls back to the Android debug
key and the resulting AAB is only a generic test artifact.

For sideload releases, continue using:

```bash
pnpm android:build:public
```

## Current Technical Fit

- `targetSdk` is `35`, matching Google Play's Android 15 target API requirement
  for new apps and updates.
- Public Play builds use package id `com.agenttmux.web`.
- Public builds open to the setup screen and require the user to enter their own
  private server URL and optional token.
- The app allows HTTP because common private deployments use LAN, VPN, or
  Tailscale. The store listing and privacy policy should explain that users
  control their own server endpoint.

## Play Console Checklist

- Create the app in Play Console.
- Enroll in Play App Signing and keep the upload key outside the repository.
- Upload `app-release.aab` to an internal testing track first.
- Complete Data safety truthfully. The app stores the server URL and optional
  token locally on device and sends requests only to the user-configured server.
- Publish a privacy policy URL before wider testing or production release.
- Add store listing text, screenshots, icon, feature graphic, content rating,
  app category, and contact email.
- Verify the app starts at setup with no embedded maintainer server URL/token.
- Test notification permission, file picker uploads, Tailscale/private HTTP
  setup, and session-opening notification routing on a real Android device.

## Policy Notes

- Do not market this as a hosted AI service; it is a control surface for a
  user-owned server.
- Do not imply the app includes tmux, hosted agents, or third-party coding
  harnesses such as OpenCode, Codex, Claude Code, Gemini CLI, GitHub Copilot,
  Cursor Agent, Qwen Code, Cline, Aider, goose, or Amp. Those tools run on the
  user's server.
- Treat the auth token like terminal access. Store listing copy should recommend
  Tailscale, VPN, SSH tunnel, LAN-only access, or an authenticated reverse proxy.

## References

- Target API level requirement: https://developer.android.com/google/play/requirements/target-sdk
- Android App Bundles in Play Console: https://support.google.com/googleplay/android-developer/answer/9859152
- Play App Signing: https://support.google.com/googleplay/android-developer/answer/9842756
- Data safety form: https://support.google.com/googleplay/android-developer/answer/10787469
