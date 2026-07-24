# Source Registry

This repository exposes a shadcn-compatible GitHub source registry. The registry
is meant for discovery, inspection, dry runs, and agent-assisted source
adaptation. The normal install path is still the installer in `INSTALL.md` or a
regular `git clone`.

Useful commands:

```bash
pnpm dlx shadcn@latest list antonlobanovskiy/agent-tmux-web
pnpm dlx shadcn@latest search antonlobanovskiy/agent-tmux-web --query tmux
pnpm dlx shadcn@latest view antonlobanovskiy/agent-tmux-web/full-project
pnpm dlx shadcn@latest add antonlobanovskiy/agent-tmux-web/full-project --dry-run
```

Run `add --dry-run` from the target project directory. On first use, shadcn may
ask to create `components.json` before it can calculate the install preview.

Registry items:

- `full-project`: self-contained, deduplicated project bundle for source inspection and adaptation.
- `web-app`: Vite, React, Express, tmux, upload, and Codex bridge source.
- `vps-deploy`: installer, systemd templates, environment example, and setup docs.
- `android-wrapper`: Android WebView wrapper, sideload APK, AAB, upload bridge,
  and notification watcher source.
- `notifications`: notification routing and waiting-tab source slice.

The registry intentionally focuses on editable source, docs, scripts, and config.
Clone the repository when you need binary media assets, launcher images, or the
Gradle wrapper jar.

Only immutable tags and full commit SHAs are reproducible. Branch refs are
mutable and intended for previews. The `full-project` item contains its complete
source payload directly, so an exact ref does not resolve component items from
the default branch:

```bash
pnpm dlx shadcn@latest view antonlobanovskiy/agent-tmux-web/full-project#main
pnpm dlx shadcn@latest view antonlobanovskiy/agent-tmux-web/full-project#v0.1.9
```

Do not expose Agent Tmux Web directly to the public internet. Treat browser
access as terminal access to the server user running the app.
