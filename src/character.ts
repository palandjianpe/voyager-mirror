// The character: an original cartoon island voyager, built entirely from code.
// She is drawn from a set of joint positions, so the same figure works as a
// free-standing puppet and as a costume stretched over a real person.
import * as THREE from 'three';
import type { FaceState } from './tracker';

export type HairStyle = 'waves' | 'cards' | 'puffs' | 'long' | 'ponytail' | 'braids' | 'bob';
export type Outfit = 'voyager' | 'dress' | 'shorts';
export type Accessory = 'none' | 'flower' | 'starfish' | 'bow';
export type Prop = 'oar' | 'none';

export interface Look {
  skin: string; hairStyle: HairStyle; hairColor: string; eyeColor: string;
  outfit: Outfit; topColor: string; bottomColor: string;
  accessory: Accessory; accentColor: string; prop: Prop;
}

export const DEFAULT_LOOK: Look = {
  skin: '#b47650', hairStyle: 'waves', hairColor: '#21150f', eyeColor: '#4a2c1a',
  outfit: 'voyager', topColor: '#ff7a59', bottomColor: '#f1e2c2',
  accessory: 'flower', accentColor: '#f2b134', prop: 'oar',
};

export const PALETTE = {
  skin: ['#f6d3b8', '#e8b48c', '#c98a5e', '#b47650', '#a0673f', '#6f4428'],
  hair: ['#21150f', '#5b3520', '#a8572a', '#e0b060', '#d94f70', '#3f7fd9', '#7a4fd0'],
  eyes: ['#4a2c1a', '#2f7d4f', '#2f6fb5', '#7a5cc0'],
  cloth: ['#ff7a59', '#f2b134', '#f1e2c2', '#d4513a', '#1fa8a0', '#f2c14e', '#e0456b', '#4f7fe0', '#7ac74f', '#9a5fd6'],
};

/** Body proportions in scene units for puppet mode. */
export const P = {
  headR: 0.235, torso: 0.46, neck: 0.07, shoulderHalf: 0.17, hipHalf: 0.1,
  upperArm: 0.27, foreArm: 0.25, hand: 0.09,
  upperLeg: 0.36, lowerLeg: 0.34, foot: 0.17, ankleH: 0.06,
};

/** Joint positions for one frame. "L" and "R" are the character's own left and right. */
export interface Pose {
  hipC: THREE.Vector3; hipL: THREE.Vector3; hipR: THREE.Vector3;
  shC: THREE.Vector3; shL: THREE.Vector3; shR: THREE.Vector3;
  elbowL: THREE.Vector3; elbowR: THREE.Vector3; wristL: THREE.Vector3; wristR: THREE.Vector3;
  handL: THREE.Vector3; handR: THREE.Vector3;
  kneeL: THREE.Vector3; kneeR: THREE.Vector3; ankleL: THREE.Vector3; ankleR: THREE.Vector3;
  toeL: THREE.Vector3; toeR: THREE.Vector3;
  headC: THREE.Vector3; headQuat: THREE.Quaternion;
  /** Thickness scale for limbs and clothes. 1 in puppet mode. */
  k: number;
  /** Head size relative to P.headR. 1 in puppet mode. */
  headScale: number;
  legsVisible: boolean;
}

export function makePose(): Pose {
  const v = () => new THREE.Vector3();
  return {
    hipC: v(), hipL: v(), hipR: v(), shC: v(), shL: v(), shR: v(),
    elbowL: v(), elbowR: v(), wristL: v(), wristR: v(), handL: v(), handR: v(),
    kneeL: v(), kneeR: v(), ankleL: v(), ankleR: v(), toeL: v(), toeR: v(),
    headC: v(), headQuat: new THREE.Quaternion(), k: 1, headScale: 1, legsVisible: true,
  };
}

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3();
const tM = new THREE.Matrix4();

let gradientMap: THREE.DataTexture | null = null;
function toon(color: string | number, opts: Partial<THREE.MeshToonMaterialParameters> = {}) {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([150, 205, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap, ...opts });
}
const shade = (hex: string, f: number) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// ------------------------------------------------------------------ cloth patterns
// Painted once per look on a canvas. Transparent pixels are cut out (alphaTest),
// which gives the zigzag hems, the lattice holes and the grass fringe.
function canvasTex(w: number, h: number, repeatX: number, flipY: boolean, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = repeatX;
  t.flipY = flipY; t.anisotropy = 4;
  return t;
}
const cut = (g: CanvasRenderingContext2D, fn: () => void) => {
  g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); fn(); g.fill(); g.restore();
};

/** Crop top: banded tapa pattern with a shell trim. Canvas top is the neckline. */
function topTexture(base: string) {
  return canvasTex(512, 256, 3, true, (g) => {
    const dark = shade(base, 0.58), light = mix(base, '#fff2e0', 0.35);
    g.fillStyle = base; g.fillRect(0, 0, 512, 256);
    // shell trim
    g.fillStyle = shade(base, 0.8); g.fillRect(0, 34, 512, 4);
    for (let x = 0; x < 512; x += 21.33) {
      g.fillStyle = '#fff8ec'; g.beginPath(); g.ellipse(x + 10.7, 19, 9, 7.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d9c7a8'; g.fillRect(x + 10, 15, 1.5, 8);
    }
    g.fillStyle = dark;
    for (let x = 0; x < 512; x += 16) g.fillRect(x + 6, 46, 4, 11);
    // dark band with rolling waves
    g.fillRect(0, 68, 512, 98);
    g.strokeStyle = base; g.lineWidth = 9; g.lineCap = 'round';
    for (const y of [96, 136]) {
      g.beginPath();
      for (let x = -32; x <= 544; x += 64) g.arc(x + 32, y, 22, Math.PI, 0, y > 100);
      g.stroke();
    }
    g.fillStyle = light; g.fillRect(0, 160, 512, 3); g.fillRect(0, 70, 512, 3);
    // little sun marks
    g.strokeStyle = dark; g.lineWidth = 3;
    for (let x = 32; x < 512; x += 64) {
      for (let a = 0; a < 8; a++) {
        const c = Math.cos((a * Math.PI) / 4), s = Math.sin((a * Math.PI) / 4);
        g.beginPath(); g.moveTo(x + c * 4, 205 + s * 4); g.lineTo(x + c * 11, 205 + s * 11); g.stroke();
      }
    }
    // zigzag bottom edge
    cut(g, () => { for (let x = 0; x < 512; x += 21.33) { g.moveTo(x, 257); g.lineTo(x + 10.7, 238); g.lineTo(x + 21.33, 257); } });
  });
}

/** Wrap skirt: cream tapa with sun flowers, lattice cut-outs and a pointed hem. Canvas top is the waist. */
function skirtTexture(base: string, motif: string) {
  return canvasTex(512, 512, 3, false, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = motif; g.fillStyle = motif; g.lineWidth = 3;
    const dashes = (y: number) => { g.setLineDash([9, 7]); g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); g.setLineDash([]); };
    dashes(92); dashes(150);
    for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x + 6, 140); g.lineTo(x + 16, 104); g.lineTo(x + 26, 140); g.closePath(); g.stroke(); }
    // pairs of leaves on a stem
    for (let x = 85; x < 512; x += 171) {
      const y = 245;
      g.globalAlpha = 0.85; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x, y + 52); g.lineTo(x, y - 52); g.stroke();
      for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) {
        g.save(); g.translate(x, y + i * 30); g.rotate(s * 0.9);
        g.beginPath(); g.ellipse(0, -20, 10, 22, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
    }
    // zigzag stitched line
    g.setLineDash([6, 5]); g.beginPath();
    for (let x = 0; x <= 512; x += 32) { g.lineTo(x, 345); g.lineTo(x + 16, 325); }
    g.stroke(); g.setLineDash([]);
    // lattice holes, then a pointed hem
    cut(g, () => {
      for (let row = 0; row < 2; row++) for (let x = (row % 2) * 16; x < 528; x += 32) {
        const cx = x, cy = 392 + row * 30;
        g.moveTo(cx, cy - 11); g.lineTo(cx + 10, cy); g.lineTo(cx, cy + 11); g.lineTo(cx - 10, cy); g.closePath();
      }
      for (let x = 0; x < 512; x += 64) { g.moveTo(x, 513); g.lineTo(x, 455); g.lineTo(x + 32, 510); g.lineTo(x + 64, 455); g.lineTo(x + 64, 513); g.closePath(); }
    });
  });
}

/** Abalone shell: blue-green with wavy pearly growth lines. */
function abaloneTexture() {
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return canvasTex(128, 128, 1, true, (g) => {
    const gr = g.createLinearGradient(0, 0, 128, 128);
    gr.addColorStop(0, '#2fb8a8'); gr.addColorStop(0.5, '#2a86c9'); gr.addColorStop(1, '#3fc99a');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = ['#7ef0d8', '#1d5f9e', '#b5f5ff', '#1f7f6e'][i % 4]; g.globalAlpha = 0.35 + rnd() * 0.4; g.lineWidth = 1 + rnd() * 2.5;
      g.beginPath();
      const y0 = rnd() * 128, amp = 4 + rnd() * 10, f = 0.04 + rnd() * 0.08, ph = rnd() * 6;
      for (let x = -4; x <= 132; x += 4) g.lineTo(x, y0 + Math.sin(x * f + ph) * amp + x * (rnd() - 0.5) * 0.1);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

/**
 * Oar blade face: light pine with vertical grain, painted with three stacked
 * ocean-blue waves across the wide part. Canvas top is the blade tip.
 */
function oarBladeTexture() {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return canvasTex(256, 512, 1, true, (g) => {
    g.fillStyle = '#ddb07a'; g.fillRect(0, 0, 256, 512);
    // Grain: long wavering streaks, a few darker, a few lighter.
    for (let i = 0; i < 70; i++) {
      const dark = rnd() < 0.55;
      g.strokeStyle = dark ? '#b98650' : '#f0cf9c'; g.globalAlpha = 0.25 + rnd() * 0.35; g.lineWidth = 0.8 + rnd() * 2.6;
      const x0 = rnd() * 256, amp = 1 + rnd() * 3, f = 0.006 + rnd() * 0.01, ph = rnd() * 6;
      g.beginPath();
      for (let y = -4; y <= 516; y += 8) g.lineTo(x0 + Math.sin(y * f + ph) * amp, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    // Three hand-painted waves, slightly uneven like a brush stroke.
    g.lineCap = 'round'; g.lineJoin = 'round';
    const rows = [150, 205, 260];
    rows.forEach((y0, r) => {
      g.strokeStyle = '#1c4f7c'; g.lineWidth = 15 - r;
      g.beginPath();
      for (let x = 34; x <= 222; x += 3) {
        const t = (x - 34) / 188;
        g.lineTo(x, y0 + Math.sin(t * Math.PI * 3 + r * 0.6) * 17 * (1 - 0.1 * r));
      }
      g.stroke();
    });
    // A thin lighter highlight along each wave for a painted, slightly worn look.
    g.globalAlpha = 0.35; g.strokeStyle = '#3d7fb0'; g.lineWidth = 3;
    rows.forEach((y0, r) => {
      g.beginPath();
      for (let x = 38; x <= 218; x += 3) {
        const t = (x - 34) / 188;
        g.lineTo(x, y0 - 3 + Math.sin(t * Math.PI * 3 + r * 0.6) * 17 * (1 - 0.1 * r));
      }
      g.stroke();
    });
    g.globalAlpha = 1;
  });
}

/** Grass underskirt: straw strands with a ragged fringe. Canvas top is the waist. */
function grassTexture() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return canvasTex(256, 256, 4, false, (g) => {
    g.fillStyle = '#e4c58e'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) {
      g.strokeStyle = rnd() < 0.5 ? '#c9a466' : '#f2dcaa'; g.lineWidth = 1 + rnd() * 2;
      const x = rnd() * 256; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 6, 256); g.stroke();
    }
    cut(g, () => {
      for (let x = 0; x < 256; x += 6) { const d = 200 + rnd() * 50; g.moveTo(x, 257); g.lineTo(x + 3, d); g.lineTo(x + 6, 257); }
    });
  });
}

// Body silhouettes for the torso, as (radius, height) pairs from the hips up.
const FIGURE = [[0.001, -0.03], [0.13, -0.02], [0.152, 0.03], [0.14, 0.12], [0.127, 0.2], [0.14, 0.29], [0.166, 0.37],
  [0.176, 0.43], [0.18, 0.475], [0.15, 0.52], [0.08, 0.548], [0.001, 0.555]];
const TUNIC = [[0.001, -0.03], [0.13, -0.02], [0.152, 0.03], [0.156, 0.14], [0.172, 0.3], [0.2, 0.43],
  [0.195, 0.49], [0.14, 0.535], [0.07, 0.555], [0.001, 0.56]];
const vec2s = (pts: number[][]) => pts.map(([r, y]) => new THREE.Vector2(r, y));
/** Part of a silhouette between two heights, puffed out a little, for clothes worn on top of it. */
function slice(pts: number[][], y0: number, y1: number, n: number, puff: number) {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    let j = 1; while (j < pts.length - 1 && pts[j][1] < y) j++;
    const [r0, a] = pts[j - 1], [r1, b] = pts[j];
    out.push(new THREE.Vector2((r0 + (r1 - r0) * ((y - a) / (b - a || 1))) * puff, y));
  }
  return out;
}

/** Stretch a unit cylinder between two points. Its top radius sits at `a`. */
function placeSeg(m: THREE.Object3D | undefined, a: THREE.Vector3, b: THREE.Vector3, k: number) {
  if (!m) return;
  tA.subVectors(a, b);
  const len = Math.max(tA.length(), 1e-4);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y, tA.divideScalar(len));
  m.scale.set(k, len, k);
}

/** Quaternion from a rough x axis and a y axis. */
function frame(out: THREE.Quaternion, xRough: THREE.Vector3, yAxis: THREE.Vector3) {
  const y = tB.copy(yAxis).normalize();
  const z = tC.crossVectors(xRough, y);
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1);
  z.normalize();
  const x = tD.crossVectors(y, z).normalize();
  tM.makeBasis(x, y, z);
  return out.setFromRotationMatrix(tM);
}

interface Chain {
  anchor: THREE.Vector3;           // head-local anchor
  pts: THREE.Vector3[]; prev: THREE.Vector3[];
  meshes: THREE.Mesh[]; radii: number[]; spacing: number; stiffness: number;
  init: boolean;
}

/** Fine light and dark streaks that run along the hair. */
function strandTexture() {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const t = canvasTex(256, 64, 3, true, (g) => {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 260; i++) {
      const v = rnd() < 0.55 ? 60 + rnd() * 90 : 200 + rnd() * 55;
      g.strokeStyle = `rgba(${v},${v},${v},${0.35 + rnd() * 0.5})`; g.lineWidth = 0.6 + rnd() * 1.6;
      const x = rnd() * 256; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke();
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * Bolder strands for the hair that covers the head (cap, crown, swoops). These pieces wrap
 * all the way around, so fine lines would blur into flat colour; wide, gently wavy
 * bands stay visible.
 */
function scalpTexture() {
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const t = canvasTex(512, 128, 2, true, (g) => {
    g.fillStyle = '#ababab'; g.fillRect(0, 0, 512, 128);
    const strand = (x0: number, wdt: number, v: number, a: number) => {
      g.strokeStyle = `rgba(${v},${v},${v},${a})`; g.lineWidth = wdt; g.beginPath();
      const ph = rnd() * 6;
      for (let y = -4; y <= 132; y += 8) g.lineTo(x0 + Math.sin(y * 0.05 + ph) * 3, y);
      g.stroke();
    };
    for (let i = 0; i < 80; i++) strand(rnd() * 512, 3 + rnd() * 7, rnd() < 0.5 ? 35 + rnd() * 45 : 220 + rnd() * 35, 0.55 + rnd() * 0.35);
    for (let i = 0; i < 140; i++) strand(rnd() * 512, 1 + rnd() * 1.5, rnd() < 0.5 ? 50 : 245, 0.5);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * Wavy hair drawn as tapered tubes. A few simulated guide strands do the
 * physics; many clumps are blended between neighbouring guides, then given
 * their own wave, depth and thickness so the hair looks full rather than combed.
 */
class HairClumps {
  readonly mesh: THREE.Mesh;
  /** Optional hair cards: a curved, see-through strip of strands over the outside of each lock. */
  readonly cards: THREE.Mesh | null = null;
  private pos: Float32Array; private nrm: Float32Array;
  private cPos: Float32Array | null = null; private cNrm: Float32Array | null = null;
  private clumps: { a: number; w: number; depth: number; phase: number; amp: number; freq: number; r0: number; flat: number; len: number; flip: boolean }[] = [];
  private ctrl: THREE.Vector3[] = []; private ctr: THREE.Vector3[] = []; private side: THREE.Vector3[] = []; private out: THREE.Vector3[] = [];
  private inv = new THREE.Quaternion(); private loc = new THREE.Vector3();
  private static readonly S = 30; private static readonly M = 8;

  constructor(guides: number, count: number, mat: THREE.Material, cardMat: THREE.Material | null = null) {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < count; k++) {
      const f = (k / (count - 1)) * (guides - 1), a = Math.min(guides - 2, Math.floor(f));
      this.clumps.push({
        // Neighbouring locks share nearly the same wave, so the hair flows instead of tangling.
        a, w: f - a, depth: ((k % 3) - 1) * 0.09 + (rnd() - 0.5) * 0.05, phase: k * 0.35 + rnd() * 0.5,
        amp: 0.07 + rnd() * 0.04, freq: 1.5 + rnd() * 0.3, r0: 0.25 + rnd() * 0.06, flat: 0.36 + rnd() * 0.08, len: 0.85 + rnd() * 0.15,
        flip: rnd() < 0.5,
      });
    }
    const S = HairClumps.S, M = HairClumps.M, per = S * (M + 1), n = count * per;
    for (let i = 0; i < 12; i++) this.ctrl.push(new THREE.Vector3());
    for (let i = 0; i < S; i++) { this.ctr.push(new THREE.Vector3()); this.side.push(new THREE.Vector3()); this.out.push(new THREE.Vector3()); }
    this.pos = new Float32Array(n * 3); this.nrm = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), idx: number[] = [];
    for (let c = 0; c < count; c++) for (let s = 0; s < S; s++) for (let m = 0; m <= M; m++) {
      const i = c * per + s * (M + 1) + m;
      uv[i * 2] = m / M + c * 0.37; uv[i * 2 + 1] = s / (S - 1);
      if (s < S - 1 && m < M) { const j = i + M + 1; idx.push(i, i + 1, j, i + 1, j + 1, j); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;

    if (cardMat) {
      // Three columns across each card (left, middle, right) so it can curve around the lock.
      const cn = count * S * 3, cuv = new Float32Array(cn * 2), cidx: number[] = [];
      this.cPos = new Float32Array(cn * 3); this.cNrm = new Float32Array(cn * 3);
      this.clumps.forEach((c, ci) => {
        for (let s2 = 0; s2 < S; s2++) for (let k = 0; k < 3; k++) {
          const i = (ci * S + s2) * 3 + k, u = k / 2;
          cuv[i * 2] = c.flip ? 1 - u : u; cuv[i * 2 + 1] = 1 - s2 / (S - 1);
          if (s2 < S - 1 && k < 2) { const j = i + 3; cidx.push(i, i + 1, j, i + 1, j + 1, j); }
        }
      });
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(this.cPos, 3));
      cg.setAttribute('normal', new THREE.BufferAttribute(this.cNrm, 3));
      cg.setAttribute('uv', new THREE.BufferAttribute(cuv, 2));
      cg.setIndex(cidx);
      this.cards = new THREE.Mesh(cg, cardMat);
      this.cards.frustumCulled = false;
      this.cards.renderOrder = 1;
    }
  }

  /** `R` is the current head radius, so overlay mode scales the hair with the person. */
  update(chains: Chain[], headC: THREE.Vector3, headQuat: THREE.Quaternion, R: number) {
    const inv = this.inv.copy(headQuat).invert(), loc = this.loc;
    const S = HairClumps.S, M = HairClumps.M, pos = this.pos, nrm = this.nrm;
    const G = chains[0].pts.length, ctrl = this.ctrl, ctr = this.ctr, side = this.side;
    const T = tA, n1 = tB, n2 = tC, o = tD;
    let v = 0, cv = 0;
    const cPos = this.cPos, cNrm = this.cNrm, nOut = new THREE.Vector3();
    for (const c of this.clumps) {
      const A = chains[c.a].pts, B = chains[c.a + 1].pts;
      for (let i = 0; i < G; i++) ctrl[i].lerpVectors(A[i], B[i], c.w);
      // Smooth centre line through the guides, then the clump's own wave on top.
      for (let s = 0; s < S; s++) {
        const tt = s / (S - 1), u = tt * c.len * (G - 1);
        const i = Math.min(G - 2, Math.floor(u)), f = u - i;
        const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(G - 1, i + 2)];
        const f2 = f * f, f3 = f2 * f;
        const cr = (a: number, b: number, cc: number, d: number) =>
          0.5 * (2 * b + (-a + cc) * f + (2 * a - 5 * b + 4 * cc - d) * f2 + (-a + 3 * b - 3 * cc + d) * f3);
        const q = ctr[s].set(cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y), cr(p0.z, p1.z, p2.z, p3.z));
        o.set(q.x - headC.x, 0, q.z - headC.z);
        if (o.lengthSq() < 1e-8) o.set(0, 0, -1);
        o.normalize();
        side[s].set(o.z, 0, -o.x);
        this.out[s].copy(o);
        const amp = c.amp * R * THREE.MathUtils.smoothstep(tt, 0, 0.3);
        const wv = c.phase + tt * c.freq * Math.PI * 2;
        q.addScaledVector(side[s], amp * Math.sin(wv)).addScaledVector(o, amp * 0.5 * Math.cos(wv) + c.depth * R);
        // Hair hangs down her back only. Below the cheeks, every lock is eased behind the neck
        // and kept within the width of the head, measured in the head's own frame so it
        // works whichever way she turns. Nothing hangs beside her face or under her chin.
        loc.subVectors(q, headC).applyQuaternion(inv).divideScalar(R);
        const below = THREE.MathUtils.smoothstep(-loc.y, 0.05, 0.45);
        const rr = c.r0 * (1 - 0.82 * Math.pow(tt, 1.6)), zMax = -0.5 - rr, xMax = 0.95 - rr * 0.5;
        if (below > 0 && (loc.z > zMax || Math.abs(loc.x) > xMax)) {
          if (loc.z > zMax) loc.z += (zMax - loc.z) * below;
          if (Math.abs(loc.x) > xMax) loc.x += ((loc.x < 0 ? -xMax : xMax) - loc.x) * below;
          q.copy(loc).multiplyScalar(R).applyQuaternion(headQuat).add(headC);
        }
      }
      // Tube around the centre line: wide side to side, thinner front to back, tapering to the tip.
      for (let s = 0; s < S; s++) {
        const tt = s / (S - 1);
        T.subVectors(ctr[Math.min(S - 1, s + 1)], ctr[Math.max(0, s - 1)]).normalize();
        n1.copy(side[s]).addScaledVector(T, -side[s].dot(T));
        if (n1.lengthSq() < 1e-8) n1.set(1, 0, 0);
        n1.normalize();
        n2.crossVectors(T, n1);
        const r = c.r0 * R * (1 - 0.82 * Math.pow(tt, 1.6)), ry = r * c.flat;
        for (let m = 0; m <= M; m++) {
          const ang = (m / M) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
          const q = ctr[s];
          pos[v * 3] = q.x + n1.x * ca * r + n2.x * sa * ry;
          pos[v * 3 + 1] = q.y + n1.y * ca * r + n2.y * sa * ry;
          pos[v * 3 + 2] = q.z + n1.z * ca * r + n2.z * sa * ry;
          const nx = n1.x * ca * c.flat + n2.x * sa, ny = n1.y * ca * c.flat + n2.y * sa, nz = n1.z * ca * c.flat + n2.z * sa;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nrm[v * 3] = nx / nl; nrm[v * 3 + 1] = ny / nl; nrm[v * 3 + 2] = nz / nl;
          v++;
        }
        if (cPos && cNrm) {
          // The card lies over the outer face of the lock, a little wider than it, bowed outwards.
          nOut.copy(n2); if (nOut.dot(this.out[s]) < 0) nOut.negate();
          const W = c.r0 * R * 2.15 * (1 - 0.3 * tt), q = ctr[s];
          for (let k = -1; k <= 1; k++) {
            const lift = ry * 0.7 + (1 - k * k) * W * 0.12;
            cPos[cv * 3] = q.x + n1.x * k * W * 0.5 + nOut.x * lift;
            cPos[cv * 3 + 1] = q.y + n1.y * k * W * 0.5 + nOut.y * lift;
            cPos[cv * 3 + 2] = q.z + n1.z * k * W * 0.5 + nOut.z * lift;
            const nx = nOut.x + n1.x * k * 0.35, ny = nOut.y + n1.y * k * 0.35, nz = nOut.z + n1.z * k * 0.35;
            const nl = Math.hypot(nx, ny, nz) || 1;
            cNrm[cv * 3] = nx / nl; cNrm[cv * 3 + 1] = ny / nl; cNrm[cv * 3 + 2] = nz / nl;
            cv++;
          }
        }
      }
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    if (this.cards) {
      (this.cards.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.cards.geometry.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

/**
 * Strand cards that cover the top of the head: each starts at the hairline, sweeps back
 * over the crown and ends low on the back of the head, where the hanging locks take over.
 * They sit just outside the crown shape, so they follow the hair's volume.
 */
function scalpCards(R: number, mat: THREE.Material) {
  const S2 = 18, N = 32, layers = 2, cols = 3;
  const C = new THREE.Vector3(0, 0.2 * R, -0.36 * R), rad = new THREE.Vector3(1.1 * R, 1.15 * R, 1.08 * R);
  // Distance from the head centre to the outside of the hair along direction d.
  const surf = (d: THREE.Vector3) => {
    const dx = d.x / rad.x, dy = d.y / rad.y, dz = d.z / rad.z, cx = -C.x / rad.x, cy = -C.y / rad.y, cz = -C.z / rad.z;
    const a = dx * dx + dy * dy + dz * dz, b = 2 * (dx * cx + dy * cy + dz * cz), c = cx * cx + cy * cy + cz * cz - 1;
    return Math.max((-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a), 1.07 * R);
  };
  const dir = (az: number, el: number) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const n = layers * N * S2 * cols;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx: number[] = [];
  const d = new THREE.Vector3(), prev = new THREE.Vector3(), next = new THREE.Vector3(), tan = new THREE.Vector3(), across = new THREE.Vector3();
  let v = 0, seed = 21;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const at = (d0: THREE.Vector3, dm: THREE.Vector3, d1: THREE.Vector3, t: number, out: THREE.Vector3) =>
    out.copy(d0).multiplyScalar((1 - t) ** 2).addScaledVector(dm, 2 * t * (1 - t)).addScaledVector(d1, t * t).normalize();
  for (let L = 0; L < layers; L++) for (let i = 0; i < N; i++) {
    const az0 = -1.2 + (2.4 * (i + 0.5 * L)) / (N - 1) + (rnd() - 0.5) * 0.05;
    const el0 = 0.52 - 0.28 * Math.abs(az0);
    const az1 = az0 === 0 ? Math.PI : Math.sign(az0) * (Math.PI - Math.abs(az0) * 0.85);
    const d0 = dir(az0, el0), d1 = dir(az1, -0.7 + 0.12 * L), dm = d0.clone().add(d1).add(new THREE.Vector3(0, 1.4, 0)).normalize();
    const flip = rnd() < 0.5, lift = (0.012 + 0.018 * L) * R, W0 = (0.46 + rnd() * 0.08) * R;
    for (let s = 0; s < S2; s++) {
      const t = s / (S2 - 1);
      at(d0, dm, d1, t, d);
      at(d0, dm, d1, Math.max(0, t - 0.02), prev); at(d0, dm, d1, Math.min(1, t + 0.02), next);
      const r = surf(d) + lift;
      tan.copy(next).multiplyScalar(surf(next)).sub(prev.clone().multiplyScalar(surf(prev))).normalize();
      across.crossVectors(tan, d).normalize();
      const W = W0 * (1 - 0.3 * t);
      for (let k = 0; k < cols; k++) {
        const x = k - 1, bow = (1 - x * x) * W * 0.08;
        pos.set([d.x * (r + bow) + across.x * x * W * 0.5, d.y * (r + bow) + across.y * x * W * 0.5, d.z * (r + bow) + across.z * x * W * 0.5], v * 3);
        nrm.set([d.x, d.y, d.z], v * 3);
        uv.set([flip ? 1 - k / 2 : k / 2, 1 - t], v * 2);
        if (s < S2 - 1 && k < cols - 1) idx.push(v, v + 1, v + cols, v + 1, v + cols + 1, v + cols);
        v++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  return m;
}

interface Eye {
  group: THREE.Group; gaze: THREE.Group; lid: THREE.Mesh; lower: THREE.Mesh; brow: THREE.Mesh; browY: number; side: number;
}

// Resting eyelid angles. The upper lid sits a little low and the lower lid a
// little high, which turns round eyeballs into almond-shaped eyes.
const LID_OPEN = -0.78, LID_SHUT = 1.42, LOWER_LID = -2.15;

export class Character {
  readonly group = new THREE.Group();
  look: Look;

  private parts: Record<string, THREE.Object3D> = {};
  private head = new THREE.Group();
  private torso = new THREE.Group();
  private hips = new THREE.Group();
  private skirtDir = new THREE.Vector3(0, -1, 0);
  private eyes: Eye[] = [];
  private mouth!: THREE.Mesh;
  private mouthPos!: THREE.BufferAttribute;
  private chains: Chain[] = [];
  private chainRoot = new THREE.Group();
  private hair: HairClumps | null = null;
  private static readonly MOUTH_N = 16;

  constructor(look: Look) {
    this.look = { ...look };
    this.build();
  }

  setLook(look: Look) {
    this.look = { ...look };
    this.dispose();
    this.build();
  }

  private dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => {
          (x as THREE.MeshToonMaterial).map?.dispose();
          x.dispose();
        });
      }
    });
    this.group.clear(); this.head = new THREE.Group(); this.torso = new THREE.Group();
    this.hips = new THREE.Group(); this.chainRoot = new THREE.Group();
    this.parts = {}; this.eyes = []; this.chains = []; this.hair = null;
  }

  // ------------------------------------------------------------------ build
  private build() {
    const L = this.look, V = L.outfit === 'voyager';
    const skin = toon(L.skin), top = toon(L.topColor), bottom = toon(L.bottomColor, { side: THREE.DoubleSide });
    const accent = toon(L.accentColor), boot = toon(shade(L.accentColor, 0.92));
    const add = (name: string, o: THREE.Object3D) => { this.parts[name] = o; this.group.add(o); return o; };
    const seg = (rTop: number, rBot: number, mat: THREE.Material) =>
      new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 1, 18, 1), mat);
    const ball = (r: number, mat: THREE.Material) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);

    for (const s of ['L', 'R']) {
      add('upperArm' + s, seg(0.05, 0.042, skin));
      add('foreArm' + s, seg(0.041, 0.033, skin));
      add('shoulder' + s, ball(V ? 0.056 : 0.074, V ? skin : top));
      add('elbow' + s, ball(0.042, skin));
      const hand = ball(0.05, skin); hand.geometry.scale(1, 1.25, 0.8); add('hand' + s, hand);
      add('thigh' + s, seg(0.082, 0.056, skin));
      add('shin' + s, seg(0.055, 0.037, skin));
      add('knee' + s, ball(0.055, skin));
      if (V) {
        const foot = ball(0.047, skin); foot.geometry.scale(0.95, 0.62, 1.95); add('foot' + s, foot);
      } else {
        add('sleeve' + s, seg(0.07, 0.063, top));
        add('cuff' + s, seg(0.04, 0.04, accent));
        add('bootTop' + s, seg(0.062, 0.058, boot));
        const foot = ball(0.07, boot); foot.geometry.scale(0.92, 0.72, 1.55); add('foot' + s, foot);
      }
      if (L.outfit === 'shorts') add('shortLeg' + s, seg(0.098, 0.088, bottom));
    }
    add('neck', seg(0.043, 0.05, skin));

    // Torso: a lathe shape, flattened front to back.
    const torsoMesh = new THREE.Mesh(new THREE.LatheGeometry(vec2s(V ? FIGURE : TUNIC), 32), V ? skin : top);
    torsoMesh.scale.z = 0.72;
    this.torso.add(torsoMesh);
    if (V) {
      // Crop top over bare shoulders and midriff, and a pearl necklace with a shell pendant.
      const band = new THREE.Mesh(new THREE.LatheGeometry(slice(FIGURE, 0.245, 0.43, 10, 1.05), 40, Math.PI),
        toon('#ffffff', { map: topTexture(L.topColor), alphaTest: 0.5, side: THREE.DoubleSide }));
      band.scale.z = 0.72;
      // The necklace hangs in a U across the chest, sitting on the torso surface.
      const onChest = (x: number, y: number, lift: number) => {
        const r = slice(FIGURE, y, y, 1, 1)[0].x;
        return new THREE.Vector3(x, y, 0.72 * Math.sqrt(Math.max(0, r * r - x * x)) + lift);
      };
      const cordPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) { const t = i / 8 - 1; cordPts.push(onChest(t * 0.1, 0.468 + 0.07 * t * t, 0.006)); }
      const silver = toon('#dfe4e8');
      const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPts), 32, 0.0028, 5, false), silver);
      const pearl = toon('#fbf6ee');
      for (const i of [-6, -4, 4, 6]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 10), pearl);
        b.position.copy(cordPts[8 + i]); cord.add(b);
      }
      // Oval pendant: abalone shell set in a silver rim, with a small engraved wave.
      const pendant = new THREE.Group();
      const pw = 0.024, ph = 0.033;
      const face = new THREE.Mesh(new THREE.CircleGeometry(1, 32), toon('#ffffff', { map: abaloneTexture() }));
      face.scale.set(pw, ph, 1); face.position.z = 0.004;
      const back = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.006, 32), silver);
      back.rotation.x = Math.PI / 2; back.scale.set(pw * 1.12, 1, ph * 1.1);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 6, 40), silver);
      rim.scale.set(pw, ph, 0.06); rim.position.z = 0.004;
      const wavePts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; wavePts.push(new THREE.Vector3((t - 0.5) * 1.7 * pw, ph * (0.35 + 0.18 * Math.sin(t * Math.PI * 2.2)), 0.0055)); }
      const wave = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wavePts), 24, 0.0018, 4, false), silver);
      const bail = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0022, 6, 16), silver);
      bail.position.set(0, ph + 0.005, 0.002);
      pendant.add(back, face, rim, wave, bail);
      pendant.position.copy(onChest(0, 0.425, 0.012)); pendant.rotation.x = -0.32;
      this.torso.add(band, cord, pendant);
    } else {
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.022, 8, 28), accent);
      belt.rotation.x = Math.PI / 2; belt.position.y = 0.1; belt.scale.y = 0.72;
      const cord = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.009, 6, 24), toon('#7a5230'));
      cord.rotation.x = Math.PI / 2 - 0.5; cord.position.set(0, 0.5, 0.035);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), toon('#fff3e2'));
      shell.scale.set(1, 1.15, 0.5); shell.position.set(0, 0.445, 0.142);
      this.torso.add(belt, cord, shell);
    }
    this.group.add(this.torso);

    // Hips: pelvis plus a skirt (layered for the voyager outfit) or shorts.
    const pelvis = ball(0.15, V ? toon('#d6b47c') : bottom); pelvis.scale.set(1.08, 0.78, 0.8); pelvis.position.y = 0.01;
    this.hips.add(pelvis);
    if (V) {
      const sk = new THREE.Group();
      const grassPts = vec2s([[0.162, 0.11], [0.19, 0.02], [0.222, -0.12], [0.254, -0.3], [0.272, -0.45]]);
      const grass = new THREE.Mesh(new THREE.LatheGeometry(grassPts, 40, Math.PI),
        toon('#ffffff', { map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide }));
      const wrapPts = vec2s([[0.17, 0.125], [0.2, 0.03], [0.232, -0.12], [0.266, -0.3], [0.276, -0.37]]);
      const wrap = new THREE.Mesh(new THREE.LatheGeometry(wrapPts, 40, Math.PI),
        toon('#ffffff', { map: skirtTexture(L.bottomColor, mix(L.accentColor, '#f6b13d', 0.6)), alphaTest: 0.5, side: THREE.DoubleSide }));
      grass.scale.z = wrap.scale.z = 0.85;
      // Sash tied in a knot on her right hip.
      const sash = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.032, 8, 36), accent);
      sash.rotation.x = Math.PI / 2; sash.position.y = 0.075; sash.scale.y = 0.85;
      const knot = ball(0.042, accent); knot.scale.set(1, 1.1, 0.75); knot.position.set(-0.15, 0.07, 0.115);
      sk.add(grass, wrap, sash, knot);
      for (const [dx, len, tilt] of [[-0.012, 0.09, 0.15], [0.02, 0.065, -0.2]]) {
        const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, len, 4, 8), accent);
        tail.scale.z = 0.45; tail.position.set(-0.15 + dx, 0.05 - len * 0.55, 0.13); tail.rotation.z = tilt; tail.rotation.x = -0.15;
        sk.add(tail);
      }
      this.parts.skirt = sk; this.group.add(sk);
    } else if (L.outfit === 'dress') {
      const pts = [[0.15, 0.1], [0.19, 0.02], [0.26, -0.13], [0.33, -0.27], [0.345, -0.3]].map(([r, y]) => new THREE.Vector2(r, y));
      const skirt = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), bottom);
      skirt.scale.z = 0.85;
      const hem = new THREE.Mesh(new THREE.TorusGeometry(0.343, 0.014, 6, 32), accent);
      hem.rotation.x = Math.PI / 2; hem.position.y = -0.3; hem.scale.y = 0.85;
      const sk = new THREE.Group(); sk.add(skirt, hem);
      this.parts.skirt = sk; this.group.add(sk);
    }
    this.group.add(this.hips);

    if (L.prop === 'oar') add('oar', this.buildOar());

    this.buildHead(skin);
    this.group.add(this.head, this.chainRoot);
  }

  /**
   * A carved wooden paddle with a broad teardrop blade, painted with stacked waves.
   * Its origin is the spot her hand grips.
   */
  private buildOar() {
    const oar = new THREE.Group(), len = 1.85, grip = 0.32;
    const wood = toon('#c48d52'), pale = toon('#d9ab70');
    // Blade: narrow neck at the shaft, swelling to a wide rounded tip.
    const H = 0.6, W = 0.14;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(0.05, 0.035, 0.135, 0.19, 0.132, 0.37);
    sh.bezierCurveTo(0.128, 0.52, 0.07, H, 0, H);
    sh.bezierCurveTo(-0.07, H, -0.128, 0.52, -0.132, 0.37);
    sh.bezierCurveTo(-0.135, 0.19, -0.05, 0.035, 0, 0);
    const bladeG = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 24 });
    bladeG.translate(0, 0, -0.007);
    // Map the flat faces onto the painted texture: u across the blade, v from neck to tip.
    const pos = bladeG.attributes.position, uv = bladeG.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + W) / (2 * W), pos.getY(i) / H);
    const face = toon('#ffffff', { map: oarBladeTexture() });
    const blade = new THREE.Mesh(bladeG, [face, pale]); // group 0 = faces, group 1 = edges
    const bladeBase = len * (1 - grip) - H;
    blade.position.y = bladeBase;
    // The shaft stops at the neck so it doesn't poke through the painting,
    // then a short tapered spine blends it into the blade.
    const top = bladeBase + 0.06, bottom = -len * grip;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, top - bottom, 12), wood);
    shaft.position.y = (top + bottom) / 2;
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.016, 0.1, 10), wood);
    spine.scale.z = 0.95; spine.position.y = top + 0.05;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), wood);
    knob.scale.set(1, 1.3, 1); knob.position.y = bottom;
    oar.add(shaft, spine, knob, blade);
    return oar;
  }

  private buildHead(skin: THREE.Material) {
    const L = this.look, R = P.headR;
    // Hair gets real (non-toon) shading so the strand texture and a soft sheen show.
    const hairMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(L.hairColor).multiplyScalar(1.45), map: strandTexture(), roughness: 0.62, metalness: 0, side: THREE.DoubleSide,
    });
    const scalpMat = hairMat.clone();
    scalpMat.map = scalpTexture();
    const head = this.head;
    head.add(new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), skin));
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.17 * R, 14, 10), skin);
      ear.scale.set(0.5, 1, 0.8); ear.position.set(s * R * 0.98, -0.1 * R, 0); head.add(ear);
    }
    // Nose: a soft tip with two small wings.
    const noseMat = toon(shade(L.skin, 0.96));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09 * R, 16, 12), noseMat);
    tip.scale.set(1.35, 0.85, 0.8); tip.position.set(0, -0.3 * R, 0.95 * R); head.add(tip);
    const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.04 * R, 0.2 * R, 4, 8), noseMat);
    bridge.scale.z = 0.6; bridge.position.set(0, -0.16 * R, 0.965 * R); bridge.rotation.x = -0.3; head.add(bridge);

    // Blush, shaped to the curve of the face.
    const onSphere = (g: THREE.BufferGeometry, cx: number, cy: number, rad: number) => {
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + cx, y = p.getY(i) + cy;
        p.setXYZ(i, x, y, Math.sqrt(Math.max(0, rad * rad - x * x - y * y)));
      }
      return g;
    };
    for (const s of [-1, 1]) {
      const g = onSphere(new THREE.CircleGeometry(0.17 * R, 24), s * 0.56 * R, -0.3 * R, R * 1.008);
      head.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e0606a', transparent: true, opacity: 0.11, depthWrite: false })));
    }

    // Eyes: round eyeballs, shaped into almonds by an upper and a lower lid.
    const re = 0.2 * R, ex = 0.4 * R, ey = -0.03 * R;
    const ez = Math.sqrt((0.9 * R) ** 2 - ex * ex - ey * ey);
    const cap = (rad: number, ang: number, color: string | number) => {
      const g = new THREE.SphereGeometry(rad, 24, 8, 0, Math.PI * 2, 0, ang);
      g.rotateX(Math.PI / 2);
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color }));
    };
    const browMat = toon(shade(L.hairColor, 0.85));
    const liner = new THREE.MeshBasicMaterial({ color: '#160d0a' });
    for (const s of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(s * ex, ey, ez);
      group.rotation.y = s * 0.3;
      group.scale.set(1.2, 1, 0.82);
      group.add(new THREE.Mesh(new THREE.SphereGeometry(re, 24, 16), new THREE.MeshBasicMaterial({ color: '#fbf8f4' })));
      const gaze = new THREE.Group();
      gaze.scale.x = 1 / 1.1;
      gaze.add(cap(re * 1.03, 0.78, L.eyeColor), cap(re * 1.04, 0.4, '#120b08'));
      for (const [gx, gy, gr] of [[-0.3, 0.3, 0.17], [0.26, -0.22, 0.08]]) {
        // Flat highlights hugging the eye surface, so a closed eyelid covers them completely.
        const glint = new THREE.Mesh(new THREE.CircleGeometry(re * gr, 14), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        const dir = new THREE.Vector3(gx, gy, 1).normalize();
        glint.position.copy(dir).multiplyScalar(re * 1.045);
        glint.lookAt(dir.multiplyScalar(2 * re));
        gaze.add(glint);
      }
      group.add(gaze);
      const lidG = () => new THREE.SphereGeometry(re * 1.07, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      const lid = new THREE.Mesh(lidG(), skin);
      const lashG = new THREE.TorusGeometry(re * 1.07, re * 0.12, 6, 24, Math.PI);
      lashG.rotateX(Math.PI / 2);
      lid.add(new THREE.Mesh(lashG, liner));
      // A small flick of eyeliner at the outer corner.
      const wing = new THREE.Mesh(new THREE.ConeGeometry(re * 0.13, re * 0.5, 6), liner);
      wing.position.set(s * re * 1.18, re * 0.02, re * 0.12); wing.rotation.z = -s * 1.25; wing.rotation.x = -0.6;
      lid.add(wing);
      lid.rotation.x = LID_OPEN;
      group.add(lid);
      const lower = new THREE.Mesh(lidG(), skin);
      lower.rotation.x = LOWER_LID;
      group.add(lower);
      head.add(group);

      // Brow: a thick arch that hugs the forehead.
      const browY = ey + 0.34 * R, bx = s * ex * 1.02, bpts: THREE.Vector3[] = [];
      const bz = Math.sqrt((R * 1.0) ** 2 - bx * bx - browY * browY);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8 * 2 - 1, x = bx + s * t * 0.22 * R, y = browY + (0.06 * (1 - t * t) - 0.035 * Math.max(0, t)) * R;
        bpts.push(new THREE.Vector3(x - bx, y - browY, Math.sqrt(Math.max(0, (R * 1.01) ** 2 - x * x - y * y)) - bz));
      }
      const brow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bpts), 16, 0.032 * R, 6, false), browMat);
      brow.scale.y = 1.25;
      brow.position.set(bx, browY, bz);
      head.add(brow);
      this.eyes.push({ group, gaze, lid, lower, brow, browY, side: s });
    }

    // Mouth: five ribbons (inside, tongue, teeth, upper lip, lower lip) reshaped every frame.
    const N = Character.MOUTH_N, vPer = (N + 1) * 2, S = 5;
    const pos = new Float32Array(vPer * S * 3), col = new Float32Array(vPer * S * 3), idx: number[] = [];
    const lip = new THREE.Color(L.skin).lerp(new THREE.Color('#b8404c'), 0.45).multiplyScalar(0.86);
    const cols = [new THREE.Color('#5e1a2a'), new THREE.Color('#e0707f'), new THREE.Color('#ffffff'), lip, lip.clone().multiplyScalar(1.1)];
    for (let s = 0; s < S; s++) {
      for (let i = 0; i < vPer; i++) cols[s].toArray(col, (s * vPer + i) * 3);
      for (let i = 0; i < N; i++) {
        const a = s * vPer + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const mg = new THREE.BufferGeometry();
    this.mouthPos = new THREE.BufferAttribute(pos, 3);
    mg.setAttribute('position', this.mouthPos);
    mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mg.setIndex(idx);
    this.mouth = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.mouth.frustumCulled = false;
    head.add(this.mouth);

    // Hair cap, shared by every style.
    const capG = new THREE.SphereGeometry(R * 1.07, 36, 20, 0, Math.PI * 2, 0, 1.6);
    capG.rotateX(-0.6);
    head.add(new THREE.Mesh(capG, scalpMat));

    const chain = (ax: number, ay: number, az: number, n: number, r0: number, r1: number, spacing: number, stiffness = 0, mat: THREE.Material = hairMat, wave = 0, beads = true) => {
      const c: Chain = { anchor: new THREE.Vector3(ax, ay, az).multiplyScalar(R), pts: [], prev: [], meshes: [], radii: [], spacing: spacing * R, stiffness, init: false };
      for (let i = 0; i < n; i++) {
        const r = (r0 + (r1 - r0) * (i / Math.max(1, n - 1))) * R * (1 + wave * Math.sin(i * 2.1 + ax * 5));
        c.pts.push(new THREE.Vector3()); c.prev.push(new THREE.Vector3()); c.radii.push(r);
        if (!beads) continue;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
        c.meshes.push(m); this.chainRoot.add(m);
      }
      this.chains.push(c);
      return c;
    };
    const fringe = (list: number[][]) => {
      for (const [az, el, sx, sy, roll] of list) {
        // Poles along the swoop's length, so the strands run along it.
        const b = new THREE.Mesh(new THREE.SphereGeometry(R * 0.26, 24, 16).rotateZ(Math.PI / 2), scalpMat);
        b.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(R * 0.98);
        b.scale.set(sx, sy, 0.55); b.lookAt(0, 0, 0); b.rotateZ(roll);
        head.add(b);
      }
    };
    const tie = toon(L.accentColor);
    let accR = 1.1;
    switch (L.hairStyle) {
      case 'waves': case 'cards': {
        // Soft volume on top, swept from a side part, falling in waves down her back.
        // The hair stays on top of and behind the head: from the front, nothing shows
        // beside her jaw or under her chin.
        fringe([[-0.5, 0.78, 1.7, 0.75, 0.25], [0.35, 0.8, 1.9, 0.75, -0.3]]);
        // Back of the head: tall and full on top, but narrower than her face at jaw height.
        const crown = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), scalpMat);
        crown.scale.set(1.1, 1.15, 1.08); crown.position.set(0, 0.2 * R, -0.36 * R);
        head.add(crown);
        // Guide strands all start at the back of the head. They are invisible;
        // the meshed locks follow them.
        for (let i = 0; i < 9; i++) {
          const a = -1.25 + i * (2.5 / 8);
          chain(Math.sin(a) * 0.95, -0.2, -Math.cos(a) * 0.75 - 0.4, 9, 0.3, 0.2, 0.29, 0, hairMat, 0, false);
        }
        if (L.hairStyle === 'cards') {
          // Realistic waves: see-through strand cards over the locks, with a soft sheen that
          // stretches across the strands. Toned to sit between the sculpted look and real hair.
          const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/hair-card.png`);
          tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
          const cardMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(L.hairColor).multiplyScalar(1.4), map: tex, alphaTest: 0.25, alphaToCoverage: true,
            side: THREE.DoubleSide, roughness: 0.9, metalness: 0, anisotropy: 0.2, anisotropyRotation: Math.PI / 2, specularIntensity: 0.12,
          });
          // Matte layers underneath too, so bright room light doesn't turn the hair silvery.
          const under = hairMat.clone();
          under.color.multiplyScalar(0.85); under.roughness = 0.92;
          scalpMat.roughness = 0.92;
          this.hair = new HairClumps(9, 44, under, cardMat);
          this.chainRoot.add(this.hair.mesh, this.hair.cards!);
          head.add(scalpCards(R, cardMat));
        } else {
          this.hair = new HairClumps(9, 44, hairMat);
          this.chainRoot.add(this.hair.mesh);
        }
        accR = 1.28;
        break;
      }
      case 'puffs':
        fringe([[-0.75, 0.5, 1.2, 0.62, 0.5], [-0.2, 0.62, 1.5, 0.62, 0.5], [0.5, 0.55, 1.35, 0.62, 0.5]]);
        for (const s of [-1, 1]) {
          chain(s * 0.78, 0.78, -0.12, 1, 0.5, 0.5, 0, 0.3);
          const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.06, 8, 16), tie);
          band.position.set(s * 0.6 * R, 0.62 * R, -0.1 * R); band.lookAt(0, 0, 0); head.add(band);
        }
        break;
      case 'long': {
        fringe([[-0.75, 0.5, 1.2, 0.62, 0.5], [-0.2, 0.62, 1.5, 0.62, 0.5], [0.5, 0.55, 1.35, 0.62, 0.5]]);
        const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 24, 16), hairMat);
        back.scale.set(1.08, 1.05, 0.8); back.position.set(0, -0.2 * R, -0.36 * R); head.add(back);
        for (const a of [-2.0, -1.2, -0.4, 0.4, 1.2, 2.0]) {
          chain(Math.sin(a) * 0.95, -0.45, -Math.cos(a) * 0.75 - 0.1, 7, 0.4, 0.2, 0.34);
        }
        break;
      }
      case 'ponytail': {
        fringe([[-0.75, 0.5, 1.2, 0.62, 0.5], [-0.2, 0.62, 1.5, 0.62, 0.5], [0.5, 0.55, 1.35, 0.62, 0.5]]);
        const c = chain(0, 0.62, -0.95, 8, 0.36, 0.14, 0.3);
        c.meshes[0].material = tie;
        break;
      }
      case 'braids':
        fringe([[-0.75, 0.5, 1.2, 0.62, 0.5], [-0.2, 0.62, 1.5, 0.62, 0.5], [0.5, 0.55, 1.35, 0.62, 0.5]]);
        for (const s of [-1, 1]) {
          const c = chain(s * 0.92, -0.35, -0.15, 9, 0.24, 0.17, 0.26);
          c.meshes[c.meshes.length - 1].material = tie;
        }
        break;
      case 'bob': {
        fringe([[-0.75, 0.5, 1.2, 0.62, 0.5], [-0.2, 0.62, 1.5, 0.62, 0.5], [0.5, 0.55, 1.35, 0.62, 0.5]]);
        const g = new THREE.SphereGeometry(R * 1.16, 32, 20, 0, Math.PI * 2, 0, 2.15);
        g.rotateX(-0.95);
        const bob = new THREE.Mesh(g, hairMat); bob.scale.set(1.04, 1, 1); bob.position.y = -0.04 * R; head.add(bob);
        break;
      }
    }

    // Hair accessory. Sizes were designed for a head of radius 0.42.
    const acc = new THREE.Group();
    const accMat = toon(L.accentColor);
    if (L.accessory === 'starfish') {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.11 : 0.05, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.014, bevelSegments: 2 });
      acc.add(new THREE.Mesh(g, accMat));
    } else if (L.accessory === 'flower') {
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), accMat);
        const a = (i / 5) * Math.PI * 2;
        p.position.set(Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0); p.scale.set(1, 1, 0.45); acc.add(p);
      }
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), toon('#ffe27a')); c.position.z = 0.02; acc.add(c);
    } else if (L.accessory === 'bow') {
      for (const s of [-1, 1]) {
        const g = new THREE.ConeGeometry(0.07, 0.13, 14); g.rotateZ(s * Math.PI / 2);
        const w = new THREE.Mesh(g, accMat); w.position.x = s * 0.07; w.scale.z = 0.5; acc.add(w);
      }
      acc.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), accMat));
    }
    acc.scale.setScalar((R / 0.42) * 1.5);
    acc.position.set(0.62, 0.52, 0.6).normalize().multiplyScalar(R * accR);
    acc.lookAt(acc.position.clone().multiplyScalar(2));
    acc.rotateZ(0.3);
    head.add(acc);
  }

  // ------------------------------------------------------------------ pose
  apply(p: Pose, face: FaceState, dt: number) {
    const k = p.k, parts = this.parts;
    const spine = tA.subVectors(p.shC, p.hipC);
    const torsoLen = Math.max(spine.length(), 1e-3);
    const up = new THREE.Vector3().copy(spine).divideScalar(torsoLen);

    // torso
    const shAxis = new THREE.Vector3().subVectors(p.shL, p.shR);
    const hipAxis = new THREE.Vector3().subVectors(p.hipL, p.hipR);
    const shW = shAxis.length();
    this.torso.position.copy(p.hipC);
    frame(this.torso.quaternion, new THREE.Vector3().copy(shAxis).normalize().lerp(tD.copy(hipAxis).normalize(), 0.35), up);
    this.torso.scale.set((shW / 0.4) * 1.12, torsoLen / 0.52, k * (P.shoulderHalf / 0.2) * 1.1);

    // hips and skirt
    this.hips.position.copy(p.hipC);
    frame(this.hips.quaternion, hipAxis, up);
    this.hips.scale.setScalar(k);
    if (parts.skirt) {
      const want = new THREE.Vector3().copy(up).multiplyScalar(-1).lerp(new THREE.Vector3(0, -1, 0), 0.45).normalize();
      this.skirtDir.lerp(want, Math.min(1, dt * 9)).normalize();
      parts.skirt.position.copy(p.hipC);
      frame(parts.skirt.quaternion, hipAxis, new THREE.Vector3().copy(this.skirtDir).multiplyScalar(-1));
      parts.skirt.scale.setScalar(k);
    }

    // arms
    const arm = (s: 'L' | 'R', sh: THREE.Vector3, el: THREE.Vector3, wr: THREE.Vector3, hd: THREE.Vector3) => {
      placeSeg(parts['upperArm' + s], sh, el, k);
      placeSeg(parts['sleeve' + s], sh, tB.lerpVectors(sh, el, 0.5), k);
      placeSeg(parts['foreArm' + s], el, wr, k);
      parts['shoulder' + s].position.copy(sh); parts['shoulder' + s].scale.setScalar(k);
      parts['elbow' + s].position.copy(el); parts['elbow' + s].scale.setScalar(k);
      const a = new THREE.Vector3().lerpVectors(el, wr, 0.86), b = new THREE.Vector3().lerpVectors(el, wr, 0.98);
      placeSeg(parts['cuff' + s], a, b, k);
      const h = parts['hand' + s];
      h.position.lerpVectors(wr, hd, 0.6);
      tA.subVectors(hd, wr);
      if (tA.lengthSq() > 1e-8) h.quaternion.setFromUnitVectors(Y, tA.normalize());
      h.scale.setScalar(k);
    };
    arm('L', p.shL, p.elbowL, p.wristL, p.handL);
    arm('R', p.shR, p.elbowR, p.wristR, p.handR);

    // The oar stays mostly upright in her right hand, leaning a little with the forearm.
    if (parts.oar) {
      const lean = new THREE.Vector3().subVectors(p.wristR, p.elbowR).normalize();
      const dir = new THREE.Vector3().copy(Y).lerp(lean, 0.18).normalize();
      frame(parts.oar.quaternion, X, dir);
      parts.oar.position.copy(parts.handR.position);
      parts.oar.scale.setScalar(k);
    }

    // legs
    const leg = (s: 'L' | 'R', hip: THREE.Vector3, kn: THREE.Vector3, an: THREE.Vector3, toe: THREE.Vector3) => {
      const names = ['thigh', 'shin', 'knee', 'bootTop', 'foot', 'shortLeg'];
      for (const n of names) if (parts[n + s]) parts[n + s].visible = p.legsVisible;
      if (!p.legsVisible) return;
      placeSeg(parts['thigh' + s], hip, kn, k);
      placeSeg(parts['shin' + s], kn, an, k);
      parts['knee' + s].position.copy(kn); parts['knee' + s].scale.setScalar(k);
      placeSeg(parts['bootTop' + s], new THREE.Vector3().lerpVectors(kn, an, 0.5), an, k);
      placeSeg(parts['shortLeg' + s], hip, new THREE.Vector3().lerpVectors(hip, kn, 0.52), k);
      const f = parts['foot' + s];
      const fwd = new THREE.Vector3().subVectors(toe, an);
      const shinUp = new THREE.Vector3().subVectors(kn, an).normalize();
      if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1);
      fwd.normalize();
      const x = new THREE.Vector3().crossVectors(shinUp, fwd);
      if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
      x.normalize();
      const y2 = new THREE.Vector3().crossVectors(fwd, x).normalize();
      tM.makeBasis(x, y2, fwd);
      f.quaternion.setFromRotationMatrix(tM);
      f.position.copy(an).addScaledVector(fwd, 0.055 * k).addScaledVector(y2, -0.015 * k);
      f.scale.setScalar(k);
    };
    leg('L', p.hipL, p.kneeL, p.ankleL, p.toeL);
    leg('R', p.hipR, p.kneeR, p.ankleR, p.toeR);

    // neck and head
    this.head.position.copy(p.headC);
    this.head.quaternion.copy(p.headQuat);
    this.head.scale.setScalar(p.headScale);
    placeSeg(parts.neck, tB.copy(p.headC).lerp(p.shC, 0.3), new THREE.Vector3().copy(p.shC).addScaledVector(up, -0.02 * k), Math.max(k, p.headScale * 0.8));

    this.applyFace(face);
    this.stepHair(p, up, dt);
  }

  private applyFace(f: FaceState) {
    const R = P.headR, u = R / 0.42;
    for (const e of this.eyes) {
      const isLeft = e.side > 0;
      // The tracker already reports how closed each eye is, calibrated to the person.
      const blink = THREE.MathUtils.clamp(isLeft ? f.blinkL : f.blinkR, 0, 1);
      // A big smile squints the eyes a little.
      const squint = Math.max(0, f.smile - 0.45) * 0.35;
      e.lid.rotation.x = THREE.MathUtils.lerp(LID_OPEN, LID_SHUT, Math.max(blink, squint));
      e.lower.rotation.x = LOWER_LID - squint * 0.9;
      e.gaze.rotation.y = THREE.MathUtils.clamp(f.gazeX, -1, 1) * 0.42;
      e.gaze.rotation.x = -THREE.MathUtils.clamp(f.gazeY, -1, 1) * 0.3;
      const up = isLeft ? f.browUpL : f.browUpR, down = isLeft ? f.browDownL : f.browDownR;
      e.brow.position.y = e.browY + (up * 0.05 - down * 0.03) * u;
      e.brow.rotation.z = e.side * (down * 0.4 - up * 0.1);
    }

    const N = Character.MOUTH_N, vPer = (N + 1) * 2, pos = this.mouthPos;
    const open = THREE.MathUtils.clamp((f.jawOpen - 0.04) * 1.35, 0, 1);
    const smile = THREE.MathUtils.clamp(f.smile * 1.3, -0.6, 1);
    const pucker = THREE.MathUtils.clamp(f.pucker, 0, 1);
    const w = 0.27 * R * (1 + 0.35 * Math.max(smile, 0) - 0.45 * pucker) * (1 - 0.15 * open);
    const cy = -0.56 * R, cx = f.mouthShift * 0.025 * u;
    const lift = smile * 0.045 * u;
    const topH = (0.003 + 0.014 * open) * u, botH = (0.003 + 0.12 * open + 0.02 * pucker) * u;
    const put = (i: number, x: number, y: number, rad: number) => {
      pos.setXYZ(i, x, y, Math.sqrt(Math.max(0, rad * rad - x * x - y * y)));
    };
    const showTeeth = open > 0.12 && smile > 0.15 ? 1 : 0;
    const showTongue = open > 0.3 ? 1 : 0;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1, bulge = Math.pow(1 - t * t, 0.75);
      const x = cx + t * w, base = cy + lift * t * t;
      const yT = base + topH * bulge, yB = base - botH * bulge, gap = yT - yB;
      put(i * 2, x, yT, R * 1.01); put(i * 2 + 1, x, yB, R * 1.01);
      // tongue: lower middle of the opening
      const tx = cx + t * w * 0.62, tb = Math.pow(1 - t * t, 0.6) * showTongue;
      const tBot = cy + lift * 0.4 - botH * 0.96 * Math.pow(1 - (t * 0.62) ** 2, 0.75);
      put(vPer + i * 2, tx, tBot + botH * 0.42 * tb, R * 1.016); put(vPer + i * 2 + 1, tx, tBot, R * 1.016);
      // teeth: a band under the top lip
      const tt = showTeeth * Math.min(gap * 0.3, 0.02 * u);
      const xx = cx + t * w * 0.88, bb = Math.pow(1 - (t * 0.88) ** 2, 0.75);
      const yTop2 = cy + lift * (t * 0.88) ** 2 + topH * bb;
      put(vPer * 2 + i * 2, xx, yTop2, R * 1.02); put(vPer * 2 + i * 2 + 1, xx, yTop2 - tt * bb, R * 1.02);
      // lips: full in the middle, tapering to the corners, with a soft dip in the top lip
      const lipW = Math.pow(1 - t * t, 0.55);
      const tU = 0.065 * R * lipW * (1 - 0.3 * Math.exp(-((t / 0.16) ** 2))) * (1 - 0.3 * Math.max(smile, 0));
      const tL = 0.09 * R * lipW * (1 - 0.25 * Math.max(smile, 0));
      put(vPer * 3 + i * 2, x, yT + tU, R * 1.009); put(vPer * 3 + i * 2 + 1, x, yT, R * 1.009);
      put(vPer * 4 + i * 2, x, yB, R * 1.009); put(vPer * 4 + i * 2 + 1, x, yB - tL, R * 1.009);
    }
    pos.needsUpdate = true;
  }

  /** Simple springy hair: each strand is a chain of beads hanging from the head. */
  private stepHair(p: Pose, up: THREE.Vector3, dt: number) {
    if (this.chains.length === 0) return;
    this.head.updateMatrix();
    const hs = p.headScale, headR = P.headR * hs * 1.03;
    const chest = tB.copy(p.shC).addScaledVector(up, -0.16 * (p.shC.distanceTo(p.hipC) / P.torso));
    const chestR = 0.21 * Math.max(p.k, 0.2) * (p.shL.distanceTo(p.shR) / (P.shoulderHalf * 2 * Math.max(p.k, 0.2))) ** 0.5;
    const shoulderR = 0.075 * Math.max(p.k, 0.2);
    const g = 4.2 * hs * Math.min(dt, 0.033) ** 2 * 3600 * 0.0006;
    const a = new THREE.Vector3(), d = new THREE.Vector3();
    const push = (pt: THREE.Vector3, c: THREE.Vector3, r: number) => {
      d.subVectors(pt, c);
      const dist = d.length() || 1e-5;
      if (dist < r) pt.addScaledVector(d, (r - dist) / dist);
    };
    for (const c of this.chains) {
      a.copy(c.anchor).applyMatrix4(this.head.matrix);
      const sp = c.spacing * hs;
      if (!c.init || c.pts[0].distanceTo(a) > 2 * hs) {
        c.pts.forEach((pt, i) => { pt.copy(a); pt.y -= i * sp; c.prev[i].copy(pt); });
        c.init = true;
      }
      if (c.stiffness > 0) {
        // A single springy bun that trails the head slightly.
        c.pts[0].lerp(a, c.stiffness + 0.25);
      } else {
        c.pts[0].copy(a);
        for (let i = 1; i < c.pts.length; i++) {
          const pt = c.pts[i], pv = c.prev[i];
          d.subVectors(pt, pv).multiplyScalar(0.9);
          pv.copy(pt);
          pt.add(d); pt.y -= g;
        }
        for (let it = 0; it < 3; it++) {
          for (let i = 1; i < c.pts.length; i++) {
            const pt = c.pts[i];
            d.subVectors(pt, c.pts[i - 1]);
            const len = d.length() || 1e-5;
            pt.addScaledVector(d, (sp - len) / len);
            const r = c.radii[i] * hs * 0.6;
            push(pt, p.headC, headR + r);
            push(pt, chest, chestR + r);
            push(pt, p.shL, shoulderR + r);
            push(pt, p.shR, shoulderR + r);
          }
        }
      }
      c.meshes.forEach((m, i) => { m.position.copy(c.pts[i]); m.scale.setScalar(hs); });
    }
    this.hair?.update(this.chains, p.headC, p.headQuat, P.headR * hs);
  }
}
