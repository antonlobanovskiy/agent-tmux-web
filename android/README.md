# Android App

The Android app is a native WebView wrapper for a running Agent Tmux Web server.
It does not run tmux or CLI tools on the phone. The server still owns tmux,
uploads, launchers, and auth; the app stores only the server URL and optional
token on the device.

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

The APKs are written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
android/app/build/outputs/apk/release/app-release.apk
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
- File inputs in the web UI open the Android file picker.
- Browser notifications use a native Android bridge inside the app.
- The release APK is signed with the standard Android debug key for easy
  sideloading. Use your own signing key before publishing through an app store.
