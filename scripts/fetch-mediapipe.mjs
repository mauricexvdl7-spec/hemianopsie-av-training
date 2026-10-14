// Build-Schritt vor Vite: legt die MediaPipe-Dateien nach public/mediapipe/ (Vite kopiert sie nach dist/).
// - WASM-Dateien kommen aus dem npm-Paket @mediapipe/tasks-vision.
// - Das Modell face_landmarker.task wird einmal heruntergeladen; ein vorhandenes Modell bleibt.
// Fehlt das Modell danach, endet der Build mit Exit 1, außer SKIP_MEDIAPIPE_MODEL=1 (nur Entwicklung/Tests).
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const outDir = join(root, 'public', 'mediapipe');
const wasmOut = join(outDir, 'wasm');
const modelOut = join(outDir, 'face_landmarker.task');
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const DOWNLOAD_TIMEOUT_MS = 60_000;
const skipModel = process.env.SKIP_MEDIAPIPE_MODEL === '1';

function copyWasm() {
  if (!existsSync(wasmSrc)) {
    console.error(`MediaPipe: WASM-Ordner fehlt (${wasmSrc}). Erst „npm install“ ausführen.`);
    process.exit(1);
  }
  mkdirSync(wasmOut, { recursive: true });
  const files = readdirSync(wasmSrc);
  for (const f of files) copyFileSync(join(wasmSrc, f), join(wasmOut, f));
  console.log(`MediaPipe: ${files.length} WASM-Dateien kopiert.`);
}

const hasModel = () => existsSync(modelOut) && statSync(modelOut).size > 0;

async function downloadModel() {
  const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length === 0) throw new Error('leere Antwort');
  // Erst vollständig schreiben, dann umbenennen: kein halbes Modell bei Abbruch.
  const tmp = `${modelOut}.part`;
  writeFileSync(tmp, data);
  renameSync(tmp, modelOut);
  console.log(`MediaPipe: Modell geladen (${(data.length / 1e6).toFixed(1)} MB).`);
}

copyWasm();
if (hasModel()) {
  console.log('MediaPipe: Modell vorhanden.');
} else if (skipModel) {
  console.log('MediaPipe: Modell übersprungen (SKIP_MEDIAPIPE_MODEL=1).');
} else {
  mkdirSync(outDir, { recursive: true });
  try {
    await downloadModel();
  } catch (e) {
    rmSync(`${modelOut}.part`, { force: true });
    console.error(`MediaPipe: Modell konnte nicht geladen werden (${e instanceof Error ? e.message : e}).`);
    process.exit(1);
  }
}
