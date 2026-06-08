const { app, BrowserWindow } = require("electron");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const item = process.argv[index];
  if (!item.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(item, next && !next.startsWith("--") ? next : "true");
}

const repoRoot = resolve(__dirname, "..");
const targetUrl = process.env.JARVIS_UI_SMOKE_URL || args.get("--target") || "http://127.0.0.1:8765/index.html";
const outputPath = resolve(repoRoot, process.env.JARVIS_UI_SMOKE_OUT || args.get("--out") || "generated/jarvis-ui-smoke.png");
const viewport = {
  width: Number(args.get("--width") || 1440),
  height: Number(args.get("--height") || 960),
};

const failures = [];
const consoleErrors = [];

process.on("uncaughtException", (error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
  app.quit();
});

process.on("unhandledRejection", (error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
  app.quit();
});

function fail(message) {
  failures.push(message);
}

function assertBox(name, box, minimum = { width: 24, height: 16 }) {
  if (!box) {
    fail(`${name} is missing.`);
    return;
  }
  if (box.width < minimum.width || box.height < minimum.height) {
    fail(`${name} is too small: ${Math.round(box.width)}x${Math.round(box.height)}.`);
  }
  if (box.left < 0 || box.top < 0 || box.right > viewport.width || box.bottom > viewport.height) {
    fail(`${name} is outside the first viewport.`);
  }
}

function assertVisibleStart(name, box, minimum = { width: 24, height: 16 }) {
  if (!box) {
    fail(`${name} is missing.`);
    return;
  }
  if (box.width < minimum.width || box.height < minimum.height) {
    fail(`${name} is too small: ${Math.round(box.width)}x${Math.round(box.height)}.`);
  }
  if (box.left < 0 || box.top < 0 || box.left > viewport.width || box.top > viewport.height) {
    fail(`${name} does not start inside the first viewport.`);
  }
}

async function run() {
  console.log(`Jarvis UI smoke loading: ${targetUrl}`);
  await app.whenReady();
  const window = new BrowserWindow({
    width: viewport.width,
    height: viewport.height,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on("console-message", (_event, details) => {
    if (details.level >= 2 && !String(details.message).includes("Autofill.enable")) {
      consoleErrors.push(details.message);
    }
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    fail(`Renderer process ended: ${details.reason}.`);
  });

  try {
    await window.loadURL(targetUrl);
    await new Promise((resolveDone) => setTimeout(resolveDone, 1400));

    const dom = await window.webContents.executeJavaScript(`
      (() => {
        const box = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            text: node.textContent.trim(),
            display: style.display,
            visibility: style.visibility,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          };
        };
        return {
          title: document.title,
          bodyText: document.body.innerText,
          rail: box("#missionRail"),
          deck: box("#commandDeck"),
          visual: box(".deckVisual"),
          jarvisPanel: box("#jarvisPanel"),
          responsePanel: box("#jarvisPanel + .panel"),
          missionReadiness: box("#missionReadiness"),
          missionRemote: box("#missionRemote"),
          coreImageComplete: document.querySelector(".coreVisual")?.complete === true,
          coreImageNaturalWidth: document.querySelector(".coreVisual")?.naturalWidth || 0,
          visibleMissionSignals: [...document.querySelectorAll(".missionSignal")].filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 20 && rect.height > 20;
          }).length
        };
      })()
    `);

    if (dom.title !== "Arcigy Jarvis") fail(`Unexpected page title: ${dom.title}.`);
    if (!dom.coreImageComplete || dom.coreImageNaturalWidth < 100) fail("Command core image did not load.");
    if (dom.visibleMissionSignals !== 5) fail(`Expected 5 mission signals, found ${dom.visibleMissionSignals}.`);
    if (/undefined|null|\[object Object\]/i.test(dom.bodyText)) fail("UI contains raw undefined/null/object text.");
    assertBox("mission rail", dom.rail, { width: 600, height: 50 });
    assertBox("command deck", dom.deck, { width: 600, height: 90 });
    assertBox("deck visual", dom.visual, { width: 120, height: 80 });
    assertVisibleStart("Jarvis panel", dom.jarvisPanel, { width: 280, height: 180 });
    assertVisibleStart("Jarvis response panel", dom.responsePanel, { width: 260, height: 90 });
    assertBox("mission readiness", dom.missionReadiness, { width: 40, height: 16 });
    assertBox("mission remote", dom.missionRemote, { width: 40, height: 16 });

    const image = await window.webContents.capturePage();
    const png = image.toPNG();
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, png);
    if (!existsSync(outputPath) || png.length < 100000) fail(`Screenshot was not written correctly: ${outputPath}.`);
  } finally {
    window.destroy();
  }

  if (consoleErrors.length) fail(`Renderer console errors: ${consoleErrors.slice(0, 5).join(" | ")}`);
  if (failures.length) {
    console.error(`Jarvis UI smoke failed for ${targetUrl}`);
    for (const item of failures) console.error(`- ${item}`);
    process.exitCode = 1;
    app.exit(1);
  } else {
    console.log(`Jarvis UI smoke ready: ${targetUrl}`);
    console.log(`Screenshot: ${outputPath}`);
  }
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
