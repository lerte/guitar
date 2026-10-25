import { createWriteStream } from "node:fs";
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prepares the runtime assets the hand tracker needs, so the app is fully
 * self-hosted (no CDN dependency at runtime):
 *
 *   public/mediapipe/wasm/*  <- @mediapipe/tasks-vision (WASM inference runtime)
 *   public/models/hand_landmarker.task <- MediaPipe hand landmark model
 *
 * Both steps are idempotent: the marker file records the package version and
 * the model size, so repeated `npm run dev` / `npm run build` are cheap.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDest = join(root, "public", "mediapipe", "wasm");
const modelDest = join(root, "public", "models", "hand_landmarker.task");
const markerPath = join(root, "public", "assets.json");

const MODEL_VERSION = "float16/1";
const MODEL_URLS = [
  `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/${MODEL_VERSION}/hand_landmarker.task`,
  "https://cdn.jsdelivr.net/gh/google-ai-edge/mediapipe-samples@main/examples/hand_landmarker/web/hand_landmarker.task",
];

// SIMD build + non-SIMD fallback. The module variants are not used by the
// FilesetResolver path we serve, so we skip them to keep `dist/` small.
const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

const log = (message) => console.log(`[assets] ${message}`);

async function packageVersion() {
  const pkg = JSON.parse(
    await readFile(join(root, "node_modules", "@mediapipe", "tasks-vision", "package.json"), "utf8"),
  );
  return pkg.version;
}

async function copyWasm(version) {
  await mkdir(wasmDest, { recursive: true });
  const available = new Set(await readdir(wasmSrc));
  let copied = 0;
  for (const file of WASM_FILES) {
    if (!available.has(file)) {
      log(`warn: ${file} missing from @mediapipe/tasks-vision ${version}`);
      continue;
    }
    await cp(join(wasmSrc, file), join(wasmDest, file));
    copied += 1;
  }
  log(`wasm runtime ready (${copied} files, v${version})`);
}

async function downloadModel() {
  if (await exists(modelDest)) {
    const info = await stat(modelDest);
    if (info.size > 1_000_000) {
      log(`model ready (${(info.size / 1024 / 1024).toFixed(1)} MB)`);
      return true;
    }
    log("model file looks truncated, re-downloading");
  }

  await mkdir(dirname(modelDest), { recursive: true });

  for (const url of MODEL_URLS) {
    try {
      log(`downloading model: ${url}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength < 1_000_000) {
        throw new Error(`payload too small (${buffer.byteLength} bytes)`);
      }
      await writeFile(modelDest, buffer);
      log(`model saved (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
      return true;
    } catch (error) {
      log(`download failed (${url}): ${error.message}`);
    }
  }
  return false;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const version = await packageVersion();
  await copyWasm(version);
  const modelOk = await downloadModel();

  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(
    markerPath,
    JSON.stringify({ tasksVision: version, model: modelOk ? MODEL_VERSION : null }, null, 2),
  );

  if (!modelOk) {
    log("WARNING: could not download the hand model.");
    log("         The app will try the CDN at runtime, and shows a setup hint if that fails too.");
    // Non-fatal: the UI has a clear error state with a retry action.
  }
}

await main();
