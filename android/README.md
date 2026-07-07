# Android App

The Android app is a native WebView wrapper for a running Agent Tmux Web server.
It does not run tmux or CLI tools on the phone. The server still owns tmux,
uploads, launchers, and auth; the app stores only the server URL and optional
token on the device.

The app can be built as either a sideload APK or a Google Play Android App
Bundle. Public builds are generic and should open to the setup screen; private
builds may prefill a server URL/token for your own device.

## Build

Prerequisites:

- JDK 17+
- Android SDK platform 35
- Android SDK build-tools 35
- Android platform-tools if you want to install with `adb`

For most users, download the latest public APK from
[GitHub Releases](https://github.com/antonlobanovskiy/agent-tmux-web/releases).
Build locally only when you want to verify the source or create a private APK.

Build installable APKs:

```bash
cd android
./gradlew assembleDebug assembleRelease
```

Build a shareable public sideload APK with no embedded server URL or token:

```bash
pnpm android:build:public
```

Build a public Google Play upload bundle with no embedded server URL or token:

```bash
pnpm android:build:play
```

The APKs are written to:

```text
android/app/build/outputs/apk/debug/agent-tmux-web-v<version>-debug.apk
android/app/build/outputs/apk/release/agent-tmux-web-v<version>-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

Install on a connected Android device:

```bash
cd android
./gradlew installDebug
```

## Private APKs

Private APKs can embed your server URL/token and can install next to the public
app by using a separate package id. This avoids Android update failures caused
by installing the same package name with a different local signing key.

Set your private defaults in `android/local.properties`:

```properties
# android/local.properties
sdk.dir=/path/to/android-sdk
agentTmuxDefaultUrl=http://YOUR_PRIVATE_SERVER:6174
agentTmuxDefaultToken=optional-token
```

Build a private APK:

```bash
pnpm android:build:private
```

The private build defaults to:

- package id: `com.agenttmux.web.private`
- app label: `Agent Tmux Private`
- version code: public `versionCode` + `20000`
- version name: `<package.json version>-private`

Override those defaults when needed:

```bash
AGENT_TMUX_ANDROID_ID_SUFFIX=.work \
AGENT_TMUX_ANDROID_APP_LABEL="Agent Tmux Work" \
AGENT_TMUX_ANDROID_VERSION_CODE=20042 \
AGENT_TMUX_ANDROID_VERSION_NAME=0.1.19-work \
pnpm android:build:private
```

For repeat private installs on the same device, keep using the same package id
and signing key, and increase `AGENT_TMUX_ANDROID_VERSION_CODE` whenever you
want Android to treat the APK as an update.

Optional local release signing can be configured in `android/local.properties`.
Keystores under `android/` and `android/app/` are ignored by git.

```bash
cd android
keytool -genkeypair -v \
  -keystore private-release.jks \
  -storetype JKS \
  -alias agent-tmux-private \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

```properties
# android/local.properties
agentTmuxReleaseStoreFile=private-release.jks
agentTmuxReleaseStorePassword=your-store-password
agentTmuxReleaseKeyAlias=agent-tmux-private
agentTmuxReleaseKeyPassword=your-key-password
```

Without those signing properties, release APKs use the local Android debug key.
That is fine for personal testing, but it is not stable across machines.

## APK Delivery

Do not email APKs, or ZIP files containing APKs. Gmail and some mobile clients
block executable attachments and executable archives before they reach the
device.

Recommended options:

- Download public builds from GitHub Releases.
- Serve private builds from your Agent Tmux Web server over LAN, VPN, or
  Tailscale.
- Install directly with `adb install` when the phone is connected over USB.

To serve a built APK through the running Agent Tmux Web server:

```bash
pnpm android:stage-apk android/app/build/outputs/apk/release/agent-tmux-web-v<version>-release.apk
```

The staging command copies the APK to `dist/client/assets/` and prints a URL
like:

```text
http://YOUR_TAILSCALE_OR_LAN_HOST:6174/assets/agent-tmux-web-v<version>-release.apk
```

Verify the URL before sharing it:

```bash
curl -I http://YOUR_TAILSCALE_OR_LAN_HOST:6174/assets/agent-tmux-web-v<version>-release.apk
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
- Release APKs use the standard Android debug key unless local release signing
  properties are configured. Use your own signing key before publishing through
  an app store or distributing updates from multiple machines.
