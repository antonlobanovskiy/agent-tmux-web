# Google Play Publishing Guide

Agent Tmux Web is published as a generic Android client for a server selected
and operated by the user. A Play artifact must never contain a maintainer server
URL, auth token, local signing material, staged APK, upload, or machine-specific
configuration.

## Technical Baseline

- Application ID: `com.agenttmux.web`
- Minimum Android version: API 26 (Android 8.0)
- Compile and target API: 36
- Version name: `0.1.24`
- Version code: `25`
- App format: Android App Bundle (`.aab`)
- Privacy policy: [PRIVACY.md](../PRIVACY.md)

The public app starts on its setup screen and asks for a user-owned server URL
and optional token. HTTP remains available for private LAN, VPN, and Tailscale
deployments; HTTPS is recommended whenever the network path is not trusted.

## Build Validation

CI can build a generic, non-uploadable bundle without production credentials:

```bash
pnpm android:build:play:check
```

This validates the AAB and confirms that no server URL or token is embedded. It
uses local debug signing and must not be uploaded to Play Console.

## Play Upload Key

Enroll in Play App Signing and use a dedicated upload key. Let Google generate
and protect the app-signing key. Keep the upload keystore and credentials
outside this repository and back them up securely.

After creating the upload key, add these values to the ignored
`android/local.properties` file:

```properties
agentTmuxPlayStoreFile=/absolute/path/to/agent-tmux-play-upload.jks
agentTmuxPlayStorePassword=replace-me
agentTmuxPlayKeyAlias=agent-tmux-upload
agentTmuxPlayKeyPassword=replace-me
```

Build the uploadable bundle:

```bash
pnpm android:build:play
```

The command refuses to run without all four Play signing properties, rejects a
keystore named `debug.keystore`, verifies the generic artifact contents, checks
the AAB signature, and rejects Android's debug certificate. Its output is:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Do not use the Play upload key for private APKs. The existing
`agentTmuxRelease*` properties remain a separate local/private sideload signing
profile.

## Updates And Existing Installs

The server URL, optional token, WebView preferences, launcher pins, and custom
launchers remain configured across normal updates when the application ID and
signing identity do not change. Android cloud backup is disabled so the auth
token is not copied into device backups.

The current GitHub public APK is signed with a development certificate, and
private builds use the separate `com.agenttmux.web.private` application ID.
Neither can be updated in place by the first Play Store install. Those users
must uninstall or keep the apps side by side, install the Play version, and
configure it once. Updates delivered by Play after that preserve app data.

## Console Checklist

1. Create `Agent Tmux Web` in Play Console as an app, not a game.
2. Enroll in Play App Signing and register the dedicated upload certificate.
3. Complete the main store listing using [play-store-listing.md](./play-store-listing.md).
4. Upload the assets under `docs/play-store/assets/`.
5. Link the public privacy policy URL in Play Console.
6. Complete App access, Data safety, content rating, ads, target audience, and
   government-app declarations.
7. Upload `app-release.aab` to Internal testing first.
8. Test setup persistence, notifications, notification-to-session routing,
   file uploads, browser links, Tailscale/private HTTP, GUI, TTY, and raw tmux
   on a physical Android device.
9. If this is a new personal developer account, complete the required closed
   test before applying for production access.

## Review Access

The app requires a user-owned server, so Google reviewers need a stable way to
reach a functioning review environment plus precise setup credentials and
instructions in the App access declaration. Do not expose a maintainer's normal
private server. Create a limited review server or a purpose-built demo account
before production review, and remove access after the review when appropriate.

## Store Assets

Generate current assets from the real demo UI:

```bash
pnpm build
pnpm capture:play-store
```

The committed package includes:

- `icon-512.png`: 512 by 512 Play Store icon.
- `feature-graphic-1024x500.png`: 1024 by 500 feature graphic.
- Four 1080 by 1920 phone screenshots covering GUI, launchers, raw tmux, and
  light mode.

## References

- Target API requirements: https://developer.android.com/google/play/requirements/target-sdk
- Play App Signing: https://support.google.com/googleplay/android-developer/answer/9842756
- App testing requirements: https://support.google.com/googleplay/android-developer/answer/14151465
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
- App access review: https://support.google.com/googleplay/android-developer/answer/15191715
