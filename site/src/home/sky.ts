// The sky over the house: one value, the hour, sets everything (sun, colours, stars, the moon).
// The moon is today's real moon: its phase is worked out from the date.
import * as THREE from 'three';

type Stop = { h: number; top: string; horizon: string; sun: string; sunI: number; hemi: number; exposure: number };

// Art-directed stops through an evening (and a morning, for the parents' return).
const STOPS: Stop[] = [
  { h: 6.0, top: '#1a2449', horizon: '#c98a74', sun: '#ff9a5c', sunI: 0.2, hemi: 0.35, exposure: 1.1 },
  { h: 7.5, top: '#8fb4dd', horizon: '#f5d9b8', sun: '#ffe2bd', sunI: 2.2, hemi: 0.9, exposure: 1.0 },
  { h: 12, top: '#6aa6e6', horizon: '#dfe9f2', sun: '#fff4e0', sunI: 3.0, hemi: 1.1, exposure: 0.95 },
  { h: 17.5, top: '#6f9ad6', horizon: '#f6d3a8', sun: '#ffc985', sunI: 3.6, hemi: 0.55, exposure: 1.0 },
  { h: 18.6, top: '#6f86c2', horizon: '#f7a865', sun: '#ff9f55', sunI: 2.6, hemi: 0.5, exposure: 1.05 },
  { h: 19.2, top: '#3a4a7c', horizon: '#d8866a', sun: '#ff8650', sunI: 0.55, hemi: 0.45, exposure: 1.15 },
  { h: 19.7, top: '#1b2850', horizon: '#4d5b8b', sun: '#5a6fb0', sunI: 0.0, hemi: 0.28, exposure: 1.3 },
  { h: 21.0, top: '#0b1126', horizon: '#1d2748', sun: '#3a4a80', sunI: 0.0, hemi: 0.16, exposure: 1.45 },
  { h: 23.9, top: '#070b18', horizon: '#121a33', sun: '#2a3666', sunI: 0.0, hemi: 0.12, exposure: 1.5 },
];

const lerpStop = (hour: number) => {
  const s = STOPS;
  const h = Math.min(Math.max(hour, s[0].h), s[s.length - 1].h);
  let i = 0;
  while (i < s.length - 2 && h > s[i + 1].h) i++;
  const a = s[i];
  const b = s[i + 1];
  const t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
  const mix = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  return { top: mix(a.top, b.top), horizon: mix(a.horizon, b.horizon), sun: mix(a.sun, b.sun), sunI: a.sunI + (b.sunI - a.sunI) * t, hemi: a.hemi + (b.hemi - a.hemi) * t, exposure: a.exposure + (b.exposure - a.exposure) * t };
};

/** The moon's phase today, 0 = new, 0.5 = full (synodic month from a known new moon). */
export function moonPhase(date = new Date()): number {
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const synodic = 29.530588853;
  const days = (date.getTime() - knownNew) / 86_400_000;
  return (((days / synodic) % 1) + 1) % 1;
}

export function phaseName(p: number): string {
  if (p < 0.03 || p > 0.97) return 'new moon';
  if (p < 0.22) return 'waxing crescent';
  if (p < 0.28) return 'first quarter';
  if (p < 0.47) return 'waxing gibbous';
  if (p < 0.53) return 'full moon';
  if (p < 0.72) return 'waning gibbous';
  if (p < 0.78) return 'last quarter';
  return 'waning crescent';
}

/** The moon's disc at a phase, drawn with its shadow on a canvas. */
function moonTexture(phase: number) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const r = s * 0.42;
  const cx = s / 2;
  // the lit disc with soft maria
  const grad = g.createRadialGradient(cx - r * 0.3, cx - r * 0.3, r * 0.1, cx, cx, r);
  grad.addColorStop(0, '#fbf6e8');
  grad.addColorStop(1, '#d9d2bf');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cx, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(150, 140, 120, 0.22)';
  for (const [x, y, rr] of [[-0.25, -0.15, 0.22], [0.2, 0.1, 0.18], [-0.05, 0.3, 0.14], [0.3, -0.3, 0.1]]) {
    g.beginPath();
    g.arc(cx + x * r, cx + y * r, rr * r, 0, Math.PI * 2);
    g.fill();
  }
  // the shadow: the terminator is an ellipse whose width follows the phase
  g.globalCompositeOperation = 'destination-out';
  const waxing = phase < 0.5;
  const k = Math.cos(phase * 2 * Math.PI); // 1 = new, -1 = full
  g.beginPath();
  // dark half
  g.arc(cx, cx, r + 1, -Math.PI / 2, Math.PI / 2, !waxing);
  // terminator back up
  g.ellipse(cx, cx, Math.abs(k) * (r + 1), r + 1, 0, Math.PI / 2, -Math.PI / 2, k > 0 ? !waxing : waxing);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSky(scene: THREE.Scene, date = new Date()) {
  // the dome: a gradient from horizon to zenith, with a glow around the sun
  const uniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() },
    sunGlow: { value: 0 },
    desat: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(400, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow; uniform float desat;
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizon, top, pow(max(h, 0.0), 0.55));
          float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunColor * (pow(d, 18.0) * 0.55 + pow(d, 400.0) * 1.4) * sunGlow;
          c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), desat);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  // stars: a fixed field, fading in after dusk
  const n = 1400;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random() * 0.48 + 0.02;
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - v * 2) ;
    pos.set([380 * Math.sin(phi) * Math.cos(theta), 380 * Math.cos(phi), 380 * Math.sin(phi) * Math.sin(theta)], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#e9eeff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // the moon, at today's phase
  const phase = moonPhase(date);
  const moonMat = new THREE.SpriteMaterial({ map: moonTexture(phase), transparent: true, depthWrite: false, opacity: 0, fog: false });
  const moon = new THREE.Sprite(moonMat);
  moon.scale.set(16, 16, 1);
  scene.add(moon);

  const sun = new THREE.DirectionalLight('#fff4e0', 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.intensity = 0.85; // the low sun draws the furniture's shadows across the floor
  sun.target.position.set(8, 0, 3);
  scene.add(sun, sun.target);

  // The sky also lights the house (image-based light): a small copy of the dome over a ground
  // disc is captured into an environment map whenever the hour has moved on.
  const envScene = new THREE.Scene();
  // the light it gives is calmer than the sky looks: a sunset sky would tint every wall pink
  const envMat = (dome.material as THREE.ShaderMaterial).clone();
  envMat.uniforms = { ...uniforms, desat: { value: 0.6 } };
  const envDome = new THREE.Mesh(dome.geometry, envMat);
  envDome.scale.setScalar(0.1);
  const groundMat = new THREE.MeshBasicMaterial({ color: '#cfc6b4', side: THREE.DoubleSide });
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(39, 48), groundMat);
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -1.5;
  envScene.add(envDome, envGround);

  /** Sets the whole sky for an hour of the day (e.g. 19.5 = 7:30 pm). Returns the exposure to use. */
  const setHour = (h: number) => {
    const s = lerpStop(h);
    uniforms.top.value.copy(s.top);
    uniforms.horizon.value.copy(s.horizon);
    uniforms.sunColor.value.copy(s.sun);
    // the evening sun is low on the front right, so it shines into the cut-open rooms and lays
    // long shadows of the furniture across the floor; the morning sun comes from the front left
    const elev = THREE.MathUtils.degToRad(Math.max(-8, 52 * Math.sin((Math.PI * (h - 7)) / 12.6)));
    const azim = THREE.MathUtils.degToRad(h < 12 ? 215 : 128 + (h - 12) * 2);
    const dir = new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).normalize();
    uniforms.sunDir.value.copy(dir);
    uniforms.sunGlow.value = THREE.MathUtils.clamp((elev + 0.12) / 0.35, 0, 1);
    sun.position.copy(dir.clone().multiplyScalar(40).add(sun.target.position));
    sun.color.copy(s.sun);
    sun.intensity = s.sunI;
    // the ground seen from the house: warm board in the day, near-black at night
    groundMat.color.set('#d8cfbd').multiplyScalar(Math.min(1, s.hemi * 1.25)).lerp(s.horizon, 0.25);
    envLevel = s.hemi;
    // stars and the moon appear after sunset
    const night = THREE.MathUtils.clamp((h - 19.3) / 1.2, 0, 1) * (h < 23.95 ? 1 : 0) + (h < 6.5 ? 1 : 0);
    starMat.opacity = night * 0.9;
    moonMat.opacity = THREE.MathUtils.clamp(night * 1.2, 0, 1) * (phase > 0.03 && phase < 0.97 ? 1 : 0.15);
    // the moon rises from behind the trees on the right as the night goes on
    const mt = THREE.MathUtils.clamp((h - 19.3) / 4.5, 0, 1);
    const mElev = THREE.MathUtils.degToRad(8 + mt * 34);
    const mAz = THREE.MathUtils.degToRad(28 - mt * 18);
    moon.position.set(Math.sin(mAz) * Math.cos(mElev) * 360, Math.sin(mElev) * 360, -Math.cos(mAz) * Math.cos(mElev) * 360);
    return s.exposure;
  };

  let envLevel = 1;
  return { setHour, phase, sun, envScene, horizon: () => uniforms.horizon.value, envLevel: () => envLevel };
}
