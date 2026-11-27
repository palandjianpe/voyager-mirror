// Voyager Mirror: app wiring and the frame loop.
import * as THREE from 'three';
import { Tracker, type FaceState, type FrameSource } from './tracker';
import { Character, makePose } from './character';
import { Rig } from './rig';
import { Backdrop, type SceneName } from './scenes';
import { Effects, EFFECTS, type EffectId } from './effects';
import { Capture } from './capture';
import { buildDressPanel, buildScenePanel, buildEffectsPanel, loadLook } from './ui';

type Mode = 'puppet' | 'overlay';
type Framing = 'full' | 'upper' | 'face';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

// ---------------------------------------------------------------- three
const glCanvas = $<HTMLCanvasElement>('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const hemi = new THREE.HemisphereLight(0xffffff, 0xe8c9a0, 1.25);
const sun = new THREE.DirectionalLight(0xfff2d6, 1.5); sun.position.set(2.5, 4, 5);
scene.add(hemi, sun);
const persp = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50); ortho.position.set(0, 0, 10);

const backdrop = new Backdrop(hemi, sun);
backdrop.onChange = () => { if (mode === 'puppet') scene.background = backdrop.background; };
const look = loadLook();
const character = new Character(look);
const effects = new Effects();
const actor = new THREE.Group(); actor.add(character.group);
scene.add(backdrop.group, actor, effects.group);

const tracker = new Tracker();
const rig = new Rig();
const pose = makePose();

// ---------------------------------------------------------------- state
let mode: Mode = (params.get('mode') as Mode) || (store.get('vm-mode') as Mode) || 'puppet';
const savedFrame = params.get('frame') || store.get('vm-frame');
let framing: Framing = savedFrame === 'upper' || savedFrame === 'face' ? savedFrame : 'full';
let source: FrameSource | null = null;
let srcW = 0, srcH = 0, lastVideoTime = -1, stream: MediaStream | null = null;
let stageW = 1, stageH = 1, started = false, showPip = pipDefault();
/** The camera preview starts hidden on phones, where it covers too much of a small screen. A saved choice wins. */
function pipDefault() {
  const saved = store.get('vm-pip');
  if (saved !== null) return saved !== '0';
  return !window.matchMedia('(max-width: 600px), (max-height: 600px)').matches;
}
const camLayer = $('camLayer'), pip = $<HTMLCanvasElement>('pip'), pipCtx = pip.getContext('2d')!;
const hint = $('hint');

const capture = new Capture(glCanvas, () => ({ el: source, w: srcW, h: srcH, visible: mode === 'overlay' }), toast);

let faceDist = 1;
const camAim = new THREE.Vector3();

function resize() {
  stageW = window.innerWidth; stageH = window.innerHeight;
  renderer.setSize(stageW, stageH, false);
  const aspect = stageW / stageH;
  persp.aspect = aspect;
  // Full body keeps the whole character in view, with room to raise her arms and step sideways.
  // Upper body frames her from the hips up, for when you sit close to the camera.
  // Face frames just her head and shoulders, for holding the phone up close; the frame loop keeps it centered on her head.
  const tan = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
  const [h, w, cy] = framing === 'face' ? [0.82, 0.72, 1.55] : framing === 'upper' ? [1.6, 1.5, 1.36] : [2.9, 2.3, 1.02];
  const dist = Math.max(h / (2 * tan), w / (2 * tan * aspect));
  faceDist = dist; camAim.set(0, cy, 0);
  persp.position.set(0, cy + (framing === 'face' ? 0.03 : 0.1), dist); persp.lookAt(0, cy, 0);
  persp.updateProjectionMatrix();
  ortho.left = -aspect; ortho.right = aspect; ortho.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/** Camera picture coordinates (0..1) to overlay scene coordinates, mirrored and cover-fitted. */
function mapToStage(u: number, v: number, out: THREE.Vector3) {
  const sc = Math.max(stageW / srcW, stageH / srcH), dw = srcW * sc, dh = srcH * sc;
  const px = (stageW - dw) / 2 + (1 - u) * dw, py = (stageH - dh) / 2 + v * dh;
  return out.set(((px / stageW) * 2 - 1) * (stageW / stageH), 1 - (py / stageH) * 2, 0);
}

function setMode(m: Mode) {
  mode = m; store.set('vm-mode', m);
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  camLayer.classList.toggle('off', m !== 'overlay');
  backdrop.group.visible = m === 'puppet';
  scene.background = m === 'puppet' ? backdrop.background : null;
  backdrop.light(m === 'puppet' ? backdrop.name : 'overlay');
  $('btnScene').hidden = m !== 'puppet';
  if (m !== 'puppet') $('panel-scene').hidden = true;
  actor.position.set(0, 0, 0); actor.rotation.set(0, 0, 0);
}
function setFraming(f: Framing) {
  framing = f; store.set('vm-frame', f);
  document.querySelectorAll<HTMLButtonElement>('[data-frame]').forEach((b) => b.classList.toggle('on', b.dataset.frame === f));
  resize();
}
function setScene(s: SceneName) {
  backdrop.set(s); store.set('vm-scene', backdrop.name);
  renderScenePanel?.();
  if (mode === 'puppet') scene.background = backdrop.background;
}

// ---------------------------------------------------------------- sources
function useSource(el: FrameSource) {
  camLayer.innerHTML = ''; camLayer.appendChild(el);
  source = el; lastVideoTime = -1; tracker.reset();
}
function stopStream() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }

async function startCamera(deviceId?: string) {
  stopStream();
  const video = document.createElement('video');
  video.playsInline = true; video.muted = true; video.autoplay = true;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }) },
  });
  video.srcObject = stream;
  await video.play();
  useSource(video);
  const active = stream.getVideoTracks()[0]?.getSettings().deviceId;
  if (active) store.set('vm-cam', active);
  await listCameras(active);
}

async function listCameras(active?: string) {
  const sel = $<HTMLSelectElement>('camSelect');
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  sel.innerHTML = '';
  cams.forEach((c, i) => { const o = document.createElement('option'); o.value = c.deviceId; o.textContent = c.label || `Camera ${i + 1}`; o.selected = c.deviceId === active; sel.appendChild(o); });
  if (cams.length === 0) { const o = document.createElement('option'); o.textContent = 'No camera found'; sel.appendChild(o); }
}

async function useFile(url: string, isImage: boolean) {
  stopStream();
  if (isImage) {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    useSource(c);
  } else {
    const video = document.createElement('video');
    video.playsInline = true; video.muted = true; video.loop = true; video.src = url;
    await video.play();
    useSource(video);
  }
}

function begin() { started = true; $('start').hidden = true; }

// ---------------------------------------------------------------- interface
let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (t.hidden = true), 2600);
}
const panels = ['dress', 'scene', 'settings', 'fx'];
function togglePanel(name: string) {
  for (const p of panels) { const el = $('panel-' + p); el.hidden = p !== name ? true : !el.hidden; }
}
document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((b) => (b.onclick = () => togglePanel(b.dataset.panel!)));
$('btnSettings').onclick = () => togglePanel('settings');
glCanvas.addEventListener('pointerdown', () => panels.forEach((p) => ($('panel-' + p).hidden = true)));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode as Mode)));
document.querySelectorAll<HTMLButtonElement>('[data-frame]').forEach((b) => (b.onclick = () => setFraming(b.dataset.frame as Framing)));

buildDressPanel($('panel-dress'), look, (l) => character.setLook(l));
const renderScenePanel = buildScenePanel($('panel-scene'), () => backdrop.name, setScene);

$('btnPhoto').onclick = () => { capture.photo(); const f = $('flash'); f.classList.remove('go-flash'); void f.offsetWidth; f.classList.add('go-flash'); };
$('btnRecord').onclick = () => { capture.toggleRecord(); };
// Effects: the panel lists every effect and ticks off the ones you have found.
const FOUND_KEY = 'vm-found';
const found = new Set<EffectId>((() => { try { return JSON.parse(store.get(FOUND_KEY) || '[]'); } catch { return []; } })());
effects.enabled = store.get('vm-fx') !== '0';
$('btnFx').classList.toggle('on', effects.enabled);
const fxPanel = buildEffectsPanel($('panel-fx'), found, () => effects.enabled, (on) => {
  effects.enabled = on; store.set('vm-fx', on ? '1' : '0'); $('btnFx').classList.toggle('on', on);
});
effects.onTrigger = (id) => {
  fxPanel.flash(id);
  if (found.has(id)) return;
  found.add(id); store.set(FOUND_KEY, JSON.stringify([...found]));
  fxPanel.render();
  toast(`New effect found: ${EFFECTS.find((e) => e.id === id)?.name}!`);
};
$('btnFx').onclick = () => togglePanel('fx');
$<HTMLInputElement>('chkPip').checked = showPip;
$<HTMLInputElement>('chkPip').onchange = (e) => { showPip = (e.target as HTMLInputElement).checked; store.set('vm-pip', showPip ? '1' : '0'); };
$('btnFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => toast('Full screen is not available here')); };
$<HTMLSelectElement>('camSelect').onchange = (e) => { startCamera((e.target as HTMLSelectElement).value).catch(cameraError); };

const fileInput = $<HTMLInputElement>('fileInput');
const pickFile = () => fileInput.click();
$('btnFile').onclick = pickFile; $('btnStartFile').onclick = pickFile;
fileInput.onchange = async () => {
  const f = fileInput.files?.[0]; if (!f) return;
  try { await useFile(URL.createObjectURL(f), f.type.startsWith('image/')); begin(); }
  catch { toast('That file could not be opened'); }
  fileInput.value = '';
};

function cameraError(err: unknown) {
  const name = (err as DOMException)?.name;
  const msg = name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this page in your browser, then try again.'
    : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No camera was found. Connect one, or use a video or photo file.'
    : 'The camera could not start. Close other apps that use it, then try again.';
  if (started) toast(msg); else { $('startMsg').textContent = msg; $('startMsg').style.color = '#c0392b'; }
}
$('btnStart').onclick = async () => {
  const b = $<HTMLButtonElement>('btnStart'); b.disabled = true; b.textContent = 'Starting camera';
  try { await startCamera(store.get('vm-cam') || undefined); begin(); }
  catch (e1) {
    try { await startCamera(); begin(); } catch (e2) { cameraError(e2 ?? e1); }
  }
  b.disabled = false; b.textContent = 'Start camera';
};

// ---------------------------------------------------------------- loop
const idleFace: FaceState = { blinkL: 0, blinkR: 0, jawOpen: 0, smile: 0.35, pucker: 0, mouthShift: 0, browUpL: 0, browUpR: 0, browDownL: 0, browDownR: 0, gazeX: 0, gazeY: 0 };
let last = performance.now(), fps = 0, nextBlink = 2, statsAt = 0;
const clock = { t: 0 };

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; clock.t += dt;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const t = clock.t;

  // tracking
  if (source && tracker.ready) {
    if (source instanceof HTMLVideoElement) {
      srcW = source.videoWidth; srcH = source.videoHeight;
      if (source.readyState >= 2 && source.currentTime !== lastVideoTime) { lastVideoTime = source.currentTime; tracker.update(source, srcW, srcH); }
    } else { srcW = source.width; srcH = source.height; tracker.update(source, srcW, srcH); }
  }
  const s = tracker.state;

  // face: follow the person, or blink idly when no face is in view
  let face = s.face;
  if (!s.hasFace) {
    nextBlink -= dt;
    const blink = nextBlink < 0.12 ? 1 : 0;
    if (nextBlink < 0) nextBlink = 2 + Math.random() * 3;
    idleFace.blinkL = idleFace.blinkR = blink;
    face = idleFace;
  }

  // pose
  let visible = true;
  if (mode === 'puppet') {
    if (framing === 'face') rig.puppetFace(s, pose, dt, t); else rig.puppet(s, pose, dt, t);
    actor.position.y = backdrop.bobY; actor.rotation.z = backdrop.bobRoll;
    backdrop.shadow.position.x = pose.hipC.x;
    const lift = Math.max(0, Math.min(pose.ankleL.y, pose.ankleR.y) - 0.07);
    backdrop.shadow.scale.set(Math.max(0.3, 0.95 - lift), Math.max(0.2, 0.55 - lift * 0.6), 1);
    backdrop.shadow.position.y = 0.012 + backdrop.bobY;
  } else {
    visible = srcW > 0 && (framing === 'face' ? rig.overlayFace(s, pose, mapToStage, dt, t) : rig.overlay(s, pose, mapToStage, dt));
    if (framing !== 'full') pose.legsVisible = false;
  }
  // Face framing: the camera glides along with her head.
  if (mode === 'puppet' && framing === 'face') {
    camAim.lerp(new THREE.Vector3(pose.headC.x, pose.headC.y + backdrop.bobY - 0.08, 0), Math.min(1, dt * 6));
    persp.position.set(camAim.x, camAim.y + 0.03, faceDist); persp.lookAt(camAim);
  }
  character.group.visible = visible;
  if (visible) character.apply(pose, face, dt);
  effects.update(dt, visible ? pose : null, rig, {
    face: s.hasFace ? s.face : null, mode, upper: framing !== 'full', scene: backdrop.name, seaY: backdrop.seaY, seaFx: backdrop.seaFx, sand: backdrop.sand,
    camera: mode === 'puppet' ? persp : ortho, viewportH: stageH,
  });
  backdrop.update(t);

  renderer.render(scene, mode === 'puppet' ? persp : ortho);
  capture.afterRender();

  // small camera preview and hints
  const wantPip = started && mode === 'puppet' && showPip && !!source && srcW > 0;
  pip.hidden = !wantPip;
  if (wantPip && source) {
    const h = Math.round((pip.width * srcH) / srcW); if (pip.height !== h) pip.height = h;
    pipCtx.save(); pipCtx.translate(pip.width, 0); pipCtx.scale(-1, 1); pipCtx.drawImage(source, 0, 0, pip.width, pip.height); pipCtx.restore();
  }
  if (started) {
    const msg = !tracker.ready ? '' : framing === 'face' ? (!s.hasFace ? 'Hold the phone so I can see your face' : '')
      : framing === 'upper' ? (!s.hasPose ? 'Move into view so I can see your head and shoulders' : '')
      : !s.hasPose ? 'Step back so I can see you' : !rig.legsSeen ? 'Step back a bit more to show your legs' : '';
    if (hint.textContent !== msg) hint.textContent = msg;
    hint.hidden = msg === '';
  }
  document.body.classList.toggle('recording', capture.recording);
  $('rec').hidden = !capture.recording;
  if (capture.recording) {
    const sec = Math.floor((now - capture.startedAt) / 1000);
    $('recTime').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    $('recLabel').textContent = 'Stop';
  } else if ($('recLabel').textContent !== 'Record') $('recLabel').textContent = 'Record';
  if (now - statsAt > 500) { statsAt = now; $('stats').textContent = `${Math.round(fps)} frames per second, tracking ${tracker.costMs.toFixed(0)} ms, body ${s.hasPose ? 'found' : 'not found'}, face ${s.hasFace ? 'found' : 'not found'}`; }
}

// ---------------------------------------------------------------- start up
setScene((params.get('scene') as SceneName) || (store.get('vm-scene') as SceneName) || 'beach');
setMode(mode);
setFraming(framing);
if (params.get('ui') === '0') document.body.classList.add('clean');
requestAnimationFrame(frame);
(window as unknown as Record<string, unknown>).__vm = { tracker, rig, pose, character, backdrop, effects, capture, setMode, setScene, look };

tracker.init().then(async () => {
  const b = $<HTMLButtonElement>('btnStart'); b.disabled = false; b.textContent = 'Start camera';
  const src = params.get('src');
  if (src) { await useFile(src, /\.(png|jpe?g|webp)$/i.test(src)); begin(); }
}).catch((err) => {
  console.error(err);
  $('startMsg').textContent = 'The tracking models could not load. Run "npm install" in the app folder, then reload.';
  $('startMsg').style.color = '#c0392b';
});
