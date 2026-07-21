import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const SHOWCASE_WIDTH = 1920;
const SHOWCASE_HEIGHT = 1080;
const SHOWCASE_FPS = 30;
const FRAMES_PER_SCENE = 64;
const TRANSITION_FRAMES = 14;
const HERO_WIDTH = 1600;
const HERO_HEIGHT = 900;
const DESKTOP_WIDTH = 1440;
const DESKTOP_HEIGHT = 900;
const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
const IMAGE_SEED = 241024;
const BACKDROP_PROMPT = [
  "restrained abstract dark technical infrastructure background",
  "charcoal graphite and muted teal",
  "subtle layered network topology and soft volumetric depth",
  "low contrast premium editorial lighting",
  "large quiet negative space",
  "no text no letters no logo no terminal no code no screen no device no person"
].join(", ");
const IMAGE_ENDPOINT = process.env.MARKETING_IMAGE_ENDPOINT
  ?? `https://image.pollinations.ai/prompt/${encodeURIComponent(BACKDROP_PROMPT)}?width=${SHOWCASE_WIDTH}&height=${SHOWCASE_HEIGHT}&seed=${IMAGE_SEED}&model=flux&nologo=true`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "docs", "assets");
const framesDir = path.join(assetsDir, "frames");
const appPort = Number(process.env.MARKETING_APP_PORT ?? 6180);
const appUrl = `http://127.0.0.1:${appPort}`;
const demoUrl = `${appUrl}/?demo=1`;
const showcaseScenes = [
  {
    eyebrow: "Agent Tmux Web",
    title: "Keep terminal agents running.",
    body: "Run terminal agents inside tmux on your server, then reconnect from desktop or Android.",
    media: "../desktop-raw.png",
    layout: "desktop"
  },
  {
    eyebrow: "Desktop Raw",
    title: "Exact tmux control on a wider canvas.",
    body: "Work directly in the terminal without giving up session persistence.",
    media: "../desktop-raw.png",
    layout: "desktop"
  },
  {
    eyebrow: "Mobile Raw",
    title: "Direct terminal control from your phone.",
    body: "Use the authentic terminal surface and soft keys when exact CLI behavior matters.",
    media: "../mobile-raw.png",
    layout: "phone"
  },
  {
    eyebrow: "Mobile GUI",
    title: "Scan agent output as a readable thread.",
    body: "Switch to the normalized view for prompts, command output, and summaries.",
    media: "../mobile-gui.png",
    layout: "phone"
  },
  {
    eyebrow: "Mobile Focus",
    title: "See which session needs attention.",
    body: "Triage running, waiting, and error states without leaving the current workspace.",
    media: "../mobile-focus.png",
    layout: "phone"
  },
  {
    eyebrow: "Public Android Release",
    title: "Bring your own private connection.",
    body: "The public Android wrapper ships without an embedded server URL or token.",
    media: "",
    layout: "close"
  }
];

await rm(assetsDir, { recursive: true, force: true });
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
let completed = false;

try {
  console.log(`Waiting for app health at ${appUrl}`);
  await waitForHttp(`${appUrl}/healthz`);

  console.log("Starting Playwright Chromium");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--no-sandbox"]
  });

  const captureContext = await browser.newContext({
    deviceScaleFactor: 1,
    isMobile: true,
    viewport: { width: MOBILE_WIDTH, height: MOBILE_HEIGHT }
  });
  const page = await captureContext.newPage();

  await page.goto(demoUrl, { waitUntil: "domcontentloaded" });
  await delay(1200);
  await chooseView(page, "Raw");
  await capture(page, path.join(assetsDir, "mobile-raw.png"));
  await chooseView(page, "GUI");
  await capture(page, path.join(assetsDir, "mobile-gui.png"));
  await chooseView(page, "Focus");
  await capture(page, path.join(assetsDir, "mobile-focus.png"));
  await chooseView(page, "Raw");
  await setViewport(page, DESKTOP_WIDTH, DESKTOP_HEIGHT);
  await delay(500);
  await capture(page, path.join(assetsDir, "desktop-raw.png"));
  await captureContext.close();

  await generateBackdrop();

  const compositionContext = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: SHOWCASE_WIDTH, height: SHOWCASE_HEIGHT }
  });
  const compositionPage = await compositionContext.newPage();
  await renderHero(compositionPage);
  await renderModesOverview(compositionPage);
  await renderShowcaseAssets(compositionPage);
  await compositionContext.close();

  completed = true;
  console.log(`Marketing assets written to ${path.relative(root, assetsDir)}`);
} finally {
  await browser?.close().catch(() => {});
  if (server.exitCode === null) {
    server.kill("SIGTERM");
  }
  if (completed) {
    await rm(framesDir, { recursive: true, force: true });
  } else {
    await rm(assetsDir, { recursive: true, force: true });
  }
}

async function generateBackdrop() {
  const source = path.join(framesDir, "generated-backdrop-source");
  const output = path.join(framesDir, "generated-backdrop.png");
  const response = await fetch(IMAGE_ENDPOINT, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) {
    throw new Error(`Image generation failed with HTTP ${response.status}`);
  }
  await writeFile(source, Buffer.from(await response.arrayBuffer()));
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", source, "-vf", `scale=${SHOWCASE_WIDTH}:${SHOWCASE_HEIGHT}:force_original_aspect_ratio=increase,crop=${SHOWCASE_WIDTH}:${SHOWCASE_HEIGHT}`, output]);
  return output;
}

async function capture(page, file) {
  if (!file.includes(`${path.sep}frames${path.sep}`)) {
    console.log(`Capturing ${path.relative(root, file)}`);
  }
  await page.screenshot({ path: file, animations: "disabled" });
}

async function renderHero(page) {
  const htmlFile = path.join(framesDir, "hero.html");
  await writeFile(htmlFile, buildHeroHtml());
  await setViewport(page, HERO_WIDTH, HERO_HEIGHT);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await capture(page, path.join(assetsDir, "agent-tmux-web-hero.png"));
}

async function renderModesOverview(page) {
  const htmlFile = path.join(framesDir, "modes-overview.html");
  await writeFile(htmlFile, buildModesOverviewHtml());
  await setViewport(page, SHOWCASE_WIDTH, SHOWCASE_HEIGHT);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await capture(page, path.join(assetsDir, "modes-overview.png"));
}

async function renderShowcaseAssets(page) {
  const showcaseFramesDir = path.join(framesDir, "showcase");
  await mkdir(showcaseFramesDir, { recursive: true });
  const htmlFile = path.join(framesDir, "showcase.html");
  await writeFile(htmlFile, buildShowcaseHtml());
  await setViewport(page, SHOWCASE_WIDTH, SHOWCASE_HEIGHT);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await page.waitForFunction(() => window.assetsReady === true);

  await evaluate(page, `window.renderFrame(${Math.floor(FRAMES_PER_SCENE / 2)})`);
  await capture(page, path.join(assetsDir, "agent-tmux-web-showcase-poster.png"));

  const totalFrames = FRAMES_PER_SCENE * showcaseScenes.length;
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    await evaluate(page, `window.renderFrame(${frameIndex})`);
    await capture(page, path.join(showcaseFramesDir, `frame-${String(frameIndex).padStart(4, "0")}.png`));
  }

  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-framerate", String(SHOWCASE_FPS),
    "-i", path.join(showcaseFramesDir, "frame-%04d.png"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    path.join(assetsDir, "agent-tmux-web-showcase.mp4")
  ]);
}

function buildHeroHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    ${baseCompositionCss(HERO_WIDTH, HERO_HEIGHT)}
    .hero {
      position: relative;
      width: ${HERO_WIDTH}px;
      height: ${HERO_HEIGHT}px;
      padding: 68px 74px;
      overflow: hidden;
    }
    .brand {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 15px;
      color: #f3f6f5;
      font-size: 23px;
      font-weight: 730;
      letter-spacing: -0.02em;
    }
    .brand img { width: 45px; height: 45px; border-radius: 9px; }
    .copy {
      position: relative;
      z-index: 2;
      width: 542px;
      margin-top: 125px;
    }
    h1 {
      margin: 0;
      color: #f5f7f6;
      font-size: 70px;
      line-height: 0.99;
      letter-spacing: -0.055em;
    }
    p {
      width: 492px;
      margin: 28px 0 0;
      color: #b7c3c0;
      font-size: 23px;
      line-height: 1.45;
    }
    .desktop {
      position: absolute;
      z-index: 2;
      right: -94px;
      bottom: 53px;
      width: 1000px;
      padding: 10px;
      border: 1px solid rgba(230, 243, 239, 0.22);
      border-radius: 15px;
      background: #171c1e;
      box-shadow: 0 35px 84px rgba(0, 0, 0, 0.52);
      transform: rotate(-1.25deg);
    }
    .desktop img { display: block; width: 100%; border-radius: 10px; }
    .rule {
      position: absolute;
      z-index: 2;
      left: 74px;
      bottom: 63px;
      width: 325px;
      height: 1px;
      background: linear-gradient(90deg, #61bda5, rgba(97, 189, 165, 0));
    }
  </style>
</head>
<body>
  <main class="hero">
    ${backdropMarkup()}
    <div class="brand"><img alt="" src="../../../public/agent-tmux-logo.png"><span>Agent Tmux Web</span></div>
    <section class="copy">
      <h1>Keep terminal agents running.</h1>
      <p>Run terminal agents inside tmux on your server, then reconnect from desktop or Android.</p>
    </section>
    <div class="desktop"><img alt="Agent Tmux Web Raw view on desktop" src="../desktop-raw.png"></div>
    <div class="rule"></div>
  </main>
</body>
</html>`;
}

function buildModesOverviewHtml() {
  const modes = [
    { label: "Raw", description: "Direct terminal", image: "../mobile-raw.png" },
    { label: "GUI", description: "Readable transcript", image: "../mobile-gui.png" },
    { label: "Focus", description: "Attention triage", image: "../mobile-focus.png" }
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    ${baseCompositionCss()}
    main {
      position: relative;
      width: 1920px;
      height: 1080px;
      padding: 66px 86px 58px;
      overflow: hidden;
    }
    header {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 80px;
    }
    h1 {
      max-width: 930px;
      margin: 0;
      color: #f5f7f6;
      font-size: 62px;
      line-height: 1.02;
      letter-spacing: -0.045em;
    }
    header p {
      max-width: 530px;
      margin: 0 0 7px;
      color: #afbdba;
      font-size: 22px;
      line-height: 1.42;
    }
    .modes {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 38px;
      margin-top: 40px;
    }
    article {
      display: grid;
      grid-template-columns: 180px 1fr;
      align-items: start;
      min-width: 0;
      height: 800px;
      padding: 24px 24px 0;
      overflow: hidden;
      border: 1px solid rgba(230, 243, 239, 0.14);
      border-radius: 8px;
      background: rgba(13, 17, 18, 0.72);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.36);
    }
    .label { padding-top: 8px; }
    .label strong {
      display: block;
      color: #6bc4ad;
      font: 750 17px/1.2 "SFMono-Regular", Consolas, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .label span {
      display: block;
      margin-top: 13px;
      color: #c1cbc8;
      font-size: 17px;
      line-height: 1.35;
    }
    .phone {
      width: 340px;
      padding: 10px;
      border: 1px solid rgba(230, 243, 239, 0.2);
      border-radius: 32px 32px 0 0;
      background: #171c1e;
      box-shadow: 0 26px 64px rgba(0, 0, 0, 0.44);
    }
    .phone img {
      display: block;
      width: 100%;
      border-radius: 23px 23px 0 0;
    }
  </style>
</head>
<body>
  <main>
    ${backdropMarkup()}
    <header>
      <h1>Three views. One persistent tmux session.</h1>
      <p>Move between exact terminal control, a readable agent transcript, and status-focused triage.</p>
    </header>
    <section class="modes">
      ${modes.map((mode) => `<article>
        <div class="label"><strong>${mode.label}</strong><span>${mode.description}</span></div>
        <div class="phone"><img alt="Agent Tmux Web ${mode.label} view" src="${mode.image}"></div>
      </article>`).join("")}
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
    ${baseCompositionCss()}
    .stage {
      position: relative;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
    }
    .brand {
      position: absolute;
      z-index: 4;
      top: 62px;
      left: 86px;
      display: flex;
      align-items: center;
      gap: 14px;
      color: #edf2f0;
      font-size: 22px;
      font-weight: 720;
    }
    .brand img { width: 42px; height: 42px; border-radius: 9px; }
    .scene-layer {
      position: absolute;
      z-index: 2;
      inset: 78px 86px 72px;
      display: grid;
      grid-template-columns: 770px minmax(0, 1fr);
      gap: 74px;
      transform: translateY(var(--scene-y, 0%)) scale(var(--scene-scale, 1));
      transform-origin: center;
    }
    .copy,
    .visual {
      position: relative;
      z-index: 1;
    }
    .copy {
      align-self: center;
      opacity: var(--copy-opacity, 0);
    }
    .eyebrow {
      margin: 0 0 19px;
      color: #67c2aa;
      font: 760 16px/1.2 "SFMono-Regular", Consolas, monospace;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #f5f7f6;
      font-size: 72px;
      line-height: 1.01;
      letter-spacing: -0.052em;
    }
    .body {
      max-width: 660px;
      margin: 30px 0 0;
      color: #b5c1be;
      font-size: 26px;
      line-height: 1.44;
    }
    .visual {
      display: grid;
      place-items: center;
      min-width: 0;
      opacity: var(--scene-opacity, 0);
    }
    .media-shell {
      padding: 11px;
      border: 1px solid rgba(230, 243, 239, 0.2);
      background: #171c1e;
      box-shadow: 0 40px 96px rgba(0, 0, 0, 0.5);
    }
    .media-shell.desktop { width: 930px; border-radius: 17px; }
    .media-shell.phone { width: 376px; border-radius: 38px; }
    .media-shell img { display: block; width: 100%; }
    .media-shell.desktop img { border-radius: 9px; }
    .media-shell.phone img { border-radius: 28px; }
    .media-shell.close {
      width: 620px;
      min-height: 560px;
      display: grid;
      place-items: center;
      padding: 70px;
      border-radius: 8px;
      background: rgba(14, 18, 19, 0.76);
    }
    .media-shell.close > img { display: none; }
    .release-card { display: none; text-align: center; }
    .media-shell.close .release-card { display: block; }
    .release-card img {
      display: block !important;
      width: 138px;
      height: 138px;
      margin: 0 auto 38px;
      border-radius: 27px;
    }
    .release-card strong {
      display: block;
      color: #f2f5f4;
      font-size: 31px;
      letter-spacing: -0.025em;
    }
    .release-card span {
      display: block;
      margin-top: 16px;
      color: #8fa09c;
      font: 650 17px/1.5 "SFMono-Regular", Consolas, monospace;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .progress {
      position: absolute;
      z-index: 4;
      right: 86px;
      bottom: 42px;
      left: 86px;
      height: 2px;
      background: rgba(230, 243, 239, 0.12);
    }
    .progress span {
      display: block;
      width: var(--progress, 0%);
      height: 100%;
      background: #67c2aa;
    }
  </style>
</head>
<body>
  <main class="stage">
    ${backdropMarkup()}
    <div class="brand"><img alt="" src="../../../public/agent-tmux-logo.png"><span>Agent Tmux Web</span></div>
    ${showcaseLayerMarkup()}
    ${showcaseLayerMarkup()}
    <div class="progress"><span></span></div>
  </main>
  <script>
    const scenes = ${JSON.stringify(showcaseScenes)};
    const framesPerScene = ${FRAMES_PER_SCENE};
    const transitionFrames = ${TRANSITION_FRAMES};
    const layers = [...document.querySelectorAll(".scene-layer")];
    const progressBar = document.querySelector(".progress span");
    const ease = (value) => value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;

    window.assetsReady = false;
    Promise.all(scenes.filter((scene) => scene.media).map((scene) => new Promise((resolve, reject) => {
      const preload = new Image();
      preload.onload = resolve;
      preload.onerror = reject;
      preload.src = scene.media;
    }))).then(() => { window.assetsReady = true; });

    function setLayerScene(layer, index) {
      if (layer.dataset.sceneIndex === String(index)) {
        return;
      }
      const scene = scenes[index];
      const eyebrow = layer.querySelector(".eyebrow");
      const title = layer.querySelector("h1");
      const body = layer.querySelector(".body");
      const shell = layer.querySelector(".media-shell");
      const image = layer.querySelector(".product-image");
      eyebrow.textContent = scene.eyebrow;
      title.textContent = scene.title;
      body.textContent = scene.body;
      shell.className = "media-shell " + scene.layout;
      image.src = scene.media;
      image.alt = scene.layout === "close" ? "" : scene.title;
      layer.dataset.sceneIndex = String(index);
    }

    function setLayerMotion(layer, progress) {
      const eased = ease(progress);
      layer.style.setProperty("--scene-y", String(1 - 2 * eased) + "%");
      layer.style.setProperty("--scene-scale", String(0.99 + 0.02 * eased));
    }

    window.renderFrame = (frameIndex) => {
      const sceneIndex = Math.min(Math.floor(frameIndex / framesPerScene), scenes.length - 1);
      const nextSceneIndex = Math.min(sceneIndex + 1, scenes.length - 1);
      const sceneFrame = frameIndex % framesPerScene;
      const sceneProgress = sceneFrame / (framesPerScene - 1);
      const transitionStart = framesPerScene - transitionFrames;
      const hasNextScene = sceneIndex < scenes.length - 1;
      const overlapProgress = hasNextScene && sceneFrame >= transitionStart
        ? (sceneFrame - transitionStart) / (transitionFrames - 1)
        : 0;
      const incomingOpacity = ease(overlapProgress);
      const outgoingOpacity = 1 - incomingOpacity;
      const outgoingCopyOpacity = 1 - ease(Math.min(overlapProgress * 2, 1));
      const incomingCopyOpacity = ease(Math.max(overlapProgress * 2 - 1, 0));

      setLayerScene(layers[0], sceneIndex);
      setLayerScene(layers[1], nextSceneIndex);
      layers[0].style.setProperty("--scene-opacity", String(outgoingOpacity));
      layers[1].style.setProperty("--scene-opacity", String(incomingOpacity));
      layers[0].style.setProperty("--copy-opacity", String(outgoingCopyOpacity));
      layers[1].style.setProperty("--copy-opacity", String(incomingCopyOpacity));
      setLayerMotion(layers[0], sceneProgress);
      setLayerMotion(layers[1], 0);
      progressBar.style.setProperty("--progress", String(((sceneIndex + ease(sceneProgress)) / scenes.length) * 100) + "%");
    };

    window.renderFrame(0);
  </script>
</body>
</html>`;
}

function showcaseLayerMarkup() {
  return `<section class="scene-layer">
    <div class="copy">
      <p class="eyebrow"></p>
      <h1></h1>
      <p class="body"></p>
    </div>
    <div class="visual">
      <div class="media-shell desktop">
        <img class="product-image" alt="">
        <div class="release-card">
          <img alt="" src="../../../public/agent-tmux-logo.png">
          <strong>Agent Tmux for Android</strong>
          <span>No embedded URL<br>No embedded token</span>
        </div>
      </div>
    </div>
  </section>`;
}

function baseCompositionCss(width = SHOWCASE_WIDTH, height = SHOWCASE_HEIGHT) {
  return `
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0b0e0f;
      color: #f2f5f4;
    }
    * { box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; margin: 0; overflow: hidden; }
    body { background: #0b0e0f; }
    .backdrop {
      position: absolute;
      z-index: 0;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.42;
      filter: saturate(0.68) contrast(1.04) brightness(0.68);
    }
    .backdrop-shade {
      position: absolute;
      z-index: 1;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(8, 11, 12, 0.96) 0%, rgba(8, 11, 12, 0.72) 44%, rgba(8, 11, 12, 0.22) 100%),
        linear-gradient(0deg, rgba(8, 11, 12, 0.7), transparent 54%);
    }
  `;
}

function backdropMarkup() {
  return `<img class="backdrop" alt="" src="generated-backdrop.png"><div class="backdrop-shade"></div>`;
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
  await delay(350);
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
