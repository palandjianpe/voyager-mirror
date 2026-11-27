// Copies the MediaPipe runtime into public/ and fetches the two tracking models
// if they are missing. Runs automatically after "npm install".
import { cp, mkdir, access, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/wasm');
const modelDir = join(root, 'public/models');

const MODELS = {
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'pose_landmarker_full.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

const exists = (p) => access(p).then(() => true, () => false);

await mkdir(wasmDst, { recursive: true });
await mkdir(modelDir, { recursive: true });
await cp(wasmSrc, wasmDst, { recursive: true });
console.log('MediaPipe runtime copied to public/wasm');

for (const [name, url] of Object.entries(MODELS)) {
  const dst = join(modelDir, name);
  if (await exists(dst)) { console.log(`${name} already present`); continue; }
  console.log(`Downloading ${name} ...`);
  const res = await fetch(url);
  if (!res.ok) { console.error(`Could not download ${name}: HTTP ${res.status}`); process.exitCode = 1; continue; }
  await writeFile(dst, Buffer.from(await res.arrayBuffer()));
  console.log(`Saved ${name}`);
}
