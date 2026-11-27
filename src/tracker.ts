// Camera tracking. Wraps MediaPipe's pose and face models and turns their raw
// output into a smoothed, mirrored state the character can follow.
// Everything runs on this computer. No frame ever leaves the page.
import { FilesetResolver, FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { Matrix4, Quaternion, Vector3 } from 'three';

/** MediaPipe pose landmark indices. "L" and "R" here are the person's own left and right. */
export const LM = {
  nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8,
  shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16,
  indexL: 19, indexR: 20, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28, heelL: 29, heelR: 30, toeL: 31, toeR: 32,
} as const;

/** Face expression values, already mirrored into the character's left and right. */
export interface FaceState {
  blinkL: number; blinkR: number;
  jawOpen: number; smile: number; pucker: number; mouthShift: number;
  browUpL: number; browUpR: number; browDownL: number; browDownR: number;
  gazeX: number; gazeY: number;
}

export interface TrackState {
  hasPose: boolean;
  hasFace: boolean;
  /** Normalized image coordinates (0..1, origin top left, not mirrored). */
  lm2d: Vector3[];
  vis: number[];
  /** Mirrored 3D points in metres, three.js axes (x right, y up, z toward viewer), hip centred. */
  world: Vector3[];
  face: FaceState;
  /** Mirrored head rotation from the face model. */
  headQuat: Quaternion;
  frameW: number; frameH: number;
}

export type FrameSource = HTMLVideoElement | HTMLCanvasElement;

/** One Euro filter: steady when still, quick when moving. */
class OneEuro {
  private x = 0; private dx = 0; private t = -1;
  constructor(private minCutoff: number, private beta: number, private dCutoff = 1) {}
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  reset() { this.t = -1; }
  filter(v: number, t: number): number {
    if (this.t < 0) { this.x = v; this.dx = 0; this.t = t; return v; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const dRaw = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}

class OneEuro3 {
  private f: OneEuro[];
  constructor(minCutoff: number, beta: number) {
    this.f = [0, 1, 2].map(() => new OneEuro(minCutoff, beta));
  }
  reset() { this.f.forEach((f) => f.reset()); }
  filter(out: Vector3, x: number, y: number, z: number, t: number) {
    out.set(this.f[0].filter(x, t), this.f[1].filter(y, t), this.f[2].filter(z, t));
  }
}

/**
 * Turns the face model's raw blink score into how closed the eye is (0 open, 1 shut).
 * Raw scores vary a lot between people: open eyes can rest at 0.05 or at 0.3 (glasses,
 * looking down at a laptop), and closed eyes may only reach 0.4. So each eye learns its
 * own resting level: it follows new lows quickly and creeps up only slowly, and a clear
 * rise above it counts as closed.
 */
export class BlinkCalibrator {
  private rest = 0.12;
  update(raw: number): number {
    const rate = raw < this.rest ? 0.25 : 0.004;
    this.rest = Math.min(0.4, this.rest + (raw - this.rest) * rate);
    const lo = this.rest + 0.1, hi = this.rest + 0.3;
    const t = Math.min(1, Math.max(0, (raw - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  }
  reset() { this.rest = 0.12; }
}

const neutralFace = (): FaceState => ({
  blinkL: 0, blinkR: 0, jawOpen: 0, smile: 0.25, pucker: 0, mouthShift: 0,
  browUpL: 0, browUpR: 0, browDownL: 0, browDownR: 0, gazeX: 0, gazeY: 0,
});

export class Tracker {
  state: TrackState = {
    hasPose: false, hasFace: false,
    lm2d: Array.from({ length: 33 }, () => new Vector3()),
    vis: new Array(33).fill(0),
    world: Array.from({ length: 33 }, () => new Vector3()),
    face: neutralFace(),
    headQuat: new Quaternion(),
    frameW: 1280, frameH: 720,
  };
  ready = false;
  /** Rolling cost of one tracking pass, in milliseconds. */
  costMs = 0;

  private pose!: PoseLandmarker;
  private faceLm!: FaceLandmarker;
  private f2d = Array.from({ length: 33 }, () => new OneEuro3(1.2, 6.0));
  private f3d = Array.from({ length: 33 }, () => new OneEuro3(0.9, 3.0));
  private faceCanvas = document.createElement('canvas');
  private faceCtx = this.faceCanvas.getContext('2d')!;
  private crop = { x: 0.5, y: 0.5, s: 0 };
  private lastTs = 0;
  private poseMisses = 0;
  private faceMisses = 0;
  private rawFace = neutralFace();
  private blinkCalL = new BlinkCalibrator(); private blinkCalR = new BlinkCalibrator();
  private rawQuat = new Quaternion();
  private m4 = new Matrix4();

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    const make = async (delegate: 'GPU' | 'CPU') => {
      this.pose = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/pose_landmarker_full.task`, delegate },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      this.faceLm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`, delegate },
        runningMode: 'VIDEO', numFaces: 1,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
    };
    try { await make('GPU'); } catch (err) {
      console.warn('GPU tracking unavailable, using CPU', err);
      await make('CPU');
    }
    this.faceCanvas.width = this.faceCanvas.height = 320;
    this.ready = true;
  }

  /** Forget the previous person, for example after switching camera. */
  reset() {
    this.blinkCalL.reset(); this.blinkCalR.reset();
    this.f2d.forEach((f) => f.reset());
    this.f3d.forEach((f) => f.reset());
    this.crop.s = 0;
    this.state.hasPose = this.state.hasFace = false;
  }

  update(src: FrameSource, w: number, h: number) {
    if (!this.ready || w === 0 || h === 0) return;
    const t0 = performance.now();
    const ts = Math.max(this.lastTs + 1, t0);
    this.lastTs = ts;
    const t = ts / 1000;
    const s = this.state;
    s.frameW = w; s.frameH = h;

    // ---- body ----
    const pr = this.pose.detectForVideo(src, ts);
    if (pr.landmarks.length > 0 && pr.worldLandmarks.length > 0) {
      const l2 = pr.landmarks[0], l3 = pr.worldLandmarks[0];
      for (let i = 0; i < 33; i++) {
        this.f2d[i].filter(s.lm2d[i], l2[i].x, l2[i].y, l2[i].z, t);
        // Point inversion mirrors the pose and converts to three.js axes in one step.
        this.f3d[i].filter(s.world[i], -l3[i].x, -l3[i].y, -l3[i].z, t);
        s.vis[i] += ((l2[i].visibility ?? 1) - s.vis[i]) * 0.4;
      }
      s.hasPose = true; this.poseMisses = 0;
    } else if (++this.poseMisses > 8) {
      if (s.hasPose) { this.f2d.forEach((f) => f.reset()); this.f3d.forEach((f) => f.reset()); }
      s.hasPose = false;
    }

    // ---- face ----
    // When the body is in view the face is usually small in the frame, so the
    // face model gets a zoomed crop around the head instead of the whole picture.
    let faceSrc: FrameSource = src;
    const headSeen = s.hasPose && s.vis[LM.nose] > 0.5;
    if (headSeen) {
      const eL = s.lm2d[LM.earL], eR = s.lm2d[LM.earR], n = s.lm2d[LM.nose];
      const shL = s.lm2d[LM.shoulderL], shR = s.lm2d[LM.shoulderR];
      const earPx = Math.hypot((eL.x - eR.x) * w, (eL.y - eR.y) * h);
      const shPx = Math.hypot((shL.x - shR.x) * w, (shL.y - shR.y) * h);
      const size = Math.max(earPx * 3.0, shPx * 1.1, 48);
      const cx = ((eL.x + eR.x) / 2 * 0.5 + n.x * 0.5) * w;
      const cy = ((eL.y + eR.y) / 2 * 0.5 + n.y * 0.5) * h;
      const c = this.crop;
      if (c.s === 0) { c.x = cx; c.y = cy; c.s = size; }
      else { c.x += (cx - c.x) * 0.5; c.y += (cy - c.y) * 0.5; c.s += (size - c.s) * 0.2; }
      const cw = this.faceCanvas.width;
      this.faceCtx.fillStyle = '#000';
      this.faceCtx.fillRect(0, 0, cw, cw);
      this.faceCtx.drawImage(src, c.x - c.s / 2, c.y - c.s / 2, c.s, c.s, 0, 0, cw, cw);
      faceSrc = this.faceCanvas;
    } else {
      this.crop.s = 0;
    }
    const fr = this.faceLm.detectForVideo(faceSrc, ts);
    if (fr.faceBlendshapes.length > 0 && fr.facialTransformationMatrixes.length > 0) {
      const b: Record<string, number> = {};
      for (const c of fr.faceBlendshapes[0].categories) b[c.categoryName] = c.score;
      const g = (k: string) => b[k] ?? 0;
      const r = this.rawFace;
      // The person's left side becomes the character's right side, like a mirror.
      r.blinkR = this.blinkCalR.update(g('eyeBlinkLeft')); r.blinkL = this.blinkCalL.update(g('eyeBlinkRight'));
      r.jawOpen = g('jawOpen');
      r.smile = (g('mouthSmileLeft') + g('mouthSmileRight')) / 2 - (g('mouthFrownLeft') + g('mouthFrownRight')) / 2;
      r.pucker = Math.max(g('mouthPucker'), g('mouthFunnel') * 0.8);
      r.mouthShift = g('mouthRight') - g('mouthLeft');
      const inner = g('browInnerUp');
      r.browUpR = Math.max(inner, g('browOuterUpLeft')); r.browUpL = Math.max(inner, g('browOuterUpRight'));
      r.browDownR = g('browDownLeft'); r.browDownL = g('browDownRight');
      r.gazeX = (g('eyeLookInLeft') - g('eyeLookOutLeft') + g('eyeLookOutRight') - g('eyeLookInRight')) / 2;
      r.gazeY = (g('eyeLookUpLeft') + g('eyeLookUpRight') - g('eyeLookDownLeft') - g('eyeLookDownRight')) / 2;
      this.m4.fromArray(fr.facialTransformationMatrixes[0].data);
      this.rawQuat.setFromRotationMatrix(this.m4);
      // Mirror the rotation across the vertical plane.
      this.rawQuat.set(this.rawQuat.x, -this.rawQuat.y, -this.rawQuat.z, this.rawQuat.w);
      s.hasFace = true; this.faceMisses = 0;
    } else if (++this.faceMisses > 10) {
      s.hasFace = false;
      Object.assign(this.rawFace, neutralFace());
    }
    // Light smoothing. Blinks stay snappy, everything else eases.
    const f = s.face, r = this.rawFace;
    for (const k of Object.keys(f) as (keyof FaceState)[]) {
      const a = k === 'blinkL' || k === 'blinkR' ? 0.8 : k === 'jawOpen' ? 0.65 : 0.4;
      f[k] += (r[k] - f[k]) * a;
    }
    if (s.hasFace) s.headQuat.slerp(this.rawQuat, 0.45);

    this.costMs += (performance.now() - t0 - this.costMs) * 0.1;
  }
}
