import { spawn } from "node:child_process";
import { access, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

import {
  assertShowcaseMetadata,
  InvalidMarketingAssetError,
  recoverStaleAssetDirectories
} from "./marketing-assets.mjs";

const SHOWCASE_WIDTH = 1920;
const SHOWCASE_HEIGHT = 1080;
const SHOWCASE_FPS = 30;
const FRAMES_PER_SCENE = 80;
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
const APPROVED_ASSETS = [
  "agent-tmux-web-hero.png",
  "agent-tmux-web-showcase-poster.png",
  "agent-tmux-web-showcase.mp4",
  "desktop-tty.png",
  "mobile-raw.png",
  "mobile-tty.png",
  "modes-overview.png"
].sort();
const EXPECTED_PNG_DIMENSIONS = new Map([
  ["agent-tmux-web-hero.png", [HERO_WIDTH, HERO_HEIGHT]],
  ["agent-tmux-web-showcase-poster.png", [SHOWCASE_WIDTH, SHOWCASE_HEIGHT]],
  ["desktop-tty.png", [DESKTOP_WIDTH, DESKTOP_HEIGHT]],
  ["mobile-raw.png", [MOBILE_WIDTH, MOBILE_HEIGHT]],
  ["mobile-tty.png", [MOBILE_WIDTH, MOBILE_HEIGHT]],
  ["modes-overview.png", [SHOWCASE_WIDTH, SHOWCASE_HEIGHT]]
]);
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");
const publishedAssetsDir = path.join(root, "docs", "assets");
const stagingAssetsDir = path.join(docsDir, `.assets-staging-${process.pid}`);
const backupAssetsDir = path.join(docsDir, `.assets-backup-${process.pid}`);
const assetsDir = stagingAssetsDir;
const framesDir = path.join(assetsDir, "frames");
const appPort = Number(process.env.MARKETING_APP_PORT ?? 6180);
const appUrl = `http://127.0.0.1:${appPort}`;
const demoUrl = `${appUrl}/?demo=1`;
const showcaseScenes = [
  {
    eyebrow: "Agent Tmux Web",
    title: "Keep terminal agents running.",
    body: "Run terminal agents inside tmux on your server, then reconnect from desktop or Android.",
    media: "../desktop-tty.png",
    layout: "desktop"
  },
  {
    eyebrow: "Desktop TTY",
    title: "Readable output without leaving tmux.",
    body: "Select text, open links, and keep OpenCode conversation and details visible together.",
    media: "../desktop-tty.png",
    layout: "desktop"
  },
  {
    eyebrow: "Mobile TTY",
    title: "Check the stream, then inspect details.",
    body: "Use compact Stream and Details tabs while the agent keeps running on your server.",
    media: "../mobile-tty.png",
    layout: "phone"
  },
  {
    eyebrow: "Mobile Raw",
    title: "Direct terminal control from your phone.",
    body: "Use the authentic terminal surface and soft keys when exact CLI behavior matters.",
    media: "../mobile-raw.png",
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

let browser;
let server;
const generationAbortController = new AbortController();
let stoppingServer = false;
let interruptedSignal;
let failure;
const handleSigint = () => handleTerminationSignal("SIGINT");
const handleSigterm = () => handleTerminationSignal("SIGTERM");
process.once("SIGINT", handleSigint);
process.once("SIGTERM", handleSigterm);

try {
  await prepareStagingDirectories();
  generationAbortController.signal.throwIfAborted();
  await assertLoopbackPortAvailable(appPort);
  generationAbortController.signal.throwIfAborted();

  server = spawn("node", ["dist/server/server/index.js"], {
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

  const serverFailure = monitorServer(server, generationAbortController);
  const generationPromise = generateAndPublishAssets(generationAbortController.signal);
  try {
    await Promise.race([generationPromise, serverFailure]);
  } catch (error) {
    generationAbortController.abort(error);
    await browser?.close().catch(() => {});
    await generationPromise.catch(() => {});
    throw error;
  }

  console.log(`Marketing assets written to ${path.relative(root, publishedAssetsDir)}`);
} catch (error) {
  failure = error;
} finally {
  stoppingServer = true;
  generationAbortController.abort();
  await browser?.close().catch(() => {});
  await stopServer(server);
  await rm(stagingAssetsDir, { recursive: true, force: true });
  await rm(backupAssetsDir, { recursive: true, force: true });
  process.removeListener("SIGINT", handleSigint);
  process.removeListener("SIGTERM", handleSigterm);
}

if (interruptedSignal) {
  process.exitCode = SIGNAL_EXIT_CODES[interruptedSignal];
} else if (failure) {
  throw failure;
}

async function generateAndPublishAssets(signal) {
  console.log(`Waiting for app health at ${appUrl}`);
  await waitForHttp(`${appUrl}/healthz`, signal);
  signal.throwIfAborted();

  console.log("Starting Playwright Chromium");
  browser = await chromium.launch({
    headless: true,
    handleSIGINT: false,
    handleSIGTERM: false,
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--no-sandbox"]
  });
  signal.throwIfAborted();

  const captureContext = await browser.newContext({
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    userAgent: "Mozilla/5.0 (Linux; Android 15; Agent Tmux Demo) AppleWebKit/537.36 Chrome/138.0 Mobile Safari/537.36",
    viewport: { width: MOBILE_WIDTH, height: MOBILE_HEIGHT }
  });
  try {
    const page = await captureContext.newPage();
    await page.goto(demoUrl, { waitUntil: "domcontentloaded" });
    await delay(1200, signal);
    await selectDarkTheme(page, signal);
    await chooseView(page, "TTY", signal);
    await capture(page, path.join(assetsDir, "mobile-tty.png"), signal);
    await chooseView(page, "Raw", signal);
    await capture(page, path.join(assetsDir, "mobile-raw.png"), signal);
    await chooseView(page, "TTY", signal);
    await setViewport(page, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    await delay(500, signal);
    await openSettingsMenu(page, signal);
    await capture(page, path.join(assetsDir, "desktop-tty.png"), signal);
  } finally {
    await captureContext.close().catch(() => {});
  }

  await generateBackdrop(signal);

  const compositionContext = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: SHOWCASE_WIDTH, height: SHOWCASE_HEIGHT }
  });
  try {
    const compositionPage = await compositionContext.newPage();
    await renderHero(compositionPage, signal);
    await renderModesOverview(compositionPage, signal);
    await renderShowcaseAssets(compositionPage, signal);
  } finally {
    await compositionContext.close().catch(() => {});
  }

  signal.throwIfAborted();
  await rm(framesDir, { recursive: true, force: true });
  await validateStagedAssets();
  signal.throwIfAborted();
  await publishAssetsAtomically();
}

async function generateBackdrop(signal) {
  const source = path.join(framesDir, "generated-backdrop-source");
  const output = path.join(framesDir, "generated-backdrop.png");
  const response = await fetch(IMAGE_ENDPOINT, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)])
  });
  if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) {
    throw new Error(`Image generation failed with HTTP ${response.status}`);
  }
  await writeFile(source, Buffer.from(await response.arrayBuffer()));
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", source, "-vf", `scale=${SHOWCASE_WIDTH}:${SHOWCASE_HEIGHT}:force_original_aspect_ratio=increase,crop=${SHOWCASE_WIDTH}:${SHOWCASE_HEIGHT}`, output], signal);
  return output;
}

async function capture(page, file, signal) {
  signal.throwIfAborted();
  if (!file.includes(`${path.sep}frames${path.sep}`)) {
    console.log(`Capturing docs/assets/${path.basename(file)}`);
  }
  await page.screenshot({ path: file, animations: "disabled" });
  signal.throwIfAborted();
}

async function renderHero(page, signal) {
  const htmlFile = path.join(framesDir, "hero.html");
  await writeFile(htmlFile, buildHeroHtml());
  await setViewport(page, HERO_WIDTH, HERO_HEIGHT);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await capture(page, path.join(assetsDir, "agent-tmux-web-hero.png"), signal);
}

async function renderModesOverview(page, signal) {
  const htmlFile = path.join(framesDir, "modes-overview.html");
  await writeFile(htmlFile, buildModesOverviewHtml());
  await setViewport(page, SHOWCASE_WIDTH, SHOWCASE_HEIGHT);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await capture(page, path.join(assetsDir, "modes-overview.png"), signal);
}

async function renderShowcaseAssets(page, signal) {
  const showcaseFramesDir = path.join(framesDir, "showcase");
  await mkdir(showcaseFramesDir, { recursive: true });
  const htmlFile = path.join(framesDir, "showcase.html");
  await writeFile(htmlFile, buildShowcaseHtml());
  await setViewport(page, SHOWCASE_WIDTH, SHOWCASE_HEIGHT);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await page.waitForFunction(() => window.assetsReady === true);
  const assetsError = await page.evaluate(() => window.assetsError);
  if (assetsError) {
    throw new Error(`Showcase asset preload failed: ${assetsError}`);
  }

  await evaluate(page, `window.renderFrame(${Math.floor(FRAMES_PER_SCENE / 2)})`);
  await capture(page, path.join(assetsDir, "agent-tmux-web-showcase-poster.png"), signal);

  const totalFrames = FRAMES_PER_SCENE * showcaseScenes.length;
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    await evaluate(page, `window.renderFrame(${frameIndex})`);
    await capture(page, path.join(showcaseFramesDir, `frame-${String(frameIndex).padStart(4, "0")}.png`), signal);
  }

  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-framerate", String(SHOWCASE_FPS),
    "-i", path.join(showcaseFramesDir, "frame-%04d.png"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    path.join(assetsDir, "agent-tmux-web-showcase.mp4")
  ], signal);
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
    <div class="desktop"><img alt="Agent Tmux Web TTY view on desktop" src="../desktop-tty.png"></div>
    <div class="rule"></div>
  </main>
</body>
</html>`;
}

function buildModesOverviewHtml() {
  const modes = [
    { label: "TTY", description: "Selectable stream", image: "../mobile-tty.png" },
    { label: "Raw", description: "Direct terminal", image: "../mobile-raw.png" }
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
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 24px;
      margin-top: 36px;
    }
    article {
      display: grid;
      grid-template-rows: auto 1fr;
      align-items: start;
      min-width: 0;
      height: 800px;
      padding: 20px 18px 0;
      overflow: hidden;
      border: 1px solid rgba(230, 243, 239, 0.14);
      border-radius: 8px;
      background: rgba(13, 17, 18, 0.72);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.36);
    }
    .label { padding: 4px 4px 18px; }
    .label strong {
      display: block;
      color: #6bc4ad;
      font: 750 17px/1.2 "SFMono-Regular", Consolas, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .label span {
      display: block;
      margin-top: 8px;
      color: #c1cbc8;
      font-size: 17px;
      line-height: 1.35;
    }
    .phone {
      justify-self: center;
      width: 300px;
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
      <h1>Two views. One persistent tmux session.</h1>
      <p>Toggle between selectable TTY output and exact Raw terminal control.</p>
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
    window.assetsError = null;
    Promise.all(scenes.filter((scene) => scene.media).map((scene) => new Promise((resolve, reject) => {
      const preload = new Image();
      preload.onload = resolve;
      preload.onerror = () => reject(new Error("Failed to preload showcase asset: " + scene.media));
      preload.src = scene.media;
    }))).catch((error) => {
      window.assetsError = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      window.assetsReady = true;
    });

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

async function prepareStagingDirectories() {
  await recoverStaleAssetDirectories({
    docsDir,
    publishedAssetsDir,
    validateAssetDirectory
  });
  if (await pathExists(backupAssetsDir)) {
    if (!(await pathExists(publishedAssetsDir))) {
      await rename(backupAssetsDir, publishedAssetsDir);
    } else {
      await rm(backupAssetsDir, { recursive: true, force: true });
    }
  }
  await rm(stagingAssetsDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
}

async function assertLoopbackPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", (error) => {
      const message = error.code === "EADDRINUSE"
        ? `Loopback port ${port} is already in use; refusing to capture from an unowned service`
        : `Unable to verify loopback port ${port}: ${error.message}`;
      reject(new Error(message, { cause: error }));
    });
    probe.listen(port, "127.0.0.1", () => {
      probe.close((error) => error ? reject(error) : resolve());
    });
  });
}

function monitorServer(child, abortController) {
  return new Promise((_, reject) => {
    const fail = (error) => {
      if (stoppingServer) {
        return;
      }
      abortController.abort(error);
      reject(error);
    };
    child.once("error", (error) => {
      fail(new Error(`Capture server failed to start: ${error.message}`, { cause: error }));
    });
    child.once("exit", (code, signal) => {
      fail(new Error(`Capture server exited unexpectedly (${signal ?? `code ${code}`})`));
    });
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function validateStagedAssets() {
  await validateAssetDirectory(stagingAssetsDir);
}

async function validateAssetDirectory(directory) {
  const files = (await readdir(directory)).sort();
  if (JSON.stringify(files) !== JSON.stringify(APPROVED_ASSETS)) {
    throw new InvalidMarketingAssetError(`Unexpected asset inventory in ${directory}: ${files.join(", ")}`);
  }

  for (const [name, [expectedWidth, expectedHeight]] of EXPECTED_PNG_DIMENSIONS) {
    const metadata = await probeAsset(path.join(directory, name));
    const stream = metadata.streams?.[0];
    if (stream?.codec_name !== "png" || stream.width !== expectedWidth || stream.height !== expectedHeight) {
      throw new InvalidMarketingAssetError(`Invalid ${name} metadata: ${JSON.stringify(stream)}`);
    }
  }

  const video = await probeAsset(path.join(directory, "agent-tmux-web-showcase.mp4"));
  assertShowcaseMetadata(video, {
    width: SHOWCASE_WIDTH,
    height: SHOWCASE_HEIGHT,
    fps: SHOWCASE_FPS,
    minDuration: 12,
    maxDuration: 18
  });
}

async function probeAsset(file) {
  const output = await runForOutput("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate",
    "-show_entries", "format=duration,size",
    "-of", "json",
    file
  ]);
  return JSON.parse(output);
}

async function publishAssetsAtomically() {
  const hadPublishedAssets = await pathExists(publishedAssetsDir);
  await rm(backupAssetsDir, { recursive: true, force: true });
  if (hadPublishedAssets) {
    await rename(publishedAssetsDir, backupAssetsDir);
  }
  try {
    await rename(stagingAssetsDir, publishedAssetsDir);
  } catch (error) {
    if (hadPublishedAssets && !(await pathExists(publishedAssetsDir)) && await pathExists(backupAssetsDir)) {
      await rename(backupAssetsDir, publishedAssetsDir);
    }
    throw error;
  }
  await rm(backupAssetsDir, { recursive: true, force: true });
}

async function pathExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function setViewport(page, width, height) {
  await page.setViewportSize({ width, height });
}

async function evaluate(page, expression) {
  await page.evaluate(expression);
}

async function chooseView(page, label, signal) {
  signal.throwIfAborted();
  const toggle = page.getByLabel(`Switch to ${label} view`);
  if (await toggle.count()) {
    await toggle.click();
  }
  await delay(350, signal);
}

async function selectDarkTheme(page, signal) {
  signal.throwIfAborted();
  await page.getByLabel("Open settings").click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await delay(200, signal);
}

async function openSettingsMenu(page, signal) {
  signal.throwIfAborted();
  const menu = page.locator("details.tmux-settings-menu");
  if (await menu.getAttribute("open") === null) {
    await page.getByLabel("Open settings").click();
  }
  const darkOption = page.getByRole("menuitemradio", { name: "Dark", exact: true });
  await darkOption.waitFor({ state: "visible" });
  if (await darkOption.getAttribute("aria-checked") !== "true") {
    throw new Error("Dark theme is not selected for the marketing capture");
  }
  await delay(200, signal);
}

async function waitForHttp(url, signal) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, { signal });
      if (response.ok) {
        return;
      }
    } catch (error) {
      signal.throwIfAborted();
      // Service is still starting.
    }
    await delay(200, signal);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function run(command, args, signal) {
  signal?.throwIfAborted();
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    const onAbort = () => {
      child.kill("SIGTERM");
      reject(signal.reason instanceof Error ? signal.reason : new Error(`${command} aborted`));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("exit", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
    child.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

async function runForOutput(command, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        reject(new Error(`${command} exited with ${code}: ${Buffer.concat(stderr).toString("utf8")}`));
      }
    });
    child.on("error", reject);
  });
}

function delay(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function handleTerminationSignal(signal) {
  if (interruptedSignal) {
    return;
  }
  interruptedSignal = signal;
  generationAbortController.abort(new Error(`Marketing capture interrupted by ${signal}`));
}
