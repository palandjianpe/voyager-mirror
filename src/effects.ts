// Fun effects, each started by a move or a face the camera can see.
// Particles (sparkles, drops, hearts, bubbles, petals, confetti, sand) share one
// point cloud; bigger things (light trails, rainbow, seagull, fish, footprints,
// the "!" burst) are small meshes that are reused.
import * as THREE from 'three';
import { P, type Pose } from './character';
import type { Rig } from './rig';
import type { FaceState } from './tracker';
import type { SceneName } from './scenes';

export type EffectId = 'sparkle' | 'flick' | 'trails' | 'clap' | 'rainbow' | 'seagull' | 'twirl' | 'bubbles' | 'hearts'
  | 'surprise' | 'squat' | 'landing' | 'fish' | 'spray' | 'footprints';

/** What each effect is called and how to start it. Shown in the Effects panel. */
export const EFFECTS: { id: EffectId; name: string; how: string; note?: string }[] = [
  { id: 'sparkle', name: 'Sparkle shower', how: 'Raise both hands above your head.' },
  { id: 'flick', name: 'Water flick', how: 'Swipe a hand fast above your shoulders.' },
  { id: 'trails', name: 'Light trails', how: 'Swish your hands around quickly.' },
  { id: 'clap', name: 'Confetti clap', how: 'Clap your hands together.' },
  { id: 'rainbow', name: 'Rainbow', how: 'Sweep one hand over your head, from one side to the other.' },
  { id: 'seagull', name: 'Seagull friend', how: 'Wave hello for a few seconds.' },
  { id: 'twirl', name: 'Flower twirl', how: 'Turn around quickly.' },
  { id: 'bubbles', name: 'Bubbles', how: 'Pucker your lips like you are blowing bubbles.' },
  { id: 'hearts', name: 'Hearts', how: 'Give a great big smile.' },
  { id: 'surprise', name: 'Surprise!', how: 'Open your mouth wide and raise your eyebrows.' },
  { id: 'squat', name: 'Sand puff', how: 'Crouch down low.', note: 'Full body' },
  { id: 'landing', name: 'Splash landing', how: 'Jump!', note: 'Full body' },
  { id: 'fish', name: 'Leaping fish', how: 'Jump!', note: 'Puppet, full body' },
  { id: 'spray', name: 'Sea spray', how: 'Jump!', note: 'Puppet, full body' },
  { id: 'footprints', name: 'Footprints', how: 'Step from side to side.', note: 'Puppet, full body, on sand' },
];

export interface FxContext {
  face: FaceState | null;
  mode: 'puppet' | 'overlay';
  upper: boolean;
  scene: SceneName;
  seaY: number;
  /** The scene has a 3D sea for fish and spray. */
  seaFx: boolean;
  /** Footprint colour, or null where there is no sand. */
  sand: string | null;
  camera: THREE.Camera;
  viewportH: number;
}

const MAX = 1600;
const K = { sparkle: 0, water: 1, heart: 2, bubble: 3, petal: 4, confetti: 5, dust: 6 } as const;
const pal = (cs: string[]) => cs.map((c) => new THREE.Color(c));
const SPARKLE = pal(['#fff6a8', '#ffd24f', '#ff9ecb', '#9fe8ff', '#ffffff']);
const WATER = pal(['#bff3ff', '#7fdcf5', '#ffffff']);
const HEART = pal(['#ff4f7a', '#ff7aa2', '#ff3b5c', '#ff9bb8']);
const BUBBLE = pal(['#e6fbff', '#c9f1ff', '#f2e6ff']);
const PETAL = pal(['#ffffff', '#fff1c2', '#ffb3c7', '#ff7aa2', '#ffd36b']);
const CONFETTI = pal(['#ff5a5f', '#ffc93c', '#2ec4b6', '#4f7fe0', '#9a5fd6', '#7ac74f', '#ff8fab']);
const SAND = pal(['#e9cf95', '#dcc083', '#f3e0b0']);
const RAINBOW = ['#ff4b4b', '#ff9a3c', '#ffe14d', '#5fd35f', '#3fa8ff', '#5a5ee0', '#9a5fd6'];

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const rnd = (s: number) => (Math.random() - 0.5) * 2 * s;

interface HandState {
  prev: THREE.Vector3; dirX: number; extremeX: number; flips: number[];
  sweep: { x: number; t: number }[];
  trail: { p: THREE.Vector3; t: number }[];
}
const newHand = (): HandState => ({ prev: new THREE.Vector3(), dirX: 0, extremeX: 0, flips: [], sweep: [], trail: [] });

/** A glowing ribbon that follows a hand and fades behind it. */
class Ribbon {
  static readonly N = 40;
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(Ribbon.N * 2 * 3);
  private col = new Float32Array(Ribbon.N * 2 * 4);
  constructor() {
    const g = new THREE.BufferGeometry(), idx: number[] = [];
    for (let i = 0; i < Ribbon.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 11;
  }
  update(trail: { p: THREE.Vector3; t: number }[], now: number, life: number, width: number) {
    const n = Math.min(trail.length, Ribbon.N), c = new THREE.Color();
    for (let i = 0; i < Ribbon.N; i++) {
      const k = Math.min(i, n - 1);
      if (n < 2) { this.col.fill(0); break; }
      const pt = trail[trail.length - 1 - k].p, age = (now - trail[trail.length - 1 - k].t) / life;
      const a = trail[Math.max(0, trail.length - 2 - k)].p, b = trail[Math.min(trail.length - 1, trail.length - k)].p;
      tmp.set(-(b.y - a.y), b.x - a.x, 0);
      if (tmp.lengthSq() < 1e-10) tmp.set(0, 1, 0);
      tmp.normalize().multiplyScalar(width * Math.max(0, 1 - i / n) * 0.5);
      this.pos.set([pt.x + tmp.x, pt.y + tmp.y, pt.z, pt.x - tmp.x, pt.y - tmp.y, pt.z], i * 6);
      c.setHSL((now * 0.45 + i * 0.025) % 1, 0.95, 0.62);
      const al = i < n ? Math.max(0, 1 - age) * 0.9 : 0;
      this.col.set([c.r, c.g, c.b, al, c.r, c.g, c.b, al], i * 8);
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

function makeSeagull() {
  const g = new THREE.Group(), white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const grey = new THREE.MeshLambertMaterial({ color: '#c3ccd6', side: THREE.DoubleSide });
  const dark = new THREE.MeshLambertMaterial({ color: '#3b4350', side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), white); body.scale.set(2.6, 1, 1); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), white); head.position.set(0.2, 0.04, 0); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 8), new THREE.MeshLambertMaterial({ color: '#ffb02e' }));
  beak.rotation.z = -Math.PI / 2; beak.position.set(0.28, 0.035, 0); g.add(beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: '#1d2b3a' }));
    eye.position.set(0.235, 0.06, s * 0.04); g.add(eye);
  }
  // Wings span along their own +y; each pivot lifts its wing up and out into a V.
  const wings: { pivot: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const sh = new THREE.Shape(); sh.moveTo(-0.08, 0); sh.lineTo(0.1, 0); sh.lineTo(0.02, 0.5); sh.lineTo(-0.1, 0.46); sh.closePath();
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(sh), grey);
    const tipS = new THREE.Shape(); tipS.moveTo(0.04, 0.38); tipS.lineTo(0.02, 0.5); tipS.lineTo(-0.1, 0.46); tipS.lineTo(-0.07, 0.36); tipS.closePath();
    const tip = new THREE.Mesh(new THREE.ShapeGeometry(tipS), dark); tip.position.z = 0.001;
    pivot.add(wing, tip); g.add(pivot); wings.push({ pivot, side });
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), white); tail.rotation.z = Math.PI / 2; tail.scale.z = 0.3; tail.position.x = -0.24; g.add(tail);
  g.rotation.x = 0.3;
  return { g, wings };
}

function makeFish(color: string) {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), m); body.scale.set(2.2, 1, 0.5); g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.24, 4), m); tail.rotation.z = -Math.PI / 2; tail.scale.z = 0.25; tail.position.x = -0.5; g.add(tail);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 4), m); fin.scale.z = 0.2; fin.position.set(-0.02, 0.2, 0); fin.rotation.z = 0.5; g.add(fin);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshLambertMaterial({ color: '#fff4dc' }));
  belly.scale.set(2, 0.6, 0.45); belly.position.y = -0.07; g.add(belly);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#1d2b3a' })); eye.position.set(0.3, 0.05, 0.09); g.add(eye);
  return g;
}

function burstTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 78 : 118, a = (i / 24) * Math.PI * 2;
    g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
  }
  g.closePath(); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#ff7a2f'; g.stroke();
  g.fillStyle = '#1d2b3a'; g.font = '900 150px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  readonly group = new THREE.Group();
  readonly points: THREE.Points;
  enabled = true;
  /** Called whenever an effect starts. */
  onTrigger: ((id: EffectId) => void) | null = null;

  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private kind = new Float32Array(MAX);
  private rot = new Float32Array(MAX);
  private spin = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private base = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private next = 0;
  private mat: THREE.ShaderMaterial;
  private time = 0;
  private hasPrev = false;
  private hands = [newHand(), newHand()];
  private ribbons = [new Ribbon(), new Ribbon()];
  private cool: Partial<Record<EffectId, number>> = {};
  private apartAt = -9;
  private yaw = 0; private yawRate = 0;
  private smileFor = 0; private heartAt = 0; private bubbleAt = 0;
  private surprised = false; private squatting = false;
  private printsLast: THREE.Vector3[] = [];
  private prints: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number }[] = [];
  private nextPrint = 0;
  private rainbow = new THREE.Group(); private rainbowT = -1;
  private gull = makeSeagull(); private gullT = -1; private gullDir = 1;
  private fish = [makeFish('#ff8c42'), makeFish('#2ec4b6'), makeFish('#ffc93c')];
  private fishState = { t: -1, i: 0, x: 0, z: 0, dir: 1, sea: 0 };
  private burst: THREE.Sprite; private burstT = -1;
  /** Ribbon width in world units, set each frame from the body size. */
  private ribbonWidth = 0.07;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uH: { value: 800 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize, aAlpha, aKind, aRot; uniform float uH;
        varying vec3 vC; varying float vA, vK, vR;
        void main(){ vC = aColor; vA = aAlpha; vK = aKind; vR = aRot;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uH * 0.5 * projectionMatrix[1][1] / gl_Position.w; }`,
      fragmentShader: `
        varying vec3 vC; varying float vA, vK, vR;
        void main(){
          vec2 p = gl_PointCoord - 0.5; p.y = -p.y; float r = length(p); float a = 0.0; vec3 c = vC;
          float cr = cos(vR), sr = sin(vR); vec2 q = vec2(cr * p.x - sr * p.y, sr * p.x + cr * p.y);
          if (vK < 0.5) {                       // sparkle: four-point star with a soft core
            float star = smoothstep(0.02, 0.0, abs(p.x) * abs(p.y)) * smoothstep(0.5, 0.15, r);
            a = max(star, smoothstep(0.16, 0.04, r));
          } else if (vK < 1.5) {                // water drop
            a = smoothstep(0.5, 0.4, r);
            c = mix(c, vec3(1.0), smoothstep(0.2, 0.0, length(p - vec2(-0.12, 0.14))));
          } else if (vK < 2.5) {                // heart
            vec2 h = vec2(p.x * 2.5, p.y * 2.5 + 0.3);
            float f = pow(dot(h, h) - 1.0, 3.0) - h.x * h.x * h.y * h.y * h.y;
            a = smoothstep(0.03, -0.03, f);
            c = mix(c, vec3(1.0), 0.6 * smoothstep(0.12, 0.0, length(p - vec2(-0.14, 0.12))));
          } else if (vK < 3.5) {                // bubble: thin rim, faint fill, bright glint
            a = smoothstep(0.5, 0.46, r) * (0.18 + 0.75 * smoothstep(0.36, 0.47, r));
            float gl = smoothstep(0.1, 0.0, length(p - vec2(-0.16, 0.16)));
            a = max(a, gl); c = mix(c, vec3(1.0), gl);
          } else if (vK < 4.5) {                // petal
            vec2 e = vec2(q.x / 0.24, (q.y + 0.08) / 0.44);
            a = smoothstep(1.0, 0.85, length(e));
            c = mix(c, vec3(1.0, 0.85, 0.3), smoothstep(0.5, 0.0, length(e - vec2(0.0, -0.75))) * 0.8);
          } else if (vK < 5.5) {                // confetti: a spinning paper square
            a = step(abs(q.x), 0.34) * step(abs(q.y), 0.17);
          } else {                              // sand dust: soft puff
            a = 0.55 * exp(-r * r * 14.0);
          }
          if (a * vA < 0.02) discard;
          gl_FragColor = vec4(c, a * vA);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;

    RAINBOW.forEach((col, i) => {
      const r0 = 1 - i * 0.07;
      const band = new THREE.Mesh(new THREE.RingGeometry(r0 - 0.07, r0, 64, 1, 0, Math.PI),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      this.rainbow.add(band);
    });
    this.rainbow.visible = false;
    this.gull.g.visible = false;
    for (const f of this.fish) f.visible = false;
    this.burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTexture(), depthTest: false, transparent: true }));
    this.burst.visible = false; this.burst.renderOrder = 20;
    const printGeo = new THREE.CircleGeometry(0.05, 16), toeGeo = new THREE.CircleGeometry(0.013, 8);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#c9a868', transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(printGeo, mat); m.scale.set(0.62, 1.35, 1);
      for (let t = 0; t < 4; t++) {
        const toe = new THREE.Mesh(toeGeo, mat); toe.scale.set(1 / 0.62, 1 / 1.35, 1);
        toe.position.set(-0.03 + t * 0.02, 0.06 + (t === 0 ? 0.008 : 0), 0); m.add(toe);
      }
      m.rotation.x = -Math.PI / 2; m.visible = false;
      this.prints.push({ m, mat, t: -1 });
      this.group.add(m);
    }
    this.group.add(this.points, this.rainbow, this.gull.g, this.burst, ...this.fish, ...this.ribbons.map((r) => r.mesh));
  }

  private emit(kind: number, p: THREE.Vector3, vx: number, vy: number, vz: number, life: number, size: number, grav: number, set: THREE.Color[], drag = 0) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    set[(Math.random() * set.length) | 0].toArray(this.col, i * 3);
    this.kind[i] = kind; this.life[i] = this.maxLife[i] = life; this.base[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    this.rot[i] = Math.random() * Math.PI * 2; this.spin[i] = rnd(8);
  }

  /** Fires an effect at most once per `gap` seconds and reports it. */
  private fire(id: EffectId, gap: number) {
    if (this.time - (this.cool[id] ?? -99) < gap) return false;
    this.cool[id] = this.time;
    this.onTrigger?.(id);
    return true;
  }

  /** A point in the world at screen position (nx, ny in -1..1) on the plane z. */
  private onScreen(cam: THREE.Camera, nx: number, ny: number, z: number, out: THREE.Vector3) {
    out.set(nx, ny, 0.5).unproject(cam);
    if ((cam as THREE.OrthographicCamera).isOrthographicCamera) return out.setZ(z);
    const o = cam.position, t = (z - o.z) / (out.z - o.z || 1e-6);
    return out.sub(o).multiplyScalar(t).add(o);
  }

  update(dt: number, p: Pose | null, rig: Rig, ctx: FxContext) {
    this.time += dt;
    const now = this.time;
    this.mat.uniforms.uH.value = ctx.viewportH;
    const puppet = ctx.mode === 'puppet', full = !ctx.upper;
    if (!puppet) { this.fishState.t = -1; for (const f of this.fish) f.visible = false; }
    if (!puppet || !full) for (const pr of this.prints) { pr.t = -1; pr.m.visible = false; }

    if (p && this.enabled) this.detect(dt, p, rig, ctx, puppet, full);
    else { this.hasPrev = false; for (const h of this.hands) { h.trail.length = 0; h.flips.length = 0; h.sweep.length = 0; } }

    this.animate(dt, ctx);
  }

  // ------------------------------------------------------------- triggers
  private detect(dt: number, p: Pose, rig: Rig, ctx: FxContext, puppet: boolean, full: boolean) {
    const now = this.time, u = p.k;
    const w = Math.max(1e-3, p.shL.distanceTo(p.shR));           // shoulder width: the body's own ruler
    const Rh = P.headR * p.headScale;
    // Arms can only just reach the top of the head, so "above your head" is measured from
    // the hands and starts a little above eye level.
    const overHead = p.headC.y + 0.2 * Rh, sweepLine = p.headC.y;
    const handList = [p.handL, p.handR], shList = [p.shL, p.shR];
    this.ribbonWidth = 0.22 * w;

    // Sparkle shower: both hands above the head.
    if (p.handL.y > overHead && p.handR.y > overHead) {
      this.fire('sparkle', 2);
      for (const h of handList) for (let n = 0; n < 3; n++)
        this.emit(K.sparkle, h, rnd(0.7) * u, (0.5 + Math.random() * 1.1) * u, rnd(0.3) * u, 0.7 + Math.random() * 0.7, (0.1 + Math.random() * 0.12) * u, -0.9 * u, SPARKLE);
    }

    handList.forEach((h, k) => {
      const st = this.hands[k], sh = shList[k];
      if (!this.hasPrev || dt <= 0) { st.prev.copy(h); st.extremeX = h.x; return; }
      const vx = (h.x - st.prev.x) / dt, vy = (h.y - st.prev.y) / dt;
      const speed = Math.hypot(vx, vy) / w;

      // Water flick: a fast swipe above the shoulder.
      if (h.y > sh.y && speed > 7.5 && speed < 120) {
        this.fire('flick', 2);
        const n = Math.min(4, 1 + ((speed - 7.5) / 3 | 0));
        for (let i = 0; i < n; i++)
          this.emit(K.water, h, vx * 0.35 + rnd(0.5) * u, vy * 0.35 + (0.4 + Math.random() * 0.8) * u, rnd(0.3) * u, 0.5 + Math.random() * 0.5, (0.05 + Math.random() * 0.06) * u, -4.2 * u, WATER);
      }

      // Light trails: the hand leaves a ribbon while it moves quickly.
      if (speed > 4 && speed < 120) {
        st.trail.push({ p: h.clone(), t: now });
        if (st.trail.length > Ribbon.N) st.trail.shift();
        if (st.trail.length > 8) this.fire('trails', 3);
      }

      // Wave hello: the hand swings left and right above the shoulder a few times.
      if (h.y > sh.y - 0.1 * w) {
        const dir = Math.abs(vx) > 0.8 * w ? Math.sign(vx) : 0;
        if (dir !== 0 && dir !== st.dirX) {
          if (Math.abs(h.x - st.extremeX) > 0.28 * w) st.flips.push(now);
          st.extremeX = h.x; st.dirX = dir;
        }
        while (st.flips.length && now - st.flips[0] > 2.5) st.flips.shift();
        if (st.flips.length >= 4 && this.gullT < 0 && this.fire('seagull', 6)) {
          this.gullT = 0; this.gullDir = Math.random() < 0.5 ? 1 : -1; st.flips.length = 0;
        }
      } else { st.flips.length = 0; st.dirX = 0; }

      // Rainbow: one hand sweeps over the head from one side to the other.
      // Only the last 1.5 seconds count, so raising the hand first and then sweeping works too.
      if (h.y > sweepLine) {
        st.sweep.push({ x: h.x, t: now });
        while (st.sweep.length && now - st.sweep[0].t > 1.5) st.sweep.shift();
        let lo = Infinity, hi = -Infinity;
        for (const e of st.sweep) { lo = Math.min(lo, e.x); hi = Math.max(hi, e.x); }
        if (hi - lo > 1.0 * w && lo < p.headC.x && hi > p.headC.x && this.fire('rainbow', 5)) {
          this.rainbowT = 0;
          this.rainbow.position.set(p.shC.x, p.shC.y - 0.4 * w, p.shC.z + (ctx.mode === 'puppet' ? -0.45 : -2));
          this.rainbow.userData.r = 3.4 * w;
          st.sweep.length = 0;
        }
      } else if (h.y < sweepLine - 0.3 * Rh) st.sweep.length = 0;
      st.prev.copy(h);
    });

    // Confetti clap: hands come together quickly after being apart.
    const gap = p.handL.distanceTo(p.handR);
    if (gap > 1.0 * w) this.apartAt = now;
    if (gap < 0.45 * w && now - this.apartAt < 0.7 && this.fire('clap', 0.4)) {
      const c = tmp2.addVectors(p.handL, p.handR).multiplyScalar(0.5);
      for (let n = 0; n < 50; n++) {
        const a = Math.random() * Math.PI * 2, s = (1.2 + Math.random() * 2.2) * w;
        this.emit(K.confetti, c, Math.cos(a) * s, Math.abs(Math.sin(a)) * s * 1.2 + 0.6 * w, rnd(0.6) * w, 1.4 + Math.random() * 0.6, (0.06 + Math.random() * 0.04) * w / 0.34, -2.2 * w, CONFETTI, 1.6);
      }
      this.apartAt = -9;
    }

    // Flower twirl: the shoulders turn quickly.
    const yaw = Math.atan2(p.shL.z - p.shR.z, p.shL.x - p.shR.x);
    if (this.hasPrev && dt > 0) {
      let dy = yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yawRate += (dy / dt - this.yawRate) * Math.min(1, dt * 8);
    }
    this.yaw = yaw;
    if (Math.abs(this.yawRate) > 3 && this.hasPrev) {
      this.fire('twirl', 2);
      const mid = tmp2.addVectors(p.hipC, p.shC).multiplyScalar(0.5), sgn = Math.sign(this.yawRate);
      for (let n = 0; n < 3; n++) {
        const a = Math.random() * Math.PI * 2, r = 1.3 * w, y = (Math.random() - 0.3) * 2.2 * w;
        tmp.set(mid.x + Math.cos(a) * r, mid.y + y, mid.z + Math.sin(a) * r * 0.6);
        this.emit(K.petal, tmp, -Math.sin(a) * 2.2 * w * sgn, (0.4 + Math.random() * 0.6) * w, Math.cos(a) * 1.3 * w * sgn,
          1.6 + Math.random() * 0.8, (0.08 + Math.random() * 0.05) * w / 0.34, -0.5 * w, PETAL, 1.2);
      }
    }

    // Face effects need the face to be tracked.
    const f = ctx.face;
    if (f) {
      const q = this.headPoint(p, 0, -0.56, 1.05, Rh);
      const fwd = tmp.set(0, 0, 1).applyQuaternion(p.headQuat);
      // Bubbles: puckered lips.
      if (f.pucker > 0.45 && f.jawOpen < 0.4 && now - this.bubbleAt > 0.11) {
        this.bubbleAt = now; this.fire('bubbles', 3);
        const sc = Rh / 0.235, side = rnd(0.35);
        this.emit(K.bubble, q, (fwd.x * 0.55 + side) * sc, (0.06 + Math.random() * 0.12) * sc, (fwd.z * 0.55 + Math.abs(side) * 0.3) * sc,
          2.4 + Math.random(), (0.45 + Math.random() * 0.4) * Rh, 0.06 * sc, BUBBLE, 0.7);
      }
      // Hearts: a big smile held for a moment.
      this.smileFor = f.smile > 0.7 ? this.smileFor + dt : 0;
      if (this.smileFor > 0.35 && now - this.heartAt > 0.26) {
        this.heartAt = now; this.fire('hearts', 4);
        const a = Math.random() * Math.PI - Math.PI / 2;
        const hp = this.headPoint(p, Math.sin(a) * 1.5, 0.6 + Math.cos(a) * 0.7, 0.3, Rh);
        this.emit(K.heart, hp, rnd(0.15) * Rh / 0.235, (0.35 + Math.random() * 0.3) * Rh / 0.235, 0, 1.6, (0.5 + Math.random() * 0.35) * Rh, 0.05, HEART, 0.5);
      }
      // Surprise: wide-open mouth and raised eyebrows.
      const brows = (f.browUpL + f.browUpR) / 2;
      if (!this.surprised && f.jawOpen > 0.45 && brows > 0.35) {
        this.surprised = true;
        if (this.fire('surprise', 1.2)) {
          this.burstT = 0;
          this.burst.position.copy(this.headPoint(p, 1.1, 1.5, 0.2, Rh));
          this.burst.userData.size = 1.5 * Rh;
          const c = this.burst.position;
          for (let n = 0; n < 24; n++) {
            const a = (n / 24) * Math.PI * 2, s = 1.6 * Rh / 0.235;
            this.emit(K.sparkle, c, Math.cos(a) * s, Math.sin(a) * s, 0, 0.6, 0.45 * Rh, 0, SPARKLE, 2.5);
          }
        }
      } else if (this.surprised && f.jawOpen < 0.2) this.surprised = false;
    }

    // Full-body moves.
    if (full && p.legsVisible) {
      // Sand puff: both knees bent deeply.
      const bend = (hip: THREE.Vector3, kn: THREE.Vector3, an: THREE.Vector3) => {
        tmp.subVectors(hip, kn).normalize(); tmp2.subVectors(an, kn).normalize(); return tmp.dot(tmp2);
      };
      const bL = bend(p.hipL, p.kneeL, p.ankleL), bR = bend(p.hipR, p.kneeR, p.ankleR);
      if (!this.squatting && bL > -0.45 && bR > -0.45) {
        this.squatting = true;
        if (this.fire('squat', 0.8)) for (const an of [p.ankleL, p.ankleR]) for (let n = 0; n < 22; n++) {
          const a = Math.random() * Math.PI * 2, s = (0.8 + Math.random() * 1.4) * w;
          this.emit(K.dust, an, Math.cos(a) * s, (0.15 + Math.random() * 0.5) * w, Math.sin(a) * s * 0.6, 0.9 + Math.random() * 0.5, (0.18 + Math.random() * 0.15) * w / 0.34, -0.6 * w, SAND, 2.2);
        }
      } else if (this.squatting && bL < -0.75 && bR < -0.75) this.squatting = false;

      // Splash landing.
      if (rig.landed && this.fire('landing', 0.5)) {
        const c = tmp2.addVectors(p.ankleL, p.ankleR).multiplyScalar(0.5);
        for (let n = 0; n < 46; n++) {
          const a = Math.random() * Math.PI * 2, s = (0.6 + Math.random() * 1.3) * u;
          this.emit(K.water, c, Math.cos(a) * s, (1.2 + Math.random() * 1.6) * u, Math.sin(a) * s * 0.5, 0.6 + Math.random() * 0.5, (0.06 + Math.random() * 0.07) * u, -5 * u, WATER);
        }
      }

      if (puppet) {
        // Jumping in puppet mode also makes the sea spray and a fish leap.
        if (rig.landed) {
          if (ctx.seaFx && this.fire('spray', 0.5)) this.seaSpray(ctx);
          if (ctx.seaFx && this.fishState.t < 0 && this.fire('fish', 1)) {
            const fs = this.fishState;
            fs.t = 0; fs.i = (fs.i + 1) % this.fish.length; fs.dir = Math.random() < 0.5 ? 1 : -1;
            fs.x = rnd(2.6) - fs.dir * 0.9; fs.z = -7 - Math.random() * 3; fs.sea = ctx.seaY;
            this.splashAt(fs.x, fs.sea, fs.z, 14);
          }
        }
        // Footprints on sand.
        const sand = ctx.sand;
        if (sand) {
          [p.ankleL, p.ankleR].forEach((an, i) => {
            if (!this.printsLast[i]) { this.printsLast[i] = an.clone(); return; }
            if (an.y < P.ankleH + 0.025 && Math.abs(an.x - this.printsLast[i].x) > 0.18) {
              this.printsLast[i].copy(an);
              const pr = this.prints[this.nextPrint]; this.nextPrint = (this.nextPrint + 1) % this.prints.length;
              pr.t = 0; pr.m.visible = true; pr.m.position.set(an.x + (i ? -0.01 : 0.01), 0.004, an.z + 0.06);
              pr.m.scale.x = (i ? -0.62 : 0.62);
              pr.mat.color.set(sand);
              this.fire('footprints', 3);
            }
          });
        }
      }
    }
    this.hasPrev = true;
  }

  /** A point on or around the head, in head radii, turned with the head. */
  private headPoint(p: Pose, x: number, y: number, z: number, Rh: number) {
    return new THREE.Vector3(x, y, z).multiplyScalar(Rh).applyQuaternion(p.headQuat).add(p.headC);
  }

  private splashAt(x: number, y: number, z: number, n: number) {
    const c = tmp.set(x, y, z);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 0.8;
      this.emit(K.water, c, Math.cos(a) * s, 1.5 + Math.random() * 1.5, Math.sin(a) * s * 0.5, 0.8 + Math.random() * 0.4, 0.14 + Math.random() * 0.1, -5, WATER);
    }
  }

  private seaSpray(ctx: FxContext) {
    for (let i = 0; i < 70; i++) {
      if (ctx.scene === 'ocean') {
        const side = Math.random() < 0.5 ? -1 : 1;
        tmp.set(side * (1.05 + Math.random() * 0.2), ctx.seaY + 0.05, -1 + Math.random() * 1.8);
        this.emit(K.water, tmp, side * (0.3 + Math.random() * 0.6), 1.4 + Math.random() * 1.6, rnd(0.3), 0.9 + Math.random() * 0.4, 0.07 + Math.random() * 0.07, -5, WATER);
      } else {
        tmp.set(rnd(4), ctx.seaY + 0.05, -2.5 - Math.random() * 0.6);
        this.emit(K.water, tmp, rnd(0.3), 1.6 + Math.random() * 1.8, 0.3 + Math.random() * 0.4, 1 + Math.random() * 0.4, 0.08 + Math.random() * 0.08, -5, WATER);
      }
    }
  }

  // ------------------------------------------------------------- animation
  private animate(dt: number, ctx: FxContext) {
    const now = this.time, cam = ctx.camera;

    // particles
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] *= dr; this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      const k = this.kind[i];
      if (k === K.bubble || k === K.petal || k === K.confetti) this.vel[i * 3] += Math.sin(now * 5 + i) * 0.4 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt * (k === K.confetti ? 1 : k === K.petal ? 0.4 : 0);
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 2.5);
      const b = this.base[i];
      this.size[i] = k === K.sparkle ? b * (0.5 + 0.5 * Math.abs(Math.sin(t * 14 + i)))
        : k === K.water ? b * (0.6 + 0.4 * t)
        : k === K.heart ? b * Math.min(1, (1 - t) * 8)
        : k === K.bubble ? b * Math.min(1, (1 - t) * 10)
        : k === K.dust ? b * (1.8 - 0.8 * t)
        : b;
    }
    const g = this.points.geometry;
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha', 'aKind', 'aRot']) (g.attributes[n] as THREE.BufferAttribute).needsUpdate = true;

    // light trails
    this.hands.forEach((st, k) => {
      while (st.trail.length && now - st.trail[0].t > 0.45) st.trail.shift();
      this.ribbons[k].update(st.trail, now, 0.45, this.ribbonWidth);
    });

    // rainbow: grows in, holds, fades
    if (this.rainbowT >= 0) {
      this.rainbowT += dt;
      const T = this.rainbowT, op = Math.min(1, T / 0.5) * Math.min(1, Math.max(0, (4 - T) / 1.2)) * 0.6;
      this.rainbow.visible = op > 0;
      this.rainbow.scale.setScalar(this.rainbow.userData.r * (0.75 + 0.25 * Math.min(1, T / 0.6)));
      for (const band of this.rainbow.children) ((band as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = op;
      if (T > 4) { this.rainbowT = -1; this.rainbow.visible = false; }
    }

    // seagull glides across the top of the picture
    if (this.gullT >= 0) {
      this.gullT += dt;
      const T = this.gullT / 5, z = ctx.mode === 'puppet' ? -1.8 : -1;
      const gull = this.gull.g;
      gull.visible = T < 1;
      this.onScreen(cam, this.gullDir * (-1.25 + 2.5 * T), 0.68 + Math.sin(T * 7) * 0.04, z, gull.position);
      const h = this.onScreen(cam, 0, 0, z, tmp).distanceTo(this.onScreen(cam, 0, 0.1, z, tmp2));
      gull.scale.set(this.gullDir * h * 2.6, h * 2.6, h * 2.6);
      const lift = 0.55 + 0.5 * Math.sin(this.gullT * 9);   // wing angle above level
      for (const { pivot, side } of this.gull.wings) pivot.rotation.x = -side * (Math.PI / 2 - lift);
      if (T >= 1) this.gullT = -1;
    }

    // fish leaps out of the sea and back in
    const fs = this.fishState;
    this.fish.forEach((f, i) => (f.visible = fs.t >= 0 && i === fs.i));
    if (fs.t >= 0) {
      fs.t += dt;
      const D = 1.3, T = fs.t / D, f = this.fish[fs.i];
      f.position.set(fs.x + fs.dir * 1.8 * T, fs.sea + 1.5 * Math.sin(Math.PI * Math.min(T, 1)) - 0.1, fs.z);
      f.rotation.set(0, fs.dir > 0 ? 0 : Math.PI, Math.cos(Math.PI * T) * 0.9);
      f.scale.setScalar(0.5);
      if (T >= 1) { this.splashAt(f.position.x, fs.sea, fs.z, 16); fs.t = -1; }
    }

    // "!" burst pops up, holds and fades
    if (this.burstT >= 0) {
      this.burstT += dt;
      const T = this.burstT, pop = T < 0.18 ? (T / 0.18) * 1.2 : T < 0.3 ? 1.2 - ((T - 0.18) / 0.12) * 0.2 : 1;
      const s = (this.burst.userData.size as number) * pop;
      this.burst.visible = true; this.burst.scale.set(s, s, 1);
      (this.burst.material as THREE.SpriteMaterial).opacity = Math.min(1, Math.max(0, (1.4 - T) / 0.3));
      if (T > 1.4) { this.burstT = -1; this.burst.visible = false; }
    }

    // footprints fade away slowly
    for (const pr of this.prints) {
      if (pr.t < 0) continue;
      pr.t += dt;
      pr.mat.opacity = 0.55 * Math.min(1, Math.max(0, (8 - pr.t) / 3));
      if (pr.t > 8) { pr.t = -1; pr.m.visible = false; }
    }
  }
}
