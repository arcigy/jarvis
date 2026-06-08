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
const isNarrowViewport = viewport.width < 700;

const failures = [];
const consoleErrors = [];

process.on("uncaughtException", (error) => {
  console.error(safeErrorText(error));
  process.exitCode = 1;
  app.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error(safeErrorText(error));
  process.exitCode = 1;
  app.exit(1);
});

function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/(postgres(?:ql)?|redis):\/\/([^:\s/@]+):([^@\s]+)@/gi, "$1://$2:[redacted]@")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted-google-api-key]")
    .replace(/GOCSPX-[0-9A-Za-z_-]{10,}/g, "[redacted-google-client-secret]")
    .replace(/1\/\/[0-9A-Za-z_-]{20,}/g, "[redacted-google-refresh-token]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{8,}\b/gi, "[redacted-provider-key]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[redacted-hex-secret]");
}

function safeErrorText(error) {
  return redactSensitiveText(error instanceof Error ? error.stack || error.message : String(error));
}

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

function assertSize(name, box, minimum = { width: 24, height: 16 }) {
  if (!box) {
    fail(`${name} is missing.`);
    return;
  }
  if (box.width < minimum.width || box.height < minimum.height) {
    fail(`${name} is too small: ${Math.round(box.width)}x${Math.round(box.height)}.`);
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
      consoleErrors.push(redactSensitiveText(details.message));
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
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          sidebar: box(".sidebar"),
          nav: box("nav"),
          header: box("header"),
          rail: box("#missionRail"),
          cortex: box("#cortexMap"),
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
          }).length,
          visibleCortexNodes: [...document.querySelectorAll(".cortexNode")].filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 20 && rect.height > 20;
          }).length
        };
      })()
    `);

    if (dom.title !== "Arcigy Jarvis") fail(`Unexpected page title: ${dom.title}.`);
    if (!dom.coreImageComplete || dom.coreImageNaturalWidth < 100) fail("Command core image did not load.");
    if (dom.visibleMissionSignals !== 5) fail(`Expected 5 mission signals, found ${dom.visibleMissionSignals}.`);
    if (dom.visibleCortexNodes !== 5) fail(`Expected 5 cortex nodes, found ${dom.visibleCortexNodes}.`);
    if (/undefined|null|\[object Object\]/i.test(dom.bodyText)) fail("UI contains raw undefined/null/object text.");
    if (dom.scrollWidth > dom.clientWidth + 2) fail(`UI has horizontal overflow: ${dom.scrollWidth}px > ${dom.clientWidth}px.`);
    assertBox("sidebar", dom.sidebar, { width: isNarrowViewport ? 300 : 180, height: 60 });
    assertBox("navigation", dom.nav, { width: isNarrowViewport ? 300 : 150, height: 40 });
    assertBox("header", dom.header, { width: isNarrowViewport ? 300 : 400, height: 40 });
    if (isNarrowViewport) {
      assertVisibleStart("mission rail", dom.rail, { width: 300, height: 50 });
      assertSize("cortex map", dom.cortex, { width: 300, height: 80 });
      assertSize("command deck", dom.deck, { width: 300, height: 90 });
      assertSize("deck visual", dom.visual, { width: 120, height: 80 });
      assertSize("Jarvis panel", dom.jarvisPanel, { width: 280, height: 180 });
      assertSize("Jarvis response panel", dom.responsePanel, { width: 260, height: 90 });
    } else {
      assertBox("mission rail", dom.rail, { width: 600, height: 50 });
      assertBox("cortex map", dom.cortex, { width: 600, height: 80 });
      assertBox("command deck", dom.deck, { width: 600, height: 90 });
      assertBox("deck visual", dom.visual, { width: 120, height: 80 });
      assertVisibleStart("Jarvis panel", dom.jarvisPanel, { width: 280, height: 180 });
      assertVisibleStart("Jarvis response panel", dom.responsePanel, { width: 260, height: 90 });
    }
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
    console.error(`Jarvis UI smoke failed for ${redactSensitiveText(targetUrl)}`);
    for (const item of failures) console.error(`- ${redactSensitiveText(item)}`);
    process.exitCode = 1;
    app.exit(1);
  } else {
    console.log(`Jarvis UI smoke ready: ${targetUrl}`);
    console.log(`Screenshot: ${outputPath}`);
  }
}

run()
  .catch((error) => {
    console.error(safeErrorText(error));
    process.exitCode = 1;
  })
  .finally(() => {
    const code = process.exitCode;
    if (typeof code === "number" && code !== 0) {
      app.exit(code);
      return;
    }
    app.quit();
  });
