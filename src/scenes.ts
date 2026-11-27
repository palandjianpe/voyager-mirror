// Puppet mode backdrops: a cartoon beach, a raft on the open ocean and a starry night shore,
// plus two real beaches from 360° photos (CC0, Poly Haven; see public/scenes/CREDITS.txt).
import * as THREE from 'three';

export type SceneName = 'beach' | 'ocean' | 'night' | 'photo-sunny' | 'photo-sunrise';
export const SCENES: { id: SceneName; label: string }[] = [
  { id: 'beach', label: 'Beach' }, { id: 'ocean', label: 'Raft' }, { id: 'night', label: 'Night' },
  { id: 'photo-sunny', label: 'Sunny beach' }, { id: 'photo-sunrise', label: 'Sunrise' },
];

/**
 * A real place from a 360° photo. `face` is the photo column (0..1, left to right) she stands
 * in front of; `sun` is where the sun or main light sits in the photo (column, row from the top),
 * so she is lit from the same side. `height` is how high the photo's camera was above the sand.
 */
interface Photo { file: string; face: number; sun: [number, number]; height: number; sand: string }
const PHOTOS: Partial<Record<SceneName, Photo>> = {
  'photo-sunny': { file: `${import.meta.env.BASE_URL}scenes/sunny-beach.jpg`, face: 0.22, sun: [0.6, 0.356], height: 1.7, sand: '#c9ad7e' },
  'photo-sunrise': { file: `${import.meta.env.BASE_URL}scenes/sunrise-beach.jpg`, face: 0.62, sun: [0.6, 0.486], height: 1.7, sand: '#b4895c' },
};

/**
 * Wraps a 360° photo around the scene with its lower half laid flat as the ground, so she
 * stands on the photographed sand. Each vertex keeps the direction it had on the sphere,
 * and the photo is looked up along that direction (turned by `uTurn`).
 */
function photoDome(tex: THREE.Texture, height: number, face: number) {
  const radius = 60, g = new THREE.SphereGeometry(radius, 96, 48);
  const pos = g.attributes.position as THREE.BufferAttribute, dir = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  const y1 = (-height * 3) / 2;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.clone().normalize().toArray(dir, i * 3);
    // Same flattening as three.js's ground-projected skybox: below the horizon the sphere
    // bends into a floor `height` below the centre.
    if (v.y < 0) {
      const f = v.y < y1 ? -height / v.y : 1 - (v.y * v.y) / (3 * y1 * y1);
      v.multiplyScalar(f);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.setAttribute('dir', new THREE.BufferAttribute(dir, 3));
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uMap: { value: tex }, uTurn: { value: (face - 0.25) * Math.PI * 2 } },
    vertexShader: `attribute vec3 dir; varying vec3 vDir;
      void main(){ vDir = dir; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uTurn; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float c = cos(uTurn), s = sin(uTurn);
        d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
        vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        gl_FragColor = texture2D(uMap, uv);
        #include <colorspace_fragment>
      }`,
  }));
  m.position.y = height;
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

interface Lighting { sky: number; ground: number; hemi: number; sun: number; sunI: number }
const LIGHT: Record<SceneName | 'overlay', Lighting> = {
  beach: { sky: 0xffffff, ground: 0xe8c9a0, hemi: 1.25, sun: 0xfff2d6, sunI: 1.5 },
  ocean: { sky: 0xffffff, ground: 0x9fd8e8, hemi: 1.25, sun: 0xfff2d6, sunI: 1.5 },
  night: { sky: 0xaab4ff, ground: 0x4a3f78, hemi: 1.35, sun: 0xcfd8ff, sunI: 1.0 },
  'photo-sunny': { sky: 0xffffff, ground: 0xe9d6b0, hemi: 1.2, sun: 0xfff4e0, sunI: 1.6 },
  'photo-sunrise': { sky: 0xffdcc8, ground: 0xc9a080, hemi: 1.1, sun: 0xffb27a, sunI: 1.35 },
  overlay: { sky: 0xffffff, ground: 0xd8d0c8, hemi: 1.3, sun: 0xffffff, sunI: 1.4 },
};

function gradient(stops: [number, string][]) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function water(shallow: string, deep: string, horizon: string, glow: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uShallow: { value: new THREE.Color(shallow) }, uDeep: { value: new THREE.Color(deep) },
      uHorizon: { value: new THREE.Color(horizon) }, uGlow: { value: glow },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uGlow; uniform vec3 uShallow, uDeep, uHorizon; varying vec3 vW;
      void main(){
        float d = clamp((-vW.z + 2.0) / 45.0, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.5, d));
        float band = sin(vW.z * 2.6 - uTime * 1.1 + sin(vW.x * 0.7 + uTime * 0.35) * 1.4) * 0.5 + 0.5;
        float foam = smoothstep(0.86, 0.98, band) * (1.0 - smoothstep(0.0, 0.6, d));
        col = mix(col, vec3(1.0), foam * (0.55 - 0.3 * uGlow));
        vec2 cell = vW.xz * 5.0; vec2 id = floor(cell); vec2 f = fract(cell) - 0.5;
        float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        float tw = step(0.93, h) * (0.5 + 0.5 * sin(uTime * 2.5 + h * 60.0)) * smoothstep(0.3, 0.05, length(f));
        col += uGlow * tw * vec3(0.35, 1.0, 0.9) * (1.0 - d);
        col = mix(col, uHorizon, smoothstep(0.55, 1.0, d));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

const flat = (color: string | number) => new THREE.MeshBasicMaterial({ color });
const lit = (color: string | number) => new THREE.MeshLambertMaterial({ color });

function cloud(x: number, y: number, z: number, s: number) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (const [dx, dy, r] of [[0, 0, 1], [1.1, 0.1, 0.8], [-1.1, 0.05, 0.75], [0.4, 0.45, 0.7]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m); b.position.set(dx, dy, 0); b.scale.set(1.3, 0.62, 0.5); g.add(b);
  }
  g.position.set(x, y, z); g.scale.setScalar(s);
  return g;
}

export class Backdrop {
  readonly group = new THREE.Group();
  readonly shadow: THREE.Mesh;
  name: SceneName = 'beach';
  background: THREE.Texture | null = null;
  bobY = 0; bobRoll = 0;
  /** Height of the sea surface in the current scene. */
  get seaY() { return this.name === 'ocean' ? -0.14 : -0.03; }
  /** The cartoon scenes have a 3D sea that fish can leap from and spray can rise off. */
  get seaFx() { return !PHOTOS[this.name]; }
  /** Colour of footprints, or null where there is no sand to step in. */
  get sand(): string | null { return PHOTOS[this.name]?.sand ?? (this.name === 'night' ? '#5e5384' : this.name === 'beach' ? '#d2b06e' : null); }

  private sets: Record<SceneName, THREE.Group>;
  private bgs: Record<SceneName, THREE.Texture>;
  private waters: THREE.ShaderMaterial[] = [];
  private clouds: THREE.Object3D[] = [];
  private raft!: THREE.Group;
  private foam!: THREE.Mesh;
  private flies!: THREE.Points;
  private palmTop!: THREE.Group;

  constructor(private hemi: THREE.HemisphereLight, private sun: THREE.DirectionalLight) {
    this.bgs = {
      beach: gradient([[0, '#4fb4ec'], [0.55, '#a9e0f7'], [0.75, '#e4f6fd'], [1, '#e4f6fd']]),
      ocean: gradient([[0, '#3fa6e6'], [0.55, '#a4dcf6'], [0.75, '#def3fc'], [1, '#def3fc']]),
      night: gradient([[0, '#070b2c'], [0.5, '#1e1a5c'], [0.75, '#4a3582'], [1, '#4a3582']]),
      // Shown for a moment while a photo loads.
      'photo-sunny': gradient([[0, '#3f8fe0'], [0.6, '#b6dcf5'], [1, '#e8dcc0']]),
      'photo-sunrise': gradient([[0, '#7a86c8'], [0.6, '#f3b48f'], [1, '#d9b38c']]),
    };
    this.sets = {
      beach: this.beach(), ocean: this.ocean(), night: this.night(),
      'photo-sunny': new THREE.Group(), 'photo-sunrise': new THREE.Group(),
    };
    for (const g of Object.values(this.sets)) this.group.add(g);

    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, 'rgba(0,0,0,0.38)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.012;
    this.group.add(this.shadow);
    this.set('beach');
  }

  set(name: SceneName) {
    if (!this.sets[name]) name = 'beach';
    this.name = name;
    for (const [k, g] of Object.entries(this.sets)) g.visible = k === name;
    this.background = this.bgs[name];
    this.light(name);
    const photo = PHOTOS[name];
    if (photo) {
      // Light her from the side the sun is on in the photo.
      const [u, row] = photo.sun, el = (0.5 - row) * Math.PI, az = (u - 0.5) * Math.PI * 2 - (photo.face - 0.25) * Math.PI * 2;
      this.sun.position.set(Math.cos(el) * Math.cos(az), Math.max(0.25, Math.sin(el)), Math.cos(el) * Math.sin(az)).multiplyScalar(6);
      const set = this.sets[name];
      if (set.children.length === 0) {
        new THREE.TextureLoader().load(photo.file, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;   // no mipmaps: no seam where the photo wraps
          set.add(photoDome(tex, photo.height, photo.face));
          if (this.name === name) this.background = null;
          this.onChange?.();
        });
      } else this.background = null;
    } else this.sun.position.set(2.5, 4, 5);
  }

  /** Called when a photo finishes loading, so the page can refresh the background. */
  onChange: (() => void) | null = null;

  light(kind: SceneName | 'overlay') {
    const L = LIGHT[kind];
    this.hemi.color.setHex(L.sky); this.hemi.groundColor.setHex(L.ground); this.hemi.intensity = L.hemi;
    this.sun.color.setHex(L.sun); this.sun.intensity = L.sunI;
  }

  private sea(shallow: string, deep: string, horizon: string, glow: number, zNear: number, y: number) {
    const m = water(shallow, deep, horizon, glow); this.waters.push(m);
    const depth = 90, mesh = new THREE.Mesh(new THREE.PlaneGeometry(240, depth), m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, y, zNear - depth / 2);
    return mesh;
  }

  private beach() {
    const g = new THREE.Group();
    g.add(this.sea('#58d6d2', '#1a86c4', '#bfe9fa', 0, -2.4, -0.03));
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(240, 14), lit('#f6dfa6'));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, 4.4); g.add(sand);
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(240, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.foam.rotation.x = -Math.PI / 2; this.foam.position.set(0, 0.006, -2.4); g.add(this.foam);
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), flat('#fff0a8')); sunDisc.position.set(13, 13, -70); g.add(sunDisc);
    for (const [x, y, s] of [[-16, 12, 2.2], [3, 15, 1.7], [22, 9, 2.0]]) { const c = cloud(x, y, -60, s); this.clouds.push(c); g.add(c); }

    // Palm tree with a curved trunk.
    const palm = new THREE.Group(), trunkM = lit('#9a6a3c');
    let px = 0, py = 0;
    for (let i = 0; i < 9; i++) {
      const lean = 0.05 + i * 0.035, seg = new THREE.Mesh(new THREE.CylinderGeometry(0.1 - i * 0.004, 0.115 - i * 0.004, 0.36, 10), trunkM);
      px += Math.sin(lean) * 0.17; py += Math.cos(lean) * 0.17;
      seg.position.set(px, py, 0); seg.rotation.z = -lean; palm.add(seg);
      px += Math.sin(lean) * 0.17; py += Math.cos(lean) * 0.17;
    }
    this.palmTop = new THREE.Group(); this.palmTop.position.set(px, py, 0);
    const leafM = new THREE.MeshLambertMaterial({ color: '#3fa858', side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const lg = new THREE.ConeGeometry(0.22, 1.5, 6); lg.translate(0, 0.75, 0); lg.scale(1, 1, 0.12);
      const leaf = new THREE.Mesh(lg, leafM), hold = new THREE.Group();
      leaf.rotation.z = -1.25 - (i % 2) * 0.25; hold.rotation.y = (i / 8) * Math.PI * 2; hold.add(leaf); this.palmTop.add(hold);
    }
    for (const [x, z] of [[0.1, 0.1], [-0.08, 0.08], [0, -0.12]]) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lit('#6b4526')); nut.position.set(x, -0.1, z); this.palmTop.add(nut);
    }
    palm.add(this.palmTop); palm.position.set(-2.5, 0, -1.3); palm.scale.setScalar(1.25); g.add(palm);

    // Sand castle, shells and a rock.
    const castle = new THREE.Group(), cm = lit('#e9c98a');
    for (const [x, z, h] of [[0, 0, 0.34], [0.3, 0.05, 0.24], [-0.28, 0.08, 0.22]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, h, 12), cm); t.position.set(x, h / 2, z); castle.add(t);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 12), cm); top.position.set(x, h + 0.07, z); castle.add(top);
    }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), new THREE.MeshBasicMaterial({ color: '#ff7a59', side: THREE.DoubleSide }));
    flag.position.set(0.06, 0.52, 0); castle.add(flag);
    castle.position.set(2.2, 0, -0.9); g.add(castle);
    const rock = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lit('#8f8a94')); rock.scale.set(1.3, 0.6, 1); rock.position.set(3.4, 0.05, -1.9); g.add(rock);
    for (const [x, z, c] of [[-1.4, 0.9, '#ffd0c2'], [1.5, 1.2, '#fff3e2'], [-0.6, 1.6, '#ffb38a']] as [number, number, string][]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), lit(c)); s.scale.set(1, 0.4, 0.8); s.position.set(x, 0.02, z); g.add(s);
    }
    return g;
  }

  private ocean() {
    const g = new THREE.Group();
    g.add(this.sea('#3fc4d4', '#1578bd', '#b9e6f8', 0, 12, -0.14));
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), flat('#fff0a8')); sunDisc.position.set(-14, 14, -70); g.add(sunDisc);
    for (const [x, y, s] of [[14, 13, 2.3], [-4, 16, 1.6], [-24, 10, 1.9]]) { const c = cloud(x, y, -60, s); this.clouds.push(c); g.add(c); }
    const isle = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 10), flat('#5fb388')); isle.scale.set(2.2, 0.5, 1); isle.position.set(20, -0.4, -62); g.add(isle);

    const raft = this.raft = new THREE.Group(), logM = lit('#b98450'), ropeM = lit('#e9d9b0');
    for (let i = 0; i < 9; i++) {
      const lg = new THREE.CylinderGeometry(0.105, 0.105, 2.1 + (i % 3) * 0.12, 10); lg.rotateX(Math.PI / 2);
      const log = new THREE.Mesh(lg, i % 2 ? logM : lit('#a87442')); log.position.set(-0.84 + i * 0.21, -0.1, -0.1); raft.add(log);
    }
    for (const z of [-0.85, 0.65]) {
      const rg = new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8); rg.rotateZ(Math.PI / 2);
      const rope = new THREE.Mesh(rg, ropeM); rope.position.set(0, 0.0, z); raft.add(rope);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.9, 10), lit('#8a5a34')); mast.position.set(-0.78, 1.4, -0.8); raft.add(mast);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1.35, 0); sh.lineTo(0, 2.1); sh.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshLambertMaterial({ color: '#fff7e0', side: THREE.DoubleSide }));
    sail.position.set(-0.72, 0.55, -0.8); raft.add(sail);
    for (const [y, w] of [[0.95, 0.72], [1.45, 0.4]]) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), new THREE.MeshBasicMaterial({ color: '#ff7a59', side: THREE.DoubleSide }));
      st.position.set(-0.72 + w / 2 + 0.01, y, -0.795); raft.add(st);
    }
    const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), new THREE.MeshBasicMaterial({ color: '#1fa8a0', side: THREE.DoubleSide }));
    pennant.position.set(-0.62, 2.78, -0.8); raft.add(pennant);
    g.add(raft);
    return g;
  }

  private night() {
    const g = new THREE.Group();
    g.add(this.sea('#17647f', '#0d2456', '#3a2f72', 1, -2.4, -0.03));
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(240, 14), lit('#8d7fa8'));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, 4.4); g.add(sand);
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 150; pos[i * 3 + 1] = 2 + Math.random() * 45; pos[i * 3 + 2] = -75; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.9 })));
    const moon = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), flat('#fff6d6')); moon.position.set(13, 14, -70); g.add(moon);
    const bite = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), flat('#121442')); bite.position.set(11.9, 14.6, -69.9); g.add(bite);
    // Lanterns on posts give the shore a warm glow.
    for (const x of [-2.6, 2.7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 8), lit('#5a4630')); post.position.set(x, 0.75, -1.4); g.add(post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), flat('#ffd98a')); lamp.position.set(x, 1.6, -1.4); g.add(lamp);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshBasicMaterial({ color: '#ffc966', transparent: true, opacity: 0.22, depthWrite: false }));
      halo.position.copy(lamp.position); g.add(halo);
    }
    const fn = 26, fp = new Float32Array(fn * 3);
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#d8ff8a', size: 5, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.flies.frustumCulled = false; g.add(this.flies);
    return g;
  }

  update(t: number) {
    for (const w of this.waters) w.uniforms.uTime.value = t;
    this.clouds.forEach((c, i) => { c.position.x += 0.004 * (1 + (i % 3) * 0.4); if (c.position.x > 40) c.position.x = -40; });
    if (this.foam) { this.foam.position.z = -2.4 + Math.sin(t * 0.9) * 0.22; (this.foam.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.25 * Math.sin(t * 0.9); }
    if (this.palmTop) this.palmTop.rotation.z = Math.sin(t * 0.8) * 0.05;
    if (this.name === 'ocean') {
      this.bobY = Math.sin(t * 1.15) * 0.035; this.bobRoll = Math.sin(t * 0.8) * 0.022;
      this.raft.position.y = this.bobY; this.raft.rotation.z = this.bobRoll;
    } else { this.bobY = 0; this.bobRoll = 0; }
    if (this.name === 'night') {
      const p = this.flies.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, Math.sin(i * 12.3 + t * 0.21 * (1 + (i % 4) * 0.3)) * 3.6, 0.5 + (Math.sin(i * 4.1 + t * 0.5) * 0.5 + 0.5) * 1.9, -1.6 + Math.cos(i * 7.7 + t * 0.17) * 1.3);
      }
      p.needsUpdate = true;
    }
  }
}
