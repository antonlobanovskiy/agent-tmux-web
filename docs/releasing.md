# Releasing Agent Tmux Web

Public releases must be built from a reviewed commit on `main`. Never publish a
private server URL, token, upload, local `.env`, signing secret, staged private
APK, or machine-specific service file.

## Development And Production

Use `pnpm dev` for the continuously running private development environment.
It serves the client through Vite middleware, supports HMR, reports
`environment: development` from `/api/status`, and shows a `DEV` badge in the
UI. The example `ops/systemd/codex-web.service` unit uses this mode. Server
source changes require an intentional service restart; client changes continue
to update through Vite HMR. App or Raw transport edits can reconnect an open
Raw view, so switch active work to TTY first. Vite source modules are
public to the private development listener even when control APIs require an
auth token.

Use `pnpm build && pnpm start` when validating or publishing production. It
serves only the built `dist/client` assets, reports `environment: production`,
and shows a `PROD` badge. The example `ops/systemd/agent-tmux-web.service` unit
uses this mode. Never expose the development server directly to the public
internet.

## Prepare

1. Choose the next semantic version and increment the Android version code.
2. Keep `package.json`, `android/app/build.gradle`, public Android build flags,
   and `CHANGELOG.md` aligned.
3. Update current README, setup, marketing, and release documentation.
4. Regenerate marketing media only from loopback demo mode and fake data:

   ```bash
   pnpm build
   pnpm capture:marketing
   ```

5. Inspect every PNG, representative MP4 frames, visible copy, metadata, and
   the complete git diff before committing.

## Verify

```bash
pnpm test
pnpm test:raw-focus
pnpm typecheck
pnpm build
ANDROID_HOME=/usr/lib/android-sdk ANDROID_SDK_ROOT=/usr/lib/android-sdk \
  ./android/gradlew -p android clean testDebugUnitTest testReleaseUnitTest lintDebug --rerun-tasks
ANDROID_HOME=/usr/lib/android-sdk ANDROID_SDK_ROOT=/usr/lib/android-sdk \
  pnpm android:build:public
ANDROID_HOME=/usr/lib/android-sdk ANDROID_SDK_ROOT=/usr/lib/android-sdk \
  pnpm android:build:play
pnpm android:verify-public-apk
pnpm android:verify-public-apk android/app/build/outputs/bundle/release/app-release.aab
```

Open the production server and confirm `/api/status` reports
`"environment":"production"`, the UI shows `PROD`, and no `/@vite/client`
script is present before publishing.

Verify the APK package/version, inspect APK and AAB signer identities, and
calculate SHA-256 checksums for both Android artifacts and the showcase MP4.
Public builds must use blank default URL/token values and the generic
`com.agenttmux.web` application ID.

## Publish

1. Push a release branch and open a reviewed pull request against `main`.
2. Wait for Web and Android checks, then merge without bypassing failures.
3. Rebuild all release artifacts from the exact merged `main` commit.
4. Create a lightweight `vX.Y.Z` tag through a GitHub release titled
   `Agent Tmux Web vX.Y.Z`.
5. Attach the generic APK, generic AAB, and showcase MP4. Label a debug-signed
   AAB as a test artifact; call it Play-upload-ready only when it uses the
   configured upload key. Include highlights, privacy status, verification
   evidence, and all three SHA-256 values.
6. Download or inspect every published asset and confirm the tag resolves to
   the rebuilt release commit.
