import { chromium } from "playwright";
import { createServer } from "vite";

const vite = await createServer({
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 }
});
let browser;

try {
  await vite.listen();
  const origin = vite.resolvedUrls?.local?.[0];
  if (!origin) {
    throw new Error("Vite did not expose a loopback URL");
  }

  browser = await chromium.launch({ headless: true });
  await verifyMobileFocus(browser, new URL("?demo=1", origin).href);
  await verifyDesktopFocus(browser, new URL("?demo=1", origin).href);
  console.log("Raw terminal focus verification passed");
} finally {
  await browser?.close();
  await vite.close();
}

async function verifyMobileFocus(browser, url) {
  const context = await browser.newContext({
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    screen: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.stack || error.message}`));

  try {
    await loadRaw(page, url);
    await expectXtermFocus(page, false, "initial mobile Raw load");

    let points = await terminalPoints(page);
    await page.touchscreen.tap(points.output.x, points.output.y);
    await expectXtermFocus(page, false, "non-cursor output tap");

    await page.touchscreen.tap(points.cursor.x, points.cursor.y);
    await expectXtermFocus(page, true, "cursor-row tap");
    await blurActiveElement(page);

    const cdp = await context.newCDPSession(page);
    await touchStart(cdp, points.cursor);
    await page.waitForTimeout(760);
    await touchEnd(cdp);
    await expectXtermFocus(page, false, "cursor-row long press");

    const escapeButton = page.locator('.tmux-soft-keys button[title="Escape"]');
    const escapeBox = await requiredBox(escapeButton, "Escape soft key");
    await page.touchscreen.tap(escapeBox.x + escapeBox.width / 2, escapeBox.y + escapeBox.height / 2);
    await page.locator(".tmux-terminal-status").filter({ hasText: "sent Esc" }).waitFor();
    await expectXtermFocus(page, false, "Raw soft key");

    await dragTouch(cdp, points.cursor, points.screen);
    await expectXtermFocus(page, false, "drag starting on cursor row");

    await loadRaw(page, url);
    points = await terminalPoints(page);
    await dragTouch(cdp, points.output, points.screen);
    await expectXtermFocus(page, false, "drag starting on output");

    await page.getByLabel(/Change view\. Current view:/).click();
    await page.getByRole("menuitemradio", { name: "GUI" }).click();
    const visibleInput = page.locator('.tmux-send textarea[placeholder="send keys + Enter"]');
    await visibleInput.tap();
    await visibleInput.fill("visible-entry-check");
    if (await visibleInput.evaluate((node) => document.activeElement !== node)) {
      throw new Error("GUI visible input did not retain focus");
    }
    await page.getByLabel("Send to tmux").tap();
    if (await visibleInput.inputValue() !== "") {
      throw new Error("GUI visible input did not submit and clear");
    }

    if (errors.length > 0) {
      throw new Error(`Mobile browser errors:\n${errors.join("\n")}`);
    }
  } finally {
    await context.close();
  }
}

async function verifyDesktopFocus(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await loadRaw(page, url);
    await blurActiveElement(page);
    const screen = await requiredBox(page.locator(".xterm-screen"), "desktop xterm screen");
    await page.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
    await expectXtermFocus(page, true, "desktop mouse click");
  } finally {
    await context.close();
  }
}

async function loadRaw(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  if (await page.locator(".xterm-helper-textarea").count() === 0) {
    await page.getByLabel(/Change view\. Current view:/).click();
    await page.getByRole("menuitemradio", { name: "Raw" }).click();
  }
  await page.locator(".xterm-helper-textarea").waitFor({ state: "attached" });
  await page.locator(".xterm-screen").waitFor({ state: "visible" });
}

async function terminalPoints(page) {
  const screen = await requiredBox(page.locator(".xterm-screen"), "xterm screen");
  const cursorLocator = page.locator(".xterm-helper-textarea");
  const cursor = await requiredBox(cursorLocator, "xterm cursor textarea");
  const cursorCellHeight = await cursorLocator.evaluate((node) => Number.parseFloat(node.style.height));
  if (!Number.isFinite(cursorCellHeight) || cursorCellHeight <= 0) {
    throw new Error("xterm cursor textarea has no inline cell height");
  }
  const cursorY = cursor.y + cursorCellHeight / 2;
  const topY = screen.y + cursorCellHeight / 2;
  const bottomY = screen.y + screen.height - cursorCellHeight / 2;
  const outputY = Math.abs(topY - cursorY) > cursorCellHeight * 1.5 ? topY : bottomY;
  return {
    cursor: { x: screen.x + screen.width / 2, y: cursorY },
    output: { x: screen.x + screen.width - 8, y: outputY },
    screen
  };
}

async function requiredBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} has no bounding box`);
  return box;
}

async function blurActiveElement(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function expectXtermFocus(page, expected, label) {
  await page.waitForTimeout(100);
  const focused = await page.evaluate(() => (
    document.activeElement === document.querySelector(".xterm-helper-textarea")
  ));
  if (focused !== expected) {
    throw new Error(`${label}: expected xterm focus ${expected}, received ${focused}`);
  }
}

async function touchStart(cdp, point) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }]
  });
}

async function touchEnd(cdp) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function dragTouch(cdp, start, screen) {
  const roomAbove = start.y - screen.y;
  const direction = roomAbove > 120 ? -1 : 1;
  await touchStart(cdp, start);
  for (const distance of [20, 40, 70, 100]) {
    await pageDelay(25);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        id: 1,
        x: start.x,
        y: start.y + direction * distance,
        radiusX: 2,
        radiusY: 2,
        force: 1
      }]
    });
  }
  await touchEnd(cdp);
  await pageDelay(150);
}

function pageDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
