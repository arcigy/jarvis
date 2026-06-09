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
    await waitForCommandDeck(window);

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
          voiceRuntime: box("#voiceRuntime"),
          responsePanel: box("#jarvisPanel + .panel"),
          missionReadiness: box("#missionReadiness"),
          missionRemote: box("#missionRemote"),
          readyIntegrationsText: document.querySelector("#readyIntegrations")?.textContent.trim() || "",
          mcpToolCountText: document.querySelector("#mcpToolCount")?.textContent.trim() || "",
          approvalLockCountText: document.querySelector("#approvalLockCount")?.textContent.trim() || "",
          handoffProofGatesText: document.querySelector("#handoffProofGates")?.textContent.trim() || "",
          voiceModeText: document.querySelector("#voiceMode")?.textContent.trim() || "",
          voiceInputText: document.querySelector("#voiceInput")?.textContent.trim() || "",
          voiceOutputText: document.querySelector("#voiceOutput")?.textContent.trim() || "",
          voiceLastEventText: document.querySelector("#voiceLastEvent")?.textContent.trim() || "",
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

    const preflight = await fetchUiPreflight();
    const displayedToolCount = Number(dom.mcpToolCountText);
    const displayedApprovalLockCount = Number(dom.approvalLockCountText);
    if (dom.title !== "Arcigy Jarvis") fail(`Unexpected page title: ${dom.title}.`);
    if (!dom.coreImageComplete || dom.coreImageNaturalWidth < 100) fail("Command core image did not load.");
    if (dom.visibleMissionSignals !== 5) fail(`Expected 5 mission signals, found ${dom.visibleMissionSignals}.`);
    if (dom.visibleCortexNodes !== 5) fail(`Expected 5 cortex nodes, found ${dom.visibleCortexNodes}.`);
    if (/undefined|null|\[object Object\]/i.test(dom.bodyText)) fail("UI contains raw undefined/null/object text.");
    if (dom.scrollWidth > dom.clientWidth + 2) fail(`UI has horizontal overflow: ${dom.scrollWidth}px > ${dom.clientWidth}px.`);
    if (!/^[0-9]+\/[0-9]+$/.test(dom.readyIntegrationsText)) fail(`Ready integration count is not loaded: ${dom.readyIntegrationsText}.`);
    if (!/^[0-9]+$/.test(dom.mcpToolCountText) || displayedToolCount < 35) fail(`MCP tool count is stale or not loaded: ${dom.mcpToolCountText}.`);
    if (!/^[0-9]+$/.test(dom.approvalLockCountText) || displayedApprovalLockCount < 6) fail(`Approval lock count is stale or not loaded: ${dom.approvalLockCountText}.`);
    if (displayedToolCount !== preflight.mcpToolCount) fail(`MCP tool count mismatch: UI ${displayedToolCount}, preflight ${preflight.mcpToolCount}.`);
    if (displayedApprovalLockCount !== preflight.riskyToolsRequiringApproval.length) {
      fail(`Approval lock count mismatch: UI ${displayedApprovalLockCount}, preflight ${preflight.riskyToolsRequiringApproval.length}.`);
    }
    const proofGateText = String(dom.handoffProofGatesText ?? "");
    const proofReadyMatch = proofGateText.match(/^ready:\s*(\d+)\/(\d+)\s+safety gates$/i);
    if (/smoke not run|blocked:/i.test(proofGateText)) {
      // Initial and blocked states are valid render states for the first smoke pass.
    } else if (!proofReadyMatch) {
      fail(`Remote proof gates are not rendered: ${proofGateText}.`);
    } else if (proofReadyMatch[1] !== proofReadyMatch[2] || Number(proofReadyMatch[1]) < 13) {
      fail(`Remote proof gates are stale or incomplete: ${proofGateText}.`);
    }
    if (!/^idle$|^listening$|^awake$|^processing$/i.test(dom.voiceModeText)) fail(`Voice mode is not rendered: ${dom.voiceModeText}.`);
    if (!/microphone ready|text fallback/i.test(dom.voiceInputText)) fail(`Voice input capability is not rendered: ${dom.voiceInputText}.`);
    if (!/speech ready|screen only/i.test(dom.voiceOutputText)) fail(`Voice output capability is not rendered: ${dom.voiceOutputText}.`);
    if (!/standby|microphone|fallback|disabled|heard/i.test(dom.voiceLastEventText)) fail(`Voice event status is not rendered: ${dom.voiceLastEventText}.`);
    assertBox("sidebar", dom.sidebar, { width: isNarrowViewport ? 300 : 180, height: 60 });
    assertBox("navigation", dom.nav, { width: isNarrowViewport ? 300 : 150, height: 40 });
    assertBox("header", dom.header, { width: isNarrowViewport ? 300 : 400, height: 40 });
    if (isNarrowViewport) {
      assertVisibleStart("mission rail", dom.rail, { width: 300, height: 50 });
      assertSize("cortex map", dom.cortex, { width: 300, height: 80 });
      assertSize("command deck", dom.deck, { width: 300, height: 90 });
      assertSize("deck visual", dom.visual, { width: 120, height: 80 });
      assertSize("Jarvis panel", dom.jarvisPanel, { width: 280, height: 180 });
      assertSize("voice runtime", dom.voiceRuntime, { width: 260, height: 44 });
      assertSize("Jarvis response panel", dom.responsePanel, { width: 260, height: 90 });
    } else {
      assertBox("mission rail", dom.rail, { width: 600, height: 50 });
      assertBox("cortex map", dom.cortex, { width: 600, height: 80 });
      assertBox("command deck", dom.deck, { width: 600, height: 90 });
      assertBox("deck visual", dom.visual, { width: 120, height: 80 });
      assertVisibleStart("Jarvis panel", dom.jarvisPanel, { width: 280, height: 180 });
      assertVisibleStart("voice runtime", dom.voiceRuntime, { width: 260, height: 44 });
      assertVisibleStart("Jarvis response panel", dom.responsePanel, { width: 260, height: 90 });
    }
    assertBox("mission readiness", dom.missionReadiness, { width: 40, height: 16 });
    assertBox("mission remote", dom.missionRemote, { width: 40, height: 16 });

    await waitForPaint(window);
    const image = await window.webContents.capturePage();
    const png = image.toPNG();
    assertScreenshotPixels(image, png);
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

async function waitForPaint(window) {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })
  `);
}

async function fetchUiPreflight() {
  const preflightUrl = new URL("/api/web-bridge-preflight", targetUrl);
  const response = await fetch(preflightUrl, { headers: { connection: "close" } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    fail(`Web bridge preflight did not return JSON: HTTP ${response.status}.`);
    return { mcpToolCount: 0, riskyToolsRequiringApproval: [] };
  }
  const mcpToolCount = Number(body.mcpToolCount);
  const riskyToolsRequiringApproval = Array.isArray(body.riskyToolsRequiringApproval) ? body.riskyToolsRequiringApproval : [];
  if (!Number.isInteger(mcpToolCount) || mcpToolCount < 35) fail(`Preflight MCP tool count is stale: ${body.mcpToolCount}.`);
  if (riskyToolsRequiringApproval.length < 6) fail(`Preflight approval lock count is stale: ${riskyToolsRequiringApproval.length}.`);
  return { mcpToolCount, riskyToolsRequiringApproval };
}

function assertScreenshotPixels(image, png) {
  const size = image.getSize();
  if (size.width < viewport.width * 0.8 || size.height < viewport.height * 0.8) {
    fail(`Screenshot size is too small: ${size.width}x${size.height}.`);
  }
  if (png.length < viewport.width * viewport.height * 0.08) {
    fail(`Screenshot PNG is suspiciously small for viewport: ${png.length} bytes.`);
  }
  const bitmap = image.toBitmap();
  let sampled = 0;
  let dark = 0;
  let bright = 0;
  let accent = 0;
  let minBrightness = 255;
  let maxBrightness = 0;
  const buckets = new Set();
  const stride = Math.max(4, Math.floor(bitmap.length / 12000 / 4) * 4);
  for (let index = 0; index + 3 < bitmap.length; index += stride) {
    const b = bitmap[index];
    const g = bitmap[index + 1];
    const r = bitmap[index + 2];
    const alpha = bitmap[index + 3];
    if (alpha < 10) continue;
    sampled += 1;
    const brightness = (r + g + b) / 3;
    minBrightness = Math.min(minBrightness, brightness);
    maxBrightness = Math.max(maxBrightness, brightness);
    if (brightness < 34) dark += 1;
    if (brightness > 150) bright += 1;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 42 && brightness > 45) accent += 1;
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
    if (buckets.size > 512) break;
  }
  if (sampled < 1000) {
    fail(`Screenshot pixel sample is too small: ${sampled}.`);
    return;
  }
  const brightnessSpread = maxBrightness - minBrightness;
  const darkRatio = dark / sampled;
  const brightRatio = bright / sampled;
  const accentRatio = accent / sampled;
  if (buckets.size < 36) fail(`Screenshot has too little color detail: ${buckets.size} color buckets.`);
  if (brightnessSpread < 70) fail(`Screenshot has too little brightness range: ${Math.round(brightnessSpread)}.`);
  if (darkRatio < 0.15) fail(`Screenshot is missing the dark Jarvis shell: ${darkRatio.toFixed(3)} dark pixels.`);
  if (brightRatio < 0.01) fail(`Screenshot is missing bright readable UI details: ${brightRatio.toFixed(3)} bright pixels.`);
  if (accentRatio < 0.02) fail(`Screenshot is missing colored Jarvis accents: ${accentRatio.toFixed(3)} accent pixels.`);
}

async function waitForCommandDeck(window) {
  const deadline = Date.now() + 5000;
  let lastState = {};
  let lastSignature = "";
  let stableReads = 0;
  while (Date.now() < deadline) {
    lastState = await window.webContents.executeJavaScript(`
      (() => ({
        ready: document.querySelector("#readyIntegrations")?.textContent.trim() || "",
        tools: document.querySelector("#mcpToolCount")?.textContent.trim() || "",
        locks: document.querySelector("#approvalLockCount")?.textContent.trim() || ""
      }))()
    `);
    const signature = `${lastState.ready}|${lastState.tools}|${lastState.locks}`;
    if (/^[0-9]+\/[0-9]+$/.test(lastState.ready) && /^[0-9]+$/.test(lastState.tools) && /^[0-9]+$/.test(lastState.locks)) {
      stableReads = signature === lastSignature ? stableReads + 1 : 1;
      lastSignature = signature;
      if (stableReads >= 3) return;
    } else {
      stableReads = 0;
      lastSignature = signature;
    }
    await new Promise((resolveDone) => setTimeout(resolveDone, 200));
  }
  fail(`Command deck did not finish loading: ${JSON.stringify(lastState)}.`);
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
