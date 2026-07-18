import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "docs", "assets");
const framesDir = path.join(assetsDir, "frames");
const appPort = Number(process.env.MARKETING_APP_PORT ?? 6180);
const appUrl = process.env.MARKETING_URL ?? `http://127.0.0.1:${appPort}`;
const demoUrl = `${appUrl}/?demo=1`;
const showcaseScenes = [
  {
    eyebrow: "Private server control",
    title: "Terminal agents keep running when your phone disconnects",
    body: "Run OpenCode, Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor Agent, Qwen Code, Cline, Aider, goose, Amp, and custom CLIs inside tmux on your own server. The browser or Android app is only the control surface.",
    bullets: ["tmux owns the process", "phone and laptop can reconnect", "private network friendly"],
    media: "../mobile-chat.png",
    layout: "phone"
  },
  {
    eyebrow: "GUI mode",
    title: "Read agent output like a chat thread",
    body: "Use the normalized GUI when the CLI is planning, summarizing, or showing command output you want to scan quickly.",
    bullets: ["readable prompts", "code and terminal blocks", "clickable links"],
    media: "../mobile-chat.png",
    layout: "phone"
  },
  {
    eyebrow: "Session overview",
    title: "See which tmux tab needs attention",
    body: "Green, yellow, and red dots show running, waiting, and error states. The overview keeps attention targets unique so the same session is not repeated.",
    bullets: ["per-session status dots", "waiting tabs surfaced", "no duplicate session pills"],
    media: "../mobile-focus.png",
    layout: "phone"
  },
  {
    eyebrow: "Stable scrolling",
    title: "Scroll back without losing your place",
    body: "Auto-capture keeps updating tmux output, but it will not yank you to the bottom while you are reading earlier history.",
    bullets: ["position stays put", "jump-to-latest button", "deeper 1000-line capture"],
    media: "../mobile-scroll.png",
    layout: "phone"
  },
  {
    eyebrow: "TTY mode",
    title: "Keep plain pane capture one tap away",
    body: "Switch back to text capture when you want raw pane output without attaching to the interactive terminal.",
    bullets: ["exact pane text", "Force Sync", "easy copy context"],
    media: "../mobile-tty.png",
    layout: "phone"
  },
  {
    eyebrow: "tmux mode",
    title: "Drop into exact tmux control when you need it",
    body: "Attach to the raw terminal from mobile or desktop and type directly into tmux when you need exact shell or TUI behavior.",
    bullets: ["native TUI behavior", "soft terminal keys on mobile", "detach without killing work"],
    media: "../mobile-raw-terminal.png",
    layout: "phone"
  },
  {
    eyebrow: "Session control",
    title: "See live tmux sessions and launch the right tool",
    body: "Switch sessions, browse launchers alphabetically, pin favorites, or save a named custom command from the same panel.",
    bullets: ["alphabetical launchers", "pinned favorites", "custom commands"],
    media: "../mobile-launchers.png",
    layout: "phone"
  },
  {
    eyebrow: "Light and dark",
    title: "Use the theme that fits where you are",
    body: "Toggle between dark mode and a bright light mode when you are outside or working from a laptop in direct light.",
    bullets: ["one-tap theme switch", "mobile and desktop", "preference saved locally"],
    media: "../mobile-light.png",
    layout: "phone"
  },
  {
    eyebrow: "Android app",
    title: "Sideload the wrapper for native phone workflows",
    body: "The public APK is a generic setup wrapper. Enter your private server URL, upload files with Android's picker, and let the native watcher notify when tmux is waiting.",
    bullets: ["generic public APK", "no embedded public secrets", "native completion alerts"],
    media: "../mobile-chat.png",
    layout: "phone"
  },
  {
    eyebrow: "Desktop too",
    title: "Same server, wider control surface on PC",
    body: "The desktop layout uses horizontal space for the active tmux session while keeping sessions, launchers, the compact view menu, and notifications nearby.",
    bullets: ["phone-first", "desktop-aware", "GUI, TTY, raw, and Focus"],
    media: "../desktop-overview.png",
    layout: "desktop"
  }
];

await mkdir(assetsDir, { recursive: true });
await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });

const server = spawn("node", ["dist/server/server/index.js"], {
  cwd: root,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(appPort),
    CODEX_APP_SERVER_AUTOSTART: "0",
    CLI_WEB_DEFAULT_CWD: "/workspace/project"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

let browser;
let page;

try {
  console.log(`Waiting for app health at ${appUrl}`);
  await waitForHttp(`${appUrl}/healthz`);

  console.log("Starting Playwright Chromium");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--no-sandbox"]
  });
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    isMobile: true,
    viewport: { width: 390, height: 844 }
  });
  page = await context.newPage();
  await page.goto(demoUrl, { waitUntil: "domcontentloaded" });
  await delay(1200);
  await capture(page, path.join(assetsDir, "mobile-chat.png"));

  await chooseView(page, "Focus");
  await delay(300);
  await evaluate(page, "document.querySelector('.tmux-focus')?.scrollTo({ top: 0 })");
  await delay(100);
  await capture(page, path.join(assetsDir, "mobile-focus.png"));
  await chooseView(page, "GUI");
  await delay(250);

  await evaluate(page, `
    (() => {
      const chat = document.querySelector('.tmux-chat');
      if (!chat) {
        return;
      }
      chat.scrollTop = 0;
      chat.dispatchEvent(new Event('scroll', { bubbles: true }));
    })()
  `);
  await delay(300);
  await capture(page, path.join(assetsDir, "mobile-scroll.png"));
  await evaluate(page, "document.querySelector('.tmux-jump-bottom')?.click()");
  await delay(350);

  await chooseView(page, "TTY");
  await delay(250);
  await capture(page, path.join(assetsDir, "mobile-tty.png"));
  await chooseTheme(page, "Light");
  await delay(250);
  await capture(page, path.join(assetsDir, "mobile-light.png"));
  await chooseTheme(page, "Dark");
  await delay(250);

  await chooseView(page, "GUI");
  await delay(250);
  await evaluate(page, "document.querySelector('.tmux-session-menu-button')?.click()");
  await delay(250);
  await capture(page, path.join(assetsDir, "mobile-launchers.png"));

  await evaluate(page, `
    (() => {
      const select = document.querySelector('.tmux-tool-actions select');
      if (select) {
        select.value = 'claude';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `);
  await delay(250);
  await capture(page, path.join(assetsDir, "mobile-claude.png"));

  await evaluate(page, "document.querySelector('.tmux-session-menu-button')?.click()");
  await delay(250);
  await chooseView(page, "Raw");
  await delay(350);
  await capture(page, path.join(assetsDir, "mobile-raw-terminal.png"));

  await chooseView(page, "TTY");
  await delay(250);
  await setViewport(page, 1440, 900);
  await delay(500);
  await capture(page, path.join(assetsDir, "desktop-overview.png"));

  await renderModesOverview(page);
  await renderShowcaseAssets(page);

  await rm(framesDir, { recursive: true, force: true });
  console.log(`Marketing assets written to ${path.relative(root, assetsDir)}`);
} finally {
  await browser?.close().catch(() => {});
  if (server.exitCode === null) {
    server.kill("SIGTERM");
  }
}

async function capture(page, file) {
  if (!file.includes(`${path.sep}frames${path.sep}`)) {
    console.log(`Capturing ${path.relative(root, file)}`);
  }
  await page.screenshot({ path: file });
}

async function renderModesOverview(page) {
  const modesHtmlFile = path.join(framesDir, "modes-overview.html");
  await writeFile(modesHtmlFile, buildModesOverviewHtml());
  await setViewport(page, 1280, 720);
  await page.goto(pathToFileURL(modesHtmlFile).href, { waitUntil: "domcontentloaded" });
  await delay(500);
  await capture(page, path.join(assetsDir, "modes-overview.png"));
}

async function renderShowcaseAssets(page) {
  const showcaseFramesDir = path.join(framesDir, "showcase");
  await rm(showcaseFramesDir, { recursive: true, force: true });
  await mkdir(showcaseFramesDir, { recursive: true });

  const showcaseHtmlFile = path.join(framesDir, "showcase.html");
  await writeFile(showcaseHtmlFile, buildShowcaseHtml());
  await setViewport(page, 1280, 720);
  await page.goto(pathToFileURL(showcaseHtmlFile).href, { waitUntil: "domcontentloaded" });
  await delay(500);

  const framesPerScene = 32;
  let frameIndex = 0;
  for (let sceneIndex = 0; sceneIndex < showcaseScenes.length; sceneIndex += 1) {
    for (let sceneFrame = 0; sceneFrame < framesPerScene; sceneFrame += 1) {
      const progress = sceneFrame / (framesPerScene - 1);
      await evaluate(page, `window.renderScene(${sceneIndex}, ${progress})`);
      await delay(20);
      await capture(page, path.join(showcaseFramesDir, `frame-${String(frameIndex).padStart(3, "0")}.png`));
      frameIndex += 1;
    }
  }

  await evaluate(page, "window.renderScene(0, 0.45)");
  await delay(60);
  await capture(page, path.join(assetsDir, "agent-tmux-web-showcase-poster.png"));

  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    "8",
    "-i",
    path.join(showcaseFramesDir, "frame-%03d.png"),
    "-vf",
    "format=yuv420p",
    "-movflags",
    "+faststart",
    path.join(assetsDir, "agent-tmux-web-showcase.mp4")
  ]);

  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    "8",
    "-i",
    path.join(showcaseFramesDir, "frame-%03d.png"),
    "-filter_complex",
    "fps=8,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4",
    path.join(assetsDir, "agent-tmux-web-showcase.gif")
  ]);
}

function buildModesOverviewHtml() {
  const modes = [
    {
      label: "Focus",
      title: "Attention overview",
      image: "../mobile-focus.png"
    },
    {
      label: "GUI",
      title: "Readable agent transcript",
      image: "../mobile-chat.png"
    },
    {
      label: "TTY",
      title: "Plain pane capture",
      image: "../mobile-tty.png"
    },
    {
      label: "tmux",
      title: "Raw attached terminal",
      image: "../mobile-raw-terminal.png"
    }
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0e1113;
      color: #f2f5f4;
    }

    * {
      box-sizing: border-box;
    }

    body {
      width: 1280px;
      height: 720px;
      margin: 0;
      overflow: hidden;
      background:
        linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255,255,255,0.035) 1px, transparent 1px),
        #0e1113;
      background-size: 44px 44px, 44px 44px, auto;
    }

    main {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 24px;
      width: 1280px;
      height: 720px;
      padding: 42px 58px;
    }

    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 28px;
    }

    h1 {
      max-width: 760px;
      margin: 0;
      color: #f4f7f6;
      font-size: 48px;
      line-height: 1.04;
      letter-spacing: 0;
    }

    p {
      max-width: 330px;
      margin: 0 0 5px;
      color: #b8c3c1;
      font-size: 18px;
      line-height: 1.35;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
      min-height: 0;
    }

    article {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
      min-width: 0;
      min-height: 0;
    }

    .label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 38px;
      padding: 0 2px;
      color: #dce5e2;
      font-size: 15px;
      font-weight: 800;
    }

    .label span:first-child {
      color: #67d2b5;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      text-transform: uppercase;
    }

    .phone {
      min-height: 0;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 28px;
      background: #20262a;
      filter: drop-shadow(0 26px 42px rgba(0,0,0,0.38));
    }

    img {
      display: block;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 21px;
      object-fit: cover;
      object-position: top;
      background: #0f1214;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Pick the view that fits the moment.</h1>
      <p>GUI for readable agent output, TTY for pane capture, raw tmux when you need exact terminal control.</p>
    </header>
    <section class="grid">
      ${modes.map((mode) => `
        <article>
          <div class="label"><span>${mode.label}</span><span>${mode.title}</span></div>
          <div class="phone"><img alt="${mode.title}" src="${mode.image}"></div>
        </article>
      `).join("")}
    </section>
  </main>
</body>
</html>`;
}

function buildShowcaseHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0e1113;
      color: #f2f5f4;
    }

    * {
      box-sizing: border-box;
    }

    body {
      width: 1280px;
      height: 720px;
      margin: 0;
      overflow: hidden;
      background:
        linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255,255,255,0.035) 1px, transparent 1px),
        #0e1113;
      background-size: 44px 44px, 44px 44px, auto;
    }

    .stage {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: 52px;
      width: 1280px;
      height: 720px;
      padding: 52px 64px 44px;
    }

    .stage::before {
      position: absolute;
      inset: 0;
      content: "";
      background: linear-gradient(135deg, rgba(84,179,153,0.16), transparent 38%, rgba(93,146,202,0.14));
      pointer-events: none;
    }

    .copy,
    .visual-wrap,
    .progress {
      position: relative;
      z-index: 1;
    }

    .copy {
      align-self: center;
      max-width: 550px;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 36px;
      color: #dce5e2;
      font-size: 18px;
      font-weight: 800;
    }

    .brand-mark {
      width: 38px;
      height: 38px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: #101315;
      object-fit: cover;
    }

    .eyebrow {
      margin: 0 0 14px;
      color: #67d2b5;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      color: #f4f7f6;
      font-size: 52px;
      line-height: 1.02;
      letter-spacing: 0;
    }

    .body {
      max-width: 520px;
      margin: 22px 0 0;
      color: #b8c3c1;
      font-size: 21px;
      line-height: 1.38;
    }

    .bullets {
      display: grid;
      gap: 10px;
      margin: 30px 0 0;
      padding: 0;
      list-style: none;
    }

    .bullets li {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #e4ebe8;
      font-size: 17px;
      font-weight: 700;
    }

    .bullets li::before {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #67d2b5;
      content: "";
      box-shadow: 0 0 0 5px rgba(103,210,181,0.12);
    }

    .visual-wrap {
      display: grid;
      align-items: center;
      justify-items: center;
      min-width: 0;
    }

    .media-shell {
      transform: translateY(var(--lift, 0px)) scale(var(--scale, 1));
      transition: none;
      filter: drop-shadow(0 28px 52px rgba(0,0,0,0.45));
    }

    .media-shell.phone {
      width: 354px;
      height: 674px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 44px;
      background: #20262a;
    }

    .media-shell.desktop {
      width: 680px;
      height: 430px;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 14px;
      background: #20262a;
    }

    .media-shell img {
      display: block;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(255,255,255,0.08);
      background: #0f1214;
      object-fit: cover;
    }

    .media-shell.phone img {
      border-radius: 34px;
    }

    .media-shell.desktop img {
      border-radius: 8px;
    }

    .progress {
      position: absolute;
      left: 64px;
      right: 64px;
      bottom: 28px;
      height: 5px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
    }

    .progress span {
      display: block;
      width: var(--progress, 0%);
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #67d2b5, #8ca9ff);
    }
  </style>
</head>
<body>
  <main class="stage">
    <section class="copy">
      <div class="brand"><img class="brand-mark" alt="" src="../../../public/agent-tmux-logo.png"><span>Agent Tmux Web</span></div>
      <p class="eyebrow"></p>
      <h1></h1>
      <p class="body"></p>
      <ul class="bullets"></ul>
    </section>
    <section class="visual-wrap">
      <div class="media-shell phone">
        <img alt="">
      </div>
    </section>
    <div class="progress"><span></span></div>
  </main>
  <script>
    const scenes = ${JSON.stringify(showcaseScenes)};
    const eyebrow = document.querySelector(".eyebrow");
    const title = document.querySelector("h1");
    const body = document.querySelector(".body");
    const bullets = document.querySelector(".bullets");
    const shell = document.querySelector(".media-shell");
    const image = document.querySelector(".media-shell img");
    const progressBar = document.querySelector(".progress span");

    function ease(progress) {
      return 1 - Math.pow(1 - progress, 3);
    }

    window.renderScene = (index, progress) => {
      const scene = scenes[index];
      const eased = ease(progress);
      eyebrow.textContent = scene.eyebrow;
      title.textContent = scene.title;
      body.textContent = scene.body;
      shell.className = "media-shell " + scene.layout;
      shell.style.setProperty("--lift", String(-8 + eased * 16) + "px");
      shell.style.setProperty("--scale", String(0.985 + eased * 0.018));
      image.src = scene.media;
      image.alt = scene.title;
      bullets.replaceChildren(...scene.bullets.map((bullet) => {
        const item = document.createElement("li");
        item.textContent = bullet;
        return item;
      }));
      progressBar.style.setProperty("--progress", String(((index + progress) / scenes.length) * 100) + "%");
    };

    window.renderScene(0, 0);
  </script>
</body>
</html>`;
}

async function setViewport(page, width, height) {
  await page.setViewportSize({ width, height });
}

async function evaluate(page, expression) {
  await page.evaluate(expression);
}

async function chooseView(page, label) {
  await page.locator(".tmux-view-menu summary").click();
  await page.getByRole("menuitemradio", { name: label }).click();
  await delay(250);
}

async function chooseTheme(page, label) {
  await page.locator(".tmux-view-menu summary").click();
  await page.getByRole("menuitemradio", { name: label }).click();
  await delay(250);
}

async function waitForHttp(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Service is still starting.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
    child.on("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
