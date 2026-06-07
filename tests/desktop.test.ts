import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("desktop shell exposes Jarvis wake-word UI and safe preload boundary", () => {
  const html = readFileSync("src/desktop/index.html", "utf-8");
  const renderer = readFileSync("src/desktop/renderer.js", "utf-8");
  const main = readFileSync("src/desktop/main.cjs", "utf-8");
  const preload = readFileSync("src/desktop/preload.cjs", "utf-8");

  assert.match(html, /Jarvis Console/);
  assert.match(html, /Enable/);
  assert.match(renderer, /SpeechRecognition/);
  assert.match(renderer, /speechSynthesis/);
  assert.match(renderer, /window\.arcigyDesktop\.jarvisVoiceEvent/);
  assert.match(renderer, /window\.arcigyDesktop\.coldOutreachBrief/);
  assert.doesNotMatch(renderer, /Za dnes sme napísali/);
  assert.match(main, /ipcMain\.handle\("jarvis:coldOutreachBrief"/);
  assert.match(main, /ipcMain\.handle\("jarvis:voiceEvent"/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.match(preload, /jarvisVoiceEvent/);
  assert.match(preload, /coldOutreachBrief/);
});
