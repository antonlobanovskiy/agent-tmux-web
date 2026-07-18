import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeDir = path.join(root, "docs", "play-store", "assets");
const framesDir = path.join(storeDir, ".frames");
const appPort = Number(process.env.PLAY_STORE_APP_PORT ?? 6181);
const appUrl = process.env.PLAY_STORE_URL ?? `http://127.0.0.1:${appPort}`;
const demoUrl = `${appUrl}/?demo=1`;

await mkdir(storeDir, { recursive: true });
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

try {
  await waitForHttp(`${appUrl}/healthz`);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--no-sandbox"]
  });

  const phoneContext = await browser.newContext({
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    screen: { width: 360, height: 640 },
    viewport: { width: 360, height: 640 }
  });
  const phone = await phoneContext.newPage();
  await phone.goto(demoUrl, { waitUntil: "domcontentloaded" });
  await delay(1000);

  await chooseMenuOption(phone, "GUI");
  await chooseMenuOption(phone, "Dark");
  await capture(phone, "phone-01-gui.png");

  await phone.locator(".tmux-session-menu-button").click();
  await delay(250);
  await capture(phone, "phone-02-launchers.png");
  await phone.locator(".tmux-session-menu-button").click();
  await delay(150);

  await chooseMenuOption(phone, "Raw");
  await delay(300);
  await capture(phone, "phone-03-raw-tmux.png");

  await chooseMenuOption(phone, "GUI");
  await chooseMenuOption(phone, "Light");
  await delay(250);
  await capture(phone, "phone-04-light-mode.png");
  await phoneContext.close();

  const featureHtml = path.join(framesDir, "feature-graphic.html");
  await writeFile(
    featureHtml,
    buildFeatureGraphicHtml(pathToFileURL(path.join(storeDir, "phone-01-gui.png")).href)
  );
  const graphicsContext = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: 1024, height: 500 }
  });
  const graphic = await graphicsContext.newPage();
  await graphic.goto(pathToFileURL(featureHtml).href, { waitUntil: "load" });
  await delay(200);
  await graphic.screenshot({ path: path.join(storeDir, "feature-graphic-1024x500.png") });
  await graphicsContext.close();

  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path.join(root, "android", "app", "src", "main", "res", "drawable-nodpi", "ic_launcher_image.png"),
    "-vf",
    "scale=512:512:flags=lanczos",
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgba",
    path.join(storeDir, "icon-512.png")
  ]);

  await verifyPng("icon-512.png", 512, 512, { maxBytes: 1_000_000, colorTypes: [6] });
  await verifyPng("feature-graphic-1024x500.png", 1024, 500, { colorTypes: [2] });
  for (const name of [
    "phone-01-gui.png",
    "phone-02-launchers.png",
    "phone-03-raw-tmux.png",
    "phone-04-light-mode.png"
  ]) {
    await verifyPng(name, 1080, 1920, { colorTypes: [2] });
  }

  console.log(`Play Store assets written to ${path.relative(root, storeDir)}`);
} finally {
  await browser?.close().catch(() => {});
  await rm(framesDir, { recursive: true, force: true });
  if (server.exitCode === null) {
    server.kill("SIGTERM");
  }
}

async function capture(page, filename) {
  console.log(`Capturing ${filename}`);
  await page.screenshot({ path: path.join(storeDir, filename) });
}

async function chooseMenuOption(page, label) {
  await page.locator(".tmux-view-menu summary").click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
  await delay(250);
}

async function verifyPng(filename, expectedWidth, expectedHeight, options = {}) {
  const data = await readFile(path.join(storeDir, filename));
  if (data.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${filename} is not a PNG`);
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const colorType = data[25];
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${filename} is ${width}x${height}; expected ${expectedWidth}x${expectedHeight}`);
  }
  if (options.maxBytes && data.byteLength > options.maxBytes) {
    throw new Error(`${filename} is ${data.byteLength} bytes; maximum is ${options.maxBytes}`);
  }
  if (options.colorTypes && !options.colorTypes.includes(colorType)) {
    throw new Error(`${filename} has PNG color type ${colorType}; expected ${options.colorTypes.join(" or ")}`);
  }
}

function buildFeatureGraphicHtml(screenshotUrl) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 1024px; height: 500px; margin: 0; overflow: hidden; }
    body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 42px;
      padding: 48px 72px;
      background: #0e1113;
      color: #f4f7f6;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .copy { align-self: center; min-width: 0; }
    .brand { margin: 0 0 22px; color: #67d2b5; font-size: 19px; font-weight: 800; }
    h1 { max-width: 540px; margin: 0; font-size: 52px; line-height: 1.05; letter-spacing: 0; }
    p { max-width: 520px; margin: 22px 0 0; color: #c1cbc8; font-size: 20px; line-height: 1.4; }
    .signals { display: flex; gap: 12px; margin-top: 28px; }
    .signal { display: flex; align-items: center; gap: 7px; color: #e0e6e4; font-size: 14px; font-weight: 700; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .green { background: #54b399; }
    .yellow { background: #e2b84b; }
    .red { background: #de665f; }
    .device {
      align-self: center;
      justify-self: end;
      width: 226px;
      height: 402px;
      padding: 8px;
      border: 1px solid #4a5559;
      border-radius: 28px;
      background: #20262a;
      box-shadow: 0 24px 42px rgba(0, 0, 0, 0.48);
      transform: rotate(2deg);
    }
    .device img {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 21px;
      object-fit: cover;
      object-position: top;
      background: #0f1214;
    }
  </style>
</head>
<body>
  <section class="copy">
    <div class="brand">Agent Tmux Web</div>
    <h1>Your tmux agents. In your pocket.</h1>
    <p>Private server control with readable chat, exact terminal access, and waiting-session alerts.</p>
    <div class="signals">
      <span class="signal"><i class="dot green"></i>Running</span>
      <span class="signal"><i class="dot yellow"></i>Waiting</span>
      <span class="signal"><i class="dot red"></i>Error</span>
    </div>
  </section>
  <div class="device"><img src="${screenshotUrl}" alt="Agent Tmux Web session"></div>
</body>
</html>`;
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
      // The demo server is still starting.
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
