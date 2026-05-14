import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "docs", "assets");
const framesDir = path.join(assetsDir, "frames");
const chromiumPort = Number(process.env.CHROMIUM_DEBUG_PORT ?? 9510);
const appPort = Number(process.env.MARKETING_APP_PORT ?? 6180);
const appUrl = process.env.MARKETING_URL ?? `http://127.0.0.1:${appPort}`;
const demoUrl = `${appUrl}/?demo=1`;

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
let browserCdp;
let pageCdp;

try {
  await waitForHttp(`${appUrl}/healthz`);

  browser = spawn("chromium", [
    "--headless=new",
    `--remote-debugging-port=${chromiumPort}`,
    "--window-size=390,844",
    `--user-data-dir=/tmp/agent-tmux-web-marketing-${chromiumPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-features=Translate",
    "--no-sandbox",
    "about:blank"
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  browser.stderr.on("data", (chunk) => process.stderr.write(chunk));

  const endpoint = `http://127.0.0.1:${chromiumPort}`;
  await waitForHttp(`${endpoint}/json/version`);

  const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(demoUrl)}`, { method: "PUT" }).then((response) => response.json());
  const browserInfo = await fetch(`${endpoint}/json/version`).then((response) => response.json());
  browserCdp = await connectCdp(browserInfo.webSocketDebuggerUrl);
  pageCdp = await connectCdp(target.webSocketDebuggerUrl);
  await pageCdp.send("Page.enable");
  await pageCdp.send("Runtime.enable");

  await setViewport(pageCdp, 390, 844, true);
  await pageCdp.send("Page.navigate", { url: demoUrl });
  await delay(1200);
  await capture(pageCdp, path.join(assetsDir, "mobile-chat.png"));

  await evaluate(pageCdp, "document.querySelector('.tmux-session-menu-button')?.click()");
  await delay(250);
  await capture(pageCdp, path.join(assetsDir, "mobile-launchers.png"));

  await evaluate(pageCdp, `
    (() => {
      const select = document.querySelector('.tmux-tool-actions select');
      if (select) {
        select.value = 'claude';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `);
  await delay(250);
  await capture(pageCdp, path.join(assetsDir, "mobile-claude.png"));

  await evaluate(pageCdp, "document.querySelector('.tmux-session-menu-button')?.click()");
  await delay(250);
  await evaluate(pageCdp, "document.querySelector('[aria-label=\"Attach raw tmux terminal\"]')?.click()");
  await delay(350);
  await capture(pageCdp, path.join(assetsDir, "mobile-raw-terminal.png"));

  await setViewport(pageCdp, 1440, 900, false);
  await pageCdp.send("Page.navigate", { url: demoUrl });
  await delay(1000);
  await capture(pageCdp, path.join(assetsDir, "desktop-overview.png"));

  await setViewport(pageCdp, 390, 844, true);
  await pageCdp.send("Page.navigate", { url: demoUrl });
  await delay(800);

  const frameFiles = [];
  for (const step of [
    async () => {},
    async () => evaluate(pageCdp, "document.querySelector('.tmux-session-menu-button')?.click()"),
    async () => evaluate(pageCdp, `
      (() => {
        const select = document.querySelector('.tmux-tool-actions select');
        if (select) {
          select.value = 'claude';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `),
    async () => evaluate(pageCdp, "document.querySelector('.tmux-session-menu-button')?.click()"),
    async () => evaluate(pageCdp, "document.querySelector('[aria-label=\"Attach raw tmux terminal\"]')?.click()")
  ]) {
    await step();
    await delay(350);
    const source = await screenshot(pageCdp);
    for (let repeat = 0; repeat < 12; repeat += 1) {
      const file = path.join(framesDir, `frame-${String(frameFiles.length).padStart(3, "0")}.png`);
      await writeFile(file, source);
      frameFiles.push(file);
    }
  }

  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    "6",
    "-i",
    path.join(framesDir, "frame-%03d.png"),
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-movflags",
    "+faststart",
    path.join(assetsDir, "agent-tmux-web-mobile-demo.mp4")
  ]);

  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    "6",
    "-i",
    path.join(framesDir, "frame-%03d.png"),
    "-filter_complex",
    "fps=6,scale=390:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5",
    path.join(assetsDir, "agent-tmux-web-mobile-demo.gif")
  ]);

  await rm(framesDir, { recursive: true, force: true });
  console.log(`Marketing assets written to ${path.relative(root, assetsDir)}`);
} finally {
  pageCdp?.close();
  if (browserCdp) {
    await browserCdp.send("Browser.close").catch(() => {});
    browserCdp.close();
  }
  if (browser && browser.exitCode === null) {
    browser.kill("SIGTERM");
  }
  if (server.exitCode === null) {
    server.kill("SIGTERM");
  }
}

async function capture(cdp, file) {
  await writeFile(file, await screenshot(cdp));
}

async function screenshot(cdp) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  return Buffer.from(result.data, "base64");
}

async function setViewport(cdp, width, height, mobile) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile
  });
}

async function evaluate(cdp, expression) {
  await cdp.send("Runtime.evaluate", { expression, awaitPromise: true });
}

async function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();

  socket.on("message", (data) => {
    const message = JSON.parse(String(data));
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  return {
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      socket.close();
    }
  };
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
