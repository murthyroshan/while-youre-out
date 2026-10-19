// The game's stage: the home page's house (the same model, sky and lights), with the evening's
// people in it as an architect's model figures, and a director: camera moves, the time of day,
// bloom, and what the house does when you choose (sparks, a shake, the red of an emergency, the
// Wi-Fi dropping, an ambulance's lights on the path).
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createScene, v, type View } from '../home/scene';
import type { Echo } from './echo';

export const SHOTS = {
  title: { pos: v(24, 9, 26), target: v(7.6, 1.0, 3.0), fov: 30 },
  house: { pos: v(7.4, 5.0, 25), target: v(7.6, 1.2, 2.8), fov: 30 },
  // the hall, seen edge-on through the cut: outside on the left, inside on the right
  hall: { pos: v(0.2, 2.4, 11.6), target: v(0.2, 1.05, 3.0), fov: 36 },
  living: { pos: v(5.8, 2.5, 10.8), target: v(5.6, 0.95, 2.4), fov: 32 },
  kitchen: { pos: v(10.9, 2.35, 9.6), target: v(10.7, 1.05, 1.9), fov: 34 },
  island: { pos: v(10.9, 2.1, 8.6), target: v(10.7, 0.95, 3.4), fov: 32 },
  echo: { pos: v(9.6, 1.55, 1.55), target: v(9.72, 1.42, 0.2), fov: 30 },
  drawer: { pos: v(10.05, 1.75, 2.35), target: v(10.12, 0.8, 0.95), fov: 34 },
  maya: { pos: v(14.4, 2.3, 9.6), target: v(14.5, 0.75, 1.7), fov: 33 },
  path: { pos: v(-2.0, 3.2, 14), target: v(-1.4, 0.8, 3.2), fov: 40 },
} satisfies Record<string, View>;
export type Shot = keyof typeof SHOTS;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const std = (color: string, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });

// ---------- the people: an architect's model figures ----------
interface Look {
  top: string;
  bottom: string;
  hair: string;
  skin?: string;
  dress?: boolean;
  pony?: boolean;
  cap?: boolean;
}

export class Figure {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private hips: THREE.Object3D[] = [];
  private shoulders: THREE.Object3D[] = [];
  private path: THREE.Vector3[] = [];
  private speed = 1.1;
  private arrived: (() => void) | null = null;
  private phase = 0;
  private hopT = -1;
  private shiverT = -1;
  private lie = 0;
  private lieTo = 0;
  private lift = 0;

  /** Moving in any way (so its shadow must be redrawn). */
  get busy() {
    return this.path.length > 0 || this.hopT >= 0 || this.shiverT >= 0 || Math.abs(this.lie - this.lieTo) > 0.002;
  }

  constructor(readonly height: number, look: Look) {
    const h = height;
    const skin = std(look.skin ?? '#efe6d8', 0.7);
    const top = std(look.top, 0.85);
    const bottom = std(look.bottom, 0.85);
    const hair = std(look.hair, 0.6);
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    this.group.add(this.body);
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.05 * h, 0.47 * h, 0);
      this.body.add(hip);
      mesh(new THREE.CapsuleGeometry(0.042 * h, 0.36 * h, 6, 12), bottom, hip, 0, -0.222 * h);
      this.hips.push(hip);
      const sh = new THREE.Group();
      sh.position.set(s * 0.125 * h, 0.79 * h, 0);
      sh.rotation.z = s * 0.1;
      this.body.add(sh);
      mesh(new THREE.CapsuleGeometry(0.03 * h, 0.27 * h, 6, 12), top, sh, 0, -0.16 * h);
      this.shoulders.push(sh);
    }
    mesh(new THREE.CapsuleGeometry(0.092 * h, 0.17 * h, 8, 16), top, this.body, 0, 0.66 * h);
    if (look.dress) mesh(new THREE.CylinderGeometry(0.1 * h, 0.17 * h, 0.26 * h, 24), top, this.body, 0, 0.46 * h);
    mesh(new THREE.SphereGeometry(0.078 * h, 24, 16), skin, this.body, 0, 0.9 * h);
    const cap = mesh(new THREE.SphereGeometry(0.084 * h, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, this.body, 0, 0.905 * h, -0.008 * h);
    cap.rotation.x = -0.45;
    if (look.pony) mesh(new THREE.SphereGeometry(0.045 * h, 16, 12), hair, this.body, 0, 0.9 * h, -0.095 * h);
    if (look.cap) {
      const brim = mesh(new THREE.CylinderGeometry(0.09 * h, 0.09 * h, 0.01 * h, 24), hair, this.body, 0, 0.95 * h, 0.04 * h);
      brim.scale.z = 1.25;
    }
  }

  place(x: number, z: number, face?: number) {
    this.group.position.set(x, 0, z);
    this.lie = this.lieTo = this.lift = 0;
    if (face !== undefined) this.group.rotation.y = face;
    this.path = [];
    this.arrived?.();
    this.arrived = null;
    this.group.visible = true;
    return this;
  }
  faceTo(x: number, z: number) {
    this.group.rotation.y = Math.atan2(x - this.group.position.x, z - this.group.position.z);
    return this;
  }
  /** Walks through the points (x, z) and resolves on arrival. */
  walk(points: Array<[number, number]>, speed = 1.15): Promise<void> {
    this.arrived?.();
    this.path = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.speed = speed;
    this.group.visible = true;
    return new Promise((r) => (this.arrived = r));
  }
  /** Lies down (on the floor, or at `y`, the top of a bed). */
  setLying(on: boolean, y = 0, instant = false) {
    this.lieTo = on ? 1 : 0;
    this.group.position.y = y;
    this.lift = y > 0 ? 0 : 0.09 * this.height;
    if (instant) this.lie = this.lieTo;
  }
  hop() {
    this.hopT = 0;
  }
  shiver() {
    this.shiverT = 0;
  }
  update(dt: number, t: number) {
    const g = this.group;
    let moving = false;
    if (this.path.length) {
      const to = this.path[0];
      const d = new THREE.Vector3(to.x - g.position.x, 0, to.z - g.position.z);
      const len = d.length();
      const step = this.speed * dt;
      if (len <= step) {
        g.position.x = to.x;
        g.position.z = to.z;
        this.path.shift();
        if (!this.path.length) {
          this.arrived?.();
          this.arrived = null;
        }
      } else {
        g.position.addScaledVector(d.normalize(), step);
        const want = Math.atan2(d.x, d.z);
        let diff = want - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.rotation.y += diff * Math.min(1, dt * 10);
        moving = true;
      }
    }
    this.phase += dt * (moving ? (this.speed * 7) / this.height : 0);
    const swing = moving ? Math.sin(this.phase) * 0.55 : 0;
    this.hips[0].rotation.x += (swing - this.hips[0].rotation.x) * Math.min(1, dt * 14);
    this.hips[1].rotation.x += (-swing - this.hips[1].rotation.x) * Math.min(1, dt * 14);
    this.shoulders[0].rotation.x += (-swing * 0.7 - this.shoulders[0].rotation.x) * Math.min(1, dt * 14);
    this.shoulders[1].rotation.x += (swing * 0.7 - this.shoulders[1].rotation.x) * Math.min(1, dt * 14);
    let y = moving ? Math.abs(Math.sin(this.phase)) * 0.025 * this.height : Math.sin(t * 2.1 + this.height * 9) * 0.004 * this.height;
    if (this.hopT >= 0) {
      this.hopT += dt;
      y += Math.max(0, Math.sin(this.hopT * Math.PI * 2.4)) * 0.18;
      if (this.hopT > 0.84) this.hopT = -1;
    }
    this.body.rotation.z = 0;
    if (this.shiverT >= 0) {
      this.shiverT += dt;
      this.body.rotation.z = Math.sin(this.shiverT * 60) * 0.04 * (1 - this.shiverT / 1.2);
      if (this.shiverT > 1.2) this.shiverT = -1;
    }
    this.lie += (this.lieTo - this.lie) * Math.min(1, dt * 4);
    this.body.rotation.x = (-Math.PI / 2) * ease(this.lie);
    this.body.position.y = y * (1 - this.lie) + this.lift * this.lie;
  }
}

// ---------- small textures ----------
function radial(stops: Array<[number, string]>) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, col] of stops) r.addColorStop(at, col);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = radial([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
const DOT = radial([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
const glow = (color: string, size: number, opacity = 0) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
};

// The final grade: vignette, the red of an emergency, a chromatic hit when something goes wrong,
// and a little film grain so the model house reads as a picture.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, red: { value: 0 }, hit: { value: 0 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float red; uniform float hit; uniform float time; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 off = c * (hit * 0.022 + 0.0015);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float vig = smoothstep(0.92, 0.28, d);
      col *= mix(1.0, vig, 0.42 + 0.3 * red + 0.3 * hit);
      float pulse = 0.55 + 0.45 * sin(time * 5.5);
      col = mix(col, col * vec3(1.35, 0.42, 0.38) + vec3(0.06, 0.0, 0.0), red * (0.25 + 0.5 * smoothstep(0.15, 0.75, d) * pulse));
      col += vec3(0.5, 0.0, 0.0) * hit * smoothstep(0.3, 0.8, d);
      float n = fract(sin(dot(vUv * (time + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.028;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createWorld(canvas: HTMLCanvasElement, echo: Echo) {
  const s = createScene(canvas);
  const { scene, camera, house, renderer } = s;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  // shadows are redrawn only when something casting one moves (see the frame loop)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  // the house, already built (the home page's opening is the home page's)
  for (const r of house.rising) {
    r.scale.y = 1;
    r.visible = true;
  }
  camera.up.set(0, 1, 0);
  s.settle();
  // the contact shadows already ground everything; the per-frame occlusion pass is the home page's
  s.ao.enabled = false;
  (s.contact.material as THREE.MeshBasicMaterial).opacity = 0.62;

  // ---------- the Echo Show's screen is the canvas ----------
  const echoTex = new THREE.CanvasTexture(echo.canvas);
  echoTex.colorSpace = THREE.SRGBColorSpace;
  echoTex.anisotropy = 8;
  house.echo.screen.material = new THREE.MeshBasicMaterial({ map: echoTex, color: new THREE.Color(1.05, 1.05, 1.05) });
  const echoGlow = glow('#1ac3eb', 1.0, 0);
  echoGlow.position.set(9.72, 1.47, 0.215); // behind the screen: it lights the wall around the device
  scene.add(echoGlow);

  // ---------- the cast ----------
  const cast = {
    priya: new Figure(1.64, { top: '#c8973a', bottom: '#3b3f4a', hair: '#2a211c' }),
    maya: new Figure(1.12, { top: '#d9707f', bottom: '#f1ece3', hair: '#2a211c', dress: true, pony: true }),
    anita: new Figure(1.62, { top: '#7d8fa3', bottom: '#2e3138', hair: '#1f1915' }),
    rahul: new Figure(1.76, { top: '#e9e3d6', bottom: '#4a4f5c', hair: '#1a1714' }),
    stranger: new Figure(1.82, { top: '#24262c', bottom: '#1b1c21', hair: '#121316', skin: '#a9a39a', cap: true }),
  };
  for (const f of Object.values(cast)) {
    scene.add(f.group);
    f.group.visible = false;
  }

  // ---------- props ----------
  const props = new THREE.Group();
  scene.add(props);
  const add = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    o.traverse((c) => (c.castShadow = true));
    props.add(o);
    return o;
  };
  // the neighbour's cookies on the worktop
  const cookies = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.014, 32), std('#f6f3ee', 0.4));
  cookies.add(plate);
  const cookieMat = std('#b8844a', 0.95);
  for (const [cx, cz, cy] of [[-0.05, -0.04, 0.014], [0.05, -0.03, 0.014], [0, 0.05, 0.014], [0.01, 0, 0.03]]) {
    const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.013, 20), cookieMat);
    ck.position.set(cx, cy, cz);
    ck.rotation.set(Math.random() * 0.2, 0, Math.random() * 0.2);
    cookies.add(ck);
  }
  add(cookies, 9.62, 0.912, 0.52).visible = false;
  // the banana Anita said she can have
  const banana = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 10, 20, Math.PI * 0.75), std('#f2c94c', 0.6));
  banana.rotation.x = -Math.PI / 2;
  add(banana, 10.3, 0.925, 3.15).visible = false;
  // Zoe's granola bar
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.045), std('#3f8f5a', 0.5));
  bar.rotation.y = 0.4;
  add(bar, 10.55, 0.915, 3.3).visible = false;
  // the TV's picture
  const tvMat = new THREE.MeshBasicMaterial({ color: '#000000' });
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.74), tvMat);
  tv.rotation.y = Math.PI / 2;
  tv.castShadow = false;
  add(tv, 3.465, 1.45, 2.3).visible = false;
  // Priya's phone on the island, lit when she calls
  const phoneMat = new THREE.MeshBasicMaterial({ color: '#000000' });
  const phone = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.27), phoneMat);
  phone.rotation.x = -Math.PI / 2;
  add(phone, 11.375, 0.909, 3.145);
  // the doorbell camera's ring of light
  const bellGlow = glow('#5ad1ff', 0.42);
  bellGlow.position.set(-0.08, 1.315, 3.585);
  scene.add(bellGlow);
  // the EpiPen pouch, lit when the drawer opens
  const pouchGlow = glow('#ff6a3d', 0.5);
  pouchGlow.position.set(-0.02, 0.06, -0.215);
  house.drawer.add(pouchGlow);
  // the stranger's torch: a real light, and a cone of light in the evening air
  const torch = new THREE.SpotLight('#fff1d6', 0, 9, 0.32, 0.7, 1.4);
  // it casts a shadow, so the closed door stops it (and an open one lets it in)
  torch.castShadow = true;
  torch.shadow.mapSize.set(512, 512);
  torch.shadow.bias = -0.002;
  scene.add(torch, torch.target);
  const coneTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d')!;
    const l = g.createLinearGradient(0, 0, 0, 128);
    l.addColorStop(0, 'rgba(255,240,210,0.55)');
    l.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = l;
    g.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  })();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 2.4, 32, 1, true).translate(0, -1.2, 0),
    new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  scene.add(cone);
  // the ambulance's lights on the path
  const siren = [glow('#ff2a2a', 1.3), glow('#2a6bff', 1.3)];
  siren[0].position.set(-5.6, 1.9, 6.6);
  siren[1].position.set(-5.0, 1.9, 6.6);
  scene.add(...siren);
  // one coloured light for whatever the moment needs (the TV, the Echo Show, the emergency, the ambulance)
  const fx = new THREE.PointLight('#ffffff', 0, 7, 1.6);
  scene.add(fx);

  // ---------- particles: sparks for a good call, motes at bedtime ----------
  const N = 240;
  const sparkPos = new Float32Array(N * 3);
  const sparkCol = new Float32Array(N * 3);
  const sparkVel = new Float32Array(N * 3);
  const sparkLife = new Float32Array(N);
  const sparkBase = new Float32Array(N * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.07, map: DOT, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let nextSpark = 0;
  const burst = (at: THREE.Vector3, color: string, n = 70, power = 1) => {
    const c = new THREE.Color(color).multiplyScalar(3);
    for (let k = 0; k < n; k++) {
      const i = nextSpark++ % N;
      sparkPos.set([at.x, at.y, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = (0.6 + Math.random() * 1.6) * power;
      sparkVel.set([Math.cos(a) * sp * 0.8, (0.8 + up * 2.2) * power, Math.sin(a) * sp * 0.8], i * 3);
      sparkBase.set([c.r, c.g, c.b], i * 3);
      sparkLife[i] = 1;
    }
  };
  const M = 120;
  const motePos = new Float32Array(M * 3);
  const moteSeed = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    motePos.set([13.3 + Math.random() * 2.5, 0.2 + Math.random() * 2.4, 0.4 + Math.random() * 5], i * 3);
    moteSeed[i] = Math.random() * 100;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.05, map: DOT, color: new THREE.Color('#ffc98a').multiplyScalar(2.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(motes);

  // ---------- post: bloom, the Wi-Fi glitch, the grade ----------
  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(size, 0.75, 0.6, 0.9);
  const glitch = new GlitchPass();
  glitch.enabled = false;
  glitch.goWild = true;
  const grade = new ShaderPass(GradeShader);
  s.composer.insertPass(bloom, 2);
  s.composer.addPass(glitch);
  s.composer.addPass(grade);
  // compile every shader now (the torch, the TV, the cookies...), not in the middle of a moment
  {
    const hidden: THREE.Object3D[] = [];
    props.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    for (const f of Object.values(cast)) f.group.visible = true;
    renderer.compile(scene, camera);
    for (const o of hidden) o.visible = false;
    for (const f of Object.values(cast)) f.group.visible = false;
  }

  // ---------- the director ----------
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cam = { from: SHOTS.title as View, to: SHOTS.title as View, start: 0, dur: 1, done: null as null | (() => void) };
  const hourT = { from: 17.9, to: 17.9, start: 0, dur: 1 };
  let hour = 17.9;
  let orbit = true;
  let trauma = 0;
  let hit = 0;
  let red = 0;
  let redTo = 0;
  let dolly = 0;
  let dollyTo = 0;
  let mode: 'calm' | 'tv' | 'emergency' | 'siren' | 'echo' = 'calm';
  let doorTo = 0;
  let doorAngle = 0;
  let drawerTo = 0;
  let drawerK = 0;
  let torchOn = 0;
  let bell = 0;
  let phoneOn = 0;
  let motesTo = 0;
  let scary = false;
  let offset = 0;
  const drawerHome = house.drawer.position.z;
  const base = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 };

  const go = (shot: Shot | View, h?: number, dur = 1.8): Promise<void> => {
    const to = typeof shot === 'string' ? SHOTS[shot] : shot;
    orbit = false;
    cam.from = { pos: base.pos.clone(), target: base.target.clone(), fov: base.fov };
    cam.to = to;
    cam.start = performance.now();
    cam.dur = reduced ? 0.01 : dur;
    if (h !== undefined) {
      hourT.from = hour;
      hourT.to = h;
      hourT.start = performance.now();
      hourT.dur = reduced ? 0.01 : Math.max(dur, 1.2);
    }
    cam.done?.();
    return new Promise((r) => (cam.done = r));
  };

  let last = performance.now();
  let avg = 16;
  let running = true;
  let stopped = false;
  let shadowsDirty = true;
  function frame(now: number) {
    if (!running || stopped) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    // time of day
    if (hourT.from !== hourT.to) {
      const k = clamp01((now - hourT.start) / (hourT.dur * 1000));
      hour = hourT.from + (hourT.to - hourT.from) * ease(k);
      if (k >= 1) hourT.from = hourT.to;
      // relighting from the sky is costly: once, when the hour arrives
      s.setHour(hour, k >= 1);
      shadowsDirty = true;
    }
    // bloom is for the night: by day the pale plaster would glow
    bloom.threshold = THREE.MathUtils.lerp(1.6, 0.85, clamp01((hour - 18.8) / 0.8));

    // the camera
    if (orbit) {
      // a slow sweep across the front of the house, clear of the trees
      const a = Math.sin(t * 0.07) * 0.55;
      base.pos.set(7.6 + Math.sin(a) * 25, 6.5, 3 + Math.cos(a) * 25);
      // aimed left of the house, so it sits to the right of the title
      base.target.set(3.2 + Math.sin(a) * 2, 1.4, 3);
      base.fov = 30;
    } else {
      const k = clamp01((now - cam.start) / (cam.dur * 1000));
      const e = ease(k);
      base.pos.lerpVectors(cam.from.pos, cam.to.pos, e);
      base.target.lerpVectors(cam.from.target, cam.to.target, e);
      base.fov = cam.from.fov + (cam.to.fov - cam.from.fov) * e;
      if (k >= 1 && cam.done) {
        const d = cam.done;
        cam.done = null;
        d();
      }
    }
    camera.position.copy(base.pos);
    camera.fov = base.fov;
    // the dolly zoom: the camera moves in while the lens widens, the door stays the same size and
    // the room stretches around it
    dolly += (dollyTo - dolly) * Math.min(1, dt * (dollyTo > dolly ? 0.35 : 3));
    if (dolly > 0.001 && !reduced) {
      const dir = new THREE.Vector3().subVectors(base.target, base.pos);
      const d0 = dir.length();
      const d1 = d0 * (1 - 0.55 * dolly);
      camera.position.copy(base.target).addScaledVector(dir.normalize(), -d1);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(base.fov) / 2) * d0) / d1));
    }
    // a hand-held drift, and a shake that decays
    if (!reduced) {
      camera.position.x += Math.sin(t * 0.37) * 0.035;
      camera.position.y += Math.sin(t * 0.29 + 1) * 0.025;
      trauma = Math.max(0, trauma - dt * 1.4);
      const sh = trauma * trauma;
      camera.position.x += (Math.random() - 0.5) * sh * 0.22;
      camera.position.y += (Math.random() - 0.5) * sh * 0.16;
    }
    // the story panel covers the left of the screen: shift the picture so what the camera looks at
    // sits right of centre, between the panel and the Echo Show
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    offset += ((cw > 760 && !orbit ? 0.14 : 0) - offset) * Math.min(1, dt * 2);
    if (offset > 0.001) camera.setViewOffset(cw, ch, -cw * offset, 0, cw, ch);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const look = base.target.clone();
    if (!reduced) look.x += (Math.random() - 0.5) * trauma * trauma * 0.1;
    camera.lookAt(look);

    // the house reacting
    doorAngle += (doorTo - doorAngle) * Math.min(1, dt * 3);
    house.door.rotation.y = doorAngle + (bell > 0 && Math.random() < 0.5 ? (Math.random() - 0.5) * 0.02 * bell : 0);
    drawerK += (drawerTo - drawerK) * Math.min(1, dt * 4);
    house.drawer.position.z = drawerHome + drawerK * 0.42;
    house.pouch.visible = drawerK > 0.05;
    pouchGlow.material.opacity = drawerK * (0.7 + Math.sin(t * 6) * 0.3);
    bell = Math.max(0, bell - dt * 0.8);
    bellGlow.material.opacity = torchOn > 0.01 ? 0.5 + Math.sin(t * 8) * 0.4 : 0;

    // the stranger's torch follows him, pointed at the door
    const st = cast.stranger.group;
    const tp = new THREE.Vector3(st.position.x + 0.32, 1.25, st.position.z + 0.14);
    torch.position.copy(tp);
    torch.target.position.set(0.6, 1.1 + Math.sin(t * 1.7) * 0.15, 2.9 + Math.sin(t * 1.1) * 0.25);
    torch.intensity += (torchOn * 35 - torch.intensity) * Math.min(1, dt * 5);
    cone.position.copy(tp);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), torch.target.position.clone().sub(tp).normalize());
    cone.material.opacity = torch.intensity / 35 * 0.5;

    // TV, phone, the coloured light
    if (tv.visible) {
      const k = Math.floor(t * (scary ? 9 : 2.5));
      const hue = scary ? 0.0 : ((k * 0.17) % 1);
      tvMat.color.setHSL(hue, scary ? 0.9 : 0.55, scary ? 0.12 + (k % 3) * 0.12 : 0.5).multiplyScalar(1.8);
    }
    phoneMat.color.setScalar(phoneOn * (1.6 + Math.sin(t * 9) * 0.4));
    const echoSpeaking = mode === 'echo';
    echoGlow.material.opacity += ((echoSpeaking ? 0.28 : 0.08) - echoGlow.material.opacity) * Math.min(1, dt * 3);
    if (mode === 'emergency') {
      fx.position.set(10.9, 2.2, 3.2);
      fx.color.set('#ff2a20');
      fx.intensity = 6 + Math.sin(t * 5.5) * 5;
    } else if (mode === 'siren') {
      const blue = Math.floor(t * 4) % 2 === 1;
      fx.position.set(-4.2, 2.0, 5.6);
      fx.color.set(blue ? '#2a6bff' : '#ff2a2a');
      fx.intensity = 14;
      siren[0].material.opacity = blue ? 0.1 : 1;
      siren[1].material.opacity = blue ? 1 : 0.1;
    } else if (mode === 'tv' && tv.visible) {
      fx.position.set(4.0, 1.4, 2.3);
      fx.color.copy(tvMat.color).multiplyScalar(0.6);
      fx.intensity = 3;
    } else if (mode === 'echo') {
      fx.position.set(9.72, 1.5, 0.8);
      fx.color.set(echo.kind === 'alert' ? '#ff4438' : echo.kind === 'offline' ? '#ffb020' : echo.kind === 'message' ? '#ff8fb1' : '#1ac3eb');
      fx.intensity = 0.3;
      fx.distance = 2.5;
    } else fx.intensity = 0;
    if (mode !== 'echo') fx.distance = 7;
    if (mode !== 'siren') siren.forEach((sp) => (sp.material.opacity = 0));

    // people
    for (const f of Object.values(cast)) if (f.group.visible) f.update(dt, t);

    // sparks
    for (let i = 0; i < N; i++) {
      if (sparkLife[i] <= 0) {
        sparkCol[i * 3] = sparkCol[i * 3 + 1] = sparkCol[i * 3 + 2] = 0;
        continue;
      }
      sparkLife[i] -= dt * 0.8;
      sparkVel[i * 3 + 1] -= dt * 4.5;
      for (let k = 0; k < 3; k++) {
        sparkPos[i * 3 + k] += sparkVel[i * 3 + k] * dt;
        sparkVel[i * 3 + k] *= 1 - dt * 1.2;
        sparkCol[i * 3 + k] = sparkBase[i * 3 + k] * Math.max(0, sparkLife[i]);
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
    motes.material.opacity += (motesTo - motes.material.opacity) * Math.min(1, dt * 1.5);
    if (motes.material.opacity > 0.01) {
      for (let i = 0; i < M; i++) {
        motePos[i * 3 + 1] += Math.sin(t * 0.5 + moteSeed[i]) * dt * 0.05;
        motePos[i * 3] += Math.cos(t * 0.3 + moteSeed[i]) * dt * 0.03;
      }
      moteGeo.attributes.position.needsUpdate = true;
    }

    // the Echo Show's screen
    if (echo.update(now, reduced)) echoTex.needsUpdate = true;

    // the grade
    red += (redTo - red) * Math.min(1, dt * 2.5);
    hit = Math.max(0, hit - dt * 1.8);
    grade.uniforms.red.value = red;
    grade.uniforms.hit.value = hit;
    grade.uniforms.time.value = t;

    // shadows: only when something that casts one moved
    const moving = Object.values(cast).some((f) => f.group.visible && f.busy) || Math.abs(doorTo - doorAngle) > 0.002 || Math.abs(drawerTo - drawerK) > 0.002 || torch.intensity > 0.5 || bell > 0;
    if (moving || shadowsDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowsDirty = false;
    }
    s.composer.render(dt);

    // a slow GPU: drop the ambient occlusion first, then the resolution
    avg = avg * 0.97 + dt * 1000 * 0.03;
    if (avg > 30 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      s.resize();
      avg = 16;
    }
  }
  requestAnimationFrame(frame);
  // don't draw while the game is scrolled out of sight
  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was && !stopped) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }).observe(canvas);

  const headOf = (f: Figure) => f.group.position.clone().add(new THREE.Vector3(0, f.height * 0.95, 0));

  return {
    cast,
    go,
    hour: () => hour,
    setHourNow(h: number) {
      hour = hourT.from = hourT.to = h;
      s.setHour(h);
      shadowsDirty = true;
    },
    /** Leaving the page: stop drawing at once, so the next page isn't kept waiting. */
    stop() {
      stopped = true;
    },
    /** A good call: warm sparks around someone. */
    good(f: Figure = cast.priya, color = '#ffc76b') {
      burst(headOf(f), color, 80);
    },
    /** Something went wrong: a jolt, a red edge, a chromatic split. */
    bad(amount = 1) {
      trauma = Math.min(1, trauma + 0.6 * amount);
      hit = Math.min(1.2, hit + amount);
    },
    shake(amount = 0.5) {
      trauma = Math.min(1, trauma + amount);
    },
    knock() {
      bell = 1;
      trauma = Math.min(1, trauma + 0.35);
    },
    glitch(ms = 900) {
      if (reduced) return;
      glitch.enabled = true;
      setTimeout(() => (glitch.enabled = false), ms);
    },
    setMode(m: typeof mode) {
      mode = m;
    },
    setRed(on: boolean) {
      redTo = on ? 1 : 0;
    },
    setDolly(on: boolean) {
      dollyTo = on ? 1 : 0;
    },
    setDoor(angle: number) {
      doorTo = angle;
    },
    setDrawer(open: boolean) {
      drawerTo = open ? 1 : 0;
    },
    setTorch(on: boolean) {
      torchOn = on ? 1 : 0;
    },
    setPhone(on: boolean) {
      phoneOn = on ? 1 : 0;
    },
    setMotes(on: boolean) {
      motesTo = on ? 0.9 : 0;
    },
    setTv(on: boolean, isScary = false) {
      tv.visible = on;
      scary = isScary;
    },
    show: { cookies: (on: boolean) => (cookies.visible = on), banana: (on: boolean) => (banana.visible = on), bar: (on: boolean) => (bar.visible = on) },
    burstAt(x: number, y: number, z: number, color: string, n = 60) {
      burst(new THREE.Vector3(x, y, z), color, n, 0.8);
    },
    hideAll() {
      for (const f of Object.values(cast)) f.group.visible = false;
    },
  };
}

export type World = ReturnType<typeof createWorld>;
