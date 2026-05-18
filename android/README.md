# Android App

The Android app is a native WebView wrapper for a running Agent Tmux Web server.
It does not run tmux or CLI tools on the phone. The server still owns tmux,
uploads, launchers, and auth; the app stores only the server URL and optional
token on the device.

This app is sideload-only. It is not distributed through Google Play. Public APK
builds are generic and should open to the setup screen; private builds may
prefill a server URL/token for your own device.

## Build

Prerequisites:

- JDK 17+
- Android SDK platform 35
- Android SDK build-tools 35
- Android platform-tools if you want to install with `adb`

Build installable APKs:

```bash
cd android
./gradlew assembleDebug assembleRelease
```

Build a shareable public sideload APK with no embedded server URL or token:

```bash
pnpm android:build:public
```

The APKs are written to:

```text
android/app/build/outputs/apk/debug/agent-tmux-web-v<version>-debug.apk
android/app/build/outputs/apk/release/agent-tmux-web-v<version>-release.apk
```

Install on a connected Android device:

```bash
cd android
./gradlew installDebug
```

## Default Server

The app shows a setup screen when no server is configured. For private builds,
you can prefill the setup screen without committing local values:

```properties
# android/local.properties
sdk.dir=/path/to/android-sdk
agentTmuxDefaultUrl=http://YOUR_PRIVATE_SERVER:6174
agentTmuxDefaultToken=optional-token
```

`android/local.properties` is ignored by git.

Do not upload APKs built with `android/local.properties` unless you intentionally
want that private server URL/token embedded. For public release assets, use
`pnpm android:build:public`; it passes blank Gradle properties and runs an APK
string check before reporting success.

You can also pass values at build time:

```bash
cd android
./gradlew assembleDebug \
  -PagentTmuxDefaultUrl=http://YOUR_PRIVATE_SERVER:6174 \
  -PagentTmuxDefaultToken=optional-token
```

## Runtime Notes

- HTTP is allowed because many private installs run over LAN, VPN, or Tailscale.
- Use a private network path or authenticated reverse proxy; the app is terminal
  access to the server user.
- Public APKs are sideload-only setup wrappers. Users must enter their own
  private server URL and optional auth token.
- File inputs in the web UI open the Android file picker.
- Notifications use a native Android bridge. When enabled, the app runs a
  low-importance foreground watcher that polls the server for completed tmux
  tasks.
- The release APK is signed with the standard Android debug key for easy
  sideloading. Use your own signing key before publishing through an app store.
