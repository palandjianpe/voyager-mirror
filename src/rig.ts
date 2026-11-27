// Turns tracking data into joint positions for the character.
// Puppet mode: the character keeps her own proportions and copies directions.
// Overlay mode: joints sit exactly on the person in the camera picture.
import { Matrix4, Quaternion, Vector3 } from 'three';
import { LM, type TrackState } from './tracker';
import { P, type Pose } from './character';

// The character mirrors the person, so her left side follows the person's right side.
const C = {
  shL: LM.shoulderR, shR: LM.shoulderL, elL: LM.elbowR, elR: LM.elbowL,
  wrL: LM.wristR, wrR: LM.wristL, inL: LM.indexR, inR: LM.indexL,
  hipL: LM.hipR, hipR: LM.hipL, knL: LM.kneeR, knR: LM.kneeL,
  anL: LM.ankleR, anR: LM.ankleL, heL: LM.heelR, heR: LM.heelL,
  toL: LM.toeR, toR: LM.toeL, earL: LM.earR, earR: LM.earL,
};

const UP = new Vector3(0, 1, 0);
const a = new Vector3(), b = new Vector3(), c = new Vector3();
const m4 = new Matrix4(), q = new Quaternion();
const smooth = (x: number, lo: number, hi: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

export type MapFn = (u: number, v: number, out: Vector3) => Vector3;

export class Rig {
  /** True for one frame when the person lands from a jump. */
  landed = false;
  airborne = false;
  legsSeen = false;

  private baseline = -1;
  private rootX = 0;
  private lift = 0;
  private scale3 = 0;
  private headFallback = new Quaternion();

  /** Head rotation estimated from the pose alone, for when the face model has no lock. */
  private poseHead(s: TrackState, out: Quaternion) {
    const W = s.world;
    const x = a.subVectors(W[C.earL], W[C.earR]);
    if (x.lengthSq() < 1e-6) return out.identity();
    x.normalize();
    const mid = b.addVectors(W[C.earL], W[C.earR]).multiplyScalar(0.5);
    const f = c.subVectors(W[LM.nose], mid);
    f.addScaledVector(x, -f.dot(x));
    if (f.lengthSq() < 1e-6) return out.identity();
    f.normalize();
    const y = new Vector3().crossVectors(f, x).normalize();
    m4.makeBasis(x, y, f);
    out.setFromRotationMatrix(m4);
    // The nose sits below ear level, so tip the estimate back up.
    return out.multiply(q.setFromAxisAngle(new Vector3(1, 0, 0), -0.42));
  }

  private headQuat(s: TrackState, out: Quaternion, dt: number) {
    if (s.hasFace) { this.headFallback.copy(s.headQuat); return out.copy(s.headQuat); }
    if (s.hasPose && s.vis[LM.nose] > 0.5) {
      this.poseHead(s, q.identity());
      this.headFallback.slerp(q, Math.min(1, dt * 10));
    } else {
      this.headFallback.slerp(q.identity(), Math.min(1, dt * 3));
    }
    return out.copy(this.headFallback);
  }

  /** Watches the hips in the picture to spot jumps. Returns lift in torso lengths. */
  private jump(s: TrackState, dt: number) {
    this.landed = false;
    const L = s.lm2d;
    if (!s.hasPose || Math.min(s.vis[C.hipL], s.vis[C.hipR]) < 0.5) { this.baseline = -1; this.airborne = false; return 0; }
    const hipY = (L[C.hipL].y + L[C.hipR].y) / 2;
    const shY = (L[C.shL].y + L[C.shR].y) / 2;
    const torso = Math.max(0.03, hipY - shY);
    if (this.baseline < 0) this.baseline = hipY;
    const up = (this.baseline - hipY) / torso;
    const was = this.airborne;
    this.airborne = up > (was ? 0.14 : 0.24);
    if (!this.airborne) this.baseline += (hipY - this.baseline) * Math.min(1, dt * (hipY > this.baseline ? 6 : 0.8));
    if (was && !this.airborne) this.landed = true;
    return Math.max(0, up - 0.1);
  }

  private legCheck(s: TrackState) {
    const v = Math.min(s.vis[C.knL], s.vis[C.knR]);
    this.legsSeen = s.hasPose && (this.legsSeen ? v > 0.35 : v > 0.6);
  }

  // ------------------------------------------------------------- puppet
  puppet(s: TrackState, p: Pose, dt: number, time: number) {
    if (!s.hasPose) return this.idle(s, p, dt, time);
    const W = s.world, vis = s.vis;
    const w = (i: number) => smooth(vis[i], 0.3, 0.65);
    this.legCheck(s);
    const hipsSeen = Math.min(vis[C.hipL], vis[C.hipR]) > 0.5;

    const shAxis = new Vector3().subVectors(W[C.shL], W[C.shR]);
    shAxis.z *= 0.7;
    if (shAxis.lengthSq() < 1e-6) shAxis.set(1, 0, 0);
    shAxis.normalize();
    const spine = new Vector3(), hipAxis = new Vector3();
    if (hipsSeen) {
      spine.addVectors(W[C.shL], W[C.shR]).sub(W[C.hipL]).sub(W[C.hipR]);
      spine.z *= 0.6; spine.normalize();
      hipAxis.subVectors(W[C.hipL], W[C.hipR]); hipAxis.z *= 0.7; hipAxis.normalize();
    } else {
      hipAxis.set(shAxis.x, 0, shAxis.z).normalize();
      spine.crossVectors(shAxis, a.crossVectors(UP, shAxis)).normalize();
      spine.lerp(UP, 0.5).normalize();
    }

    const dirTo = (out: Vector3, start: Vector3, iA: number, iB: number, len: number, rest: Vector3, weight: number) => {
      a.subVectors(W[iB], W[iA]); a.z *= 0.85;
      if (a.lengthSq() < 1e-8) a.copy(rest);
      a.normalize();
      b.copy(rest).normalize().lerp(a, weight).normalize();
      return out.copy(start).addScaledVector(b, len);
    };

    p.hipC.set(0, 0, 0);
    p.hipL.copy(hipAxis).multiplyScalar(P.hipHalf);
    p.hipR.copy(hipAxis).multiplyScalar(-P.hipHalf);
    p.shC.copy(spine).multiplyScalar(P.torso);
    p.shL.copy(p.shC).addScaledVector(shAxis, P.shoulderHalf);
    p.shR.copy(p.shC).addScaledVector(shAxis, -P.shoulderHalf);

    const restArmL = new Vector3(0.22, -1, 0.05), restArmR = new Vector3(-0.22, -1, 0.05);
    dirTo(p.elbowL, p.shL, C.shL, C.elL, P.upperArm, restArmL, w(C.elL));
    dirTo(p.elbowR, p.shR, C.shR, C.elR, P.upperArm, restArmR, w(C.elR));
    dirTo(p.wristL, p.elbowL, C.elL, C.wrL, P.foreArm, restArmL, w(C.wrL));
    dirTo(p.wristR, p.elbowR, C.elR, C.wrR, P.foreArm, restArmR, w(C.wrR));
    dirTo(p.handL, p.wristL, C.wrL, C.inL, P.hand, c.subVectors(p.wristL, p.elbowL).clone(), w(C.wrL) * 0.8);
    dirTo(p.handR, p.wristR, C.wrR, C.inR, P.hand, c.subVectors(p.wristR, p.elbowR).clone(), w(C.wrR) * 0.8);

    const lw = this.legsSeen ? 1 : 0;
    const restLegL = new Vector3(0.05, -1, 0), restLegR = new Vector3(-0.05, -1, 0);
    dirTo(p.kneeL, p.hipL, C.hipL, C.knL, P.upperLeg, restLegL, lw * w(C.knL));
    dirTo(p.kneeR, p.hipR, C.hipR, C.knR, P.upperLeg, restLegR, lw * w(C.knR));
    dirTo(p.ankleL, p.kneeL, C.knL, C.anL, P.lowerLeg, restLegL, lw * w(C.anL));
    dirTo(p.ankleR, p.kneeR, C.knR, C.anR, P.lowerLeg, restLegR, lw * w(C.anR));
    dirTo(p.toeL, p.ankleL, C.heL, C.toL, P.foot, new Vector3(0.3, -0.1, 1), lw * w(C.toL) * 0.7);
    dirTo(p.toeR, p.ankleR, C.heR, C.toR, P.foot, new Vector3(-0.3, -0.1, 1), lw * w(C.toR) * 0.7);

    // Stand on the ground: the lower foot touches the floor, so crouching works too.
    const lift = this.jump(s, dt);
    this.lift += (lift * P.torso * 1.4 - this.lift) * Math.min(1, dt * 18);
    const u = hipsSeen ? (s.lm2d[C.hipL].x + s.lm2d[C.hipR].x) / 2 : (s.lm2d[C.shL].x + s.lm2d[C.shR].x) / 2;
    const wantX = Math.max(-1.5, Math.min(1.5, (0.5 - u) * 3.2));
    this.rootX += (wantX - this.rootX) * Math.min(1, dt * 8);
    const root = new Vector3(this.rootX, P.ankleH - Math.min(p.ankleL.y, p.ankleR.y) + this.lift, 0);
    for (const k of ['hipC', 'hipL', 'hipR', 'shC', 'shL', 'shR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'handL', 'handR',
      'kneeL', 'kneeR', 'ankleL', 'ankleR', 'toeL', 'toeR'] as const) p[k].add(root);

    this.headQuat(s, p.headQuat, dt);
    const neck = a.copy(p.shC).addScaledVector(spine, P.neck);
    p.headC.copy(neck).addScaledVector(b.set(0, 1, 0).applyQuaternion(p.headQuat), P.headR * 0.9);
    p.k = 1; p.headScale = 1; p.legsVisible = true;
  }

  /** Nobody in view: stand, breathe and sway gently. */
  idle(s: TrackState, p: Pose, dt: number, time: number) {
    this.landed = false; this.airborne = false; this.legsSeen = false;
    this.rootX += (0 - this.rootX) * Math.min(1, dt * 2);
    const sway = Math.sin(time * 1.3) * 0.03, breathe = Math.sin(time * 2.1) * 0.006;
    const hipY = P.ankleH + P.lowerLeg + P.upperLeg;
    p.hipC.set(this.rootX, hipY, 0);
    p.hipL.set(this.rootX + P.hipHalf, hipY, 0); p.hipR.set(this.rootX - P.hipHalf, hipY, 0);
    p.shC.set(this.rootX + sway, hipY + P.torso + breathe, 0);
    p.shL.copy(p.shC).add(a.set(P.shoulderHalf, 0, 0)); p.shR.copy(p.shC).add(a.set(-P.shoulderHalf, 0, 0));
    const swing = Math.sin(time * 1.3 + 1) * 0.05;
    p.elbowL.copy(p.shL).add(a.set(0.08 + swing, -P.upperArm, 0.02)); p.elbowR.copy(p.shR).add(a.set(-0.08 + swing, -P.upperArm, 0.02));
    p.wristL.copy(p.elbowL).add(a.set(0.04, -P.foreArm, 0.05)); p.wristR.copy(p.elbowR).add(a.set(-0.04, -P.foreArm, 0.05));
    p.handL.copy(p.wristL).add(a.set(0, -P.hand, 0.02)); p.handR.copy(p.wristR).add(a.set(0, -P.hand, 0.02));
    p.kneeL.set(this.rootX + P.hipHalf + 0.01, P.ankleH + P.lowerLeg, 0.01); p.kneeR.set(this.rootX - P.hipHalf - 0.01, P.ankleH + P.lowerLeg, 0.01);
    p.ankleL.set(this.rootX + P.hipHalf + 0.02, P.ankleH, 0); p.ankleR.set(this.rootX - P.hipHalf - 0.02, P.ankleH, 0);
    p.toeL.copy(p.ankleL).add(a.set(0.04, -0.01, P.foot)); p.toeR.copy(p.ankleR).add(a.set(-0.04, -0.01, P.foot));
    this.headQuat(s, p.headQuat, dt);
    if (!s.hasFace) p.headQuat.multiply(q.setFromAxisAngle(new Vector3(0, 0, 1), Math.sin(time * 0.9) * 0.06));
    p.headC.copy(p.shC).add(a.set(0, P.neck, 0)).addScaledVector(b.set(0, 1, 0).applyQuaternion(p.headQuat), P.headR * 0.9);
    p.k = 1; p.headScale = 1; p.legsVisible = true;
  }

  // -------------------------------------------------------------- face
  /**
   * Face only, for holding the phone up close. The body may be out of view, so she
   * stands relaxed and breathing while her head and expressions follow your face.
   */
  puppetFace(s: TrackState, p: Pose, dt: number, time: number) {
    this.idle(s, p, dt, time);
  }

  /** Face only in overlay mode: her head sits on your face, shoulders scaled to match. */
  overlayFace(s: TrackState, p: Pose, map: MapFn, dt: number, time: number): boolean {
    if (!s.hasFace || s.faceBox.w <= 0) return false;
    const fb = s.faceBox;
    map(fb.x - fb.w / 2, fb.y, a); map(fb.x + fb.w / 2, fb.y, b);
    const faceW = a.distanceTo(b);
    map(fb.x, fb.y, c);
    this.idle(s, p, dt, time);
    const headR = faceW * 0.66, k = headR / P.headR;
    // Move the relaxed body so her head lands on the face, scaled to its size.
    const from = p.headC.clone();
    const to = c.clone(); to.y += headR * 0.1; to.z = 0;
    for (const key of ['hipC', 'hipL', 'hipR', 'shC', 'shL', 'shR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'handL', 'handR',
      'kneeL', 'kneeR', 'ankleL', 'ankleR', 'toeL', 'toeR', 'headC'] as const) p[key].sub(from).multiplyScalar(k).add(to);
    p.k = k; p.headScale = k; p.legsVisible = false;
    return true;
  }

  // ------------------------------------------------------------ overlay
  /** Returns false when there is nobody to dress up. */
  overlay(s: TrackState, p: Pose, map: MapFn, dt: number): boolean {
    this.jump(s, dt);
    if (!s.hasPose) return false;
    this.legCheck(s);
    const W = s.world, L = s.lm2d;
    const J = (i: number, out: Vector3) => { map(L[i].x, L[i].y, out); out.z = W[i].z * this.scale3; return out; };

    // Picture units per metre, from segments that are rarely foreshortened together.
    let sum2 = 0, sum3 = 0;
    for (const [i, j] of [[C.shL, C.shR], [C.hipL, C.hipR], [C.shL, C.hipL], [C.shR, C.hipR], [C.shL, C.elL], [C.shR, C.elR]]) {
      if (Math.min(s.vis[i], s.vis[j]) < 0.5) continue;
      map(L[i].x, L[i].y, a); map(L[j].x, L[j].y, b);
      sum2 += Math.hypot(a.x - b.x, a.y - b.y);
      sum3 += Math.hypot(W[i].x - W[j].x, W[i].y - W[j].y);
    }
    if (sum3 > 0.05) {
      const sc = sum2 / sum3;
      this.scale3 = this.scale3 === 0 ? sc : this.scale3 + (sc - this.scale3) * Math.min(1, dt * 5);
    }
    if (this.scale3 === 0) return false;

    J(C.shL, p.shL); J(C.shR, p.shR); J(C.hipL, p.hipL); J(C.hipR, p.hipR);
    p.shC.addVectors(p.shL, p.shR).multiplyScalar(0.5);
    p.hipC.addVectors(p.hipL, p.hipR).multiplyScalar(0.5);
    const shW = p.shL.distanceTo(p.shR);
    const k = Math.max(0.05, (shW / (P.shoulderHalf * 2)) * 0.82);
    // Hip landmarks sit high and narrow on a real body, so nudge the costume hips out a little.
    a.subVectors(p.hipL, p.hipR).multiplyScalar(0.12); p.hipL.add(a); p.hipR.sub(a);

    J(C.elL, p.elbowL); J(C.elR, p.elbowR); J(C.wrL, p.wristL); J(C.wrR, p.wristR);
    J(C.knL, p.kneeL); J(C.knR, p.kneeR); J(C.anL, p.ankleL); J(C.anR, p.ankleR);
    J(C.toL, p.toeL); J(C.toR, p.toeR);
    for (const [hand, wr, idx] of [[p.handL, p.wristL, C.inL], [p.handR, p.wristR, C.inR]] as const) {
      J(idx, a).sub(wr);
      if (a.lengthSq() < 1e-8) a.set(0, -1, 0);
      hand.copy(wr).addScaledVector(a.normalize(), P.hand * k);
    }

    this.headQuat(s, p.headQuat, dt);
    J(C.earL, a); J(C.earR, b);
    const earW = W[C.earL].distanceTo(W[C.earR]) * this.scale3;
    const headR = Math.max(earW * 0.92, shW * 0.4);
    p.headScale = headR / P.headR;
    p.headC.addVectors(a, b).multiplyScalar(0.5);
    p.headC.y += headR * 0.12;
    p.headC.z += headR * 0.2;
    p.k = k;
    p.legsVisible = this.legsSeen;
    return true;
  }
}
