// The homepage's 3D scene: renderer, light, the house, the sky, and the opening (an architect's
// ink plan that rises into the house).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { buildHouse, D, W, type House } from './house';
import { mergeStatic } from './merge';
import { makeMaterials } from './materials';
import { buildSky } from './sky';

export interface View {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const VIEWS = {
  plan: { pos: v(8, 23, 3.0), target: v(8, 0, 3.0), fov: 34 },
  hero: { pos: v(5.4, 4.3, 33), target: v(6.9, 1.3, 2.6), fov: 22 },
} satisfies Record<string, View>;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Interior lights through the evening: on at dusk, off room by room at bedtime, the night light stays. */
export function lightsAt(h: number) {
  const ramp = (from: number, to: number) => clamp01((h - from) / (to - from));
  const on = ramp(18.85, 19.25);
  const off = (at: number) => 1 - ramp(at, at + 0.05);
  const back = ramp(22.95, 23.05); // the parents come home
  return {
    hall: Math.max(on * off(20.72), back),
    living: Math.max(on * off(20.66), back * 0.6),
    kitchen: Math.max(on * off(20.58), back * 0.4),
    maya: on * off(20.45),
    lamp: on * off(20.8),
    night: ramp(20.4, 20.5),
  };
}

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // A phone draws fewer pixels: the house still looks sharp, and the page stays responsive.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 800 ? 1.25 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // redrawn only when the sun or the house moves
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps the model's pale colours true; AgX greyed them
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VIEWS.plan.fov, 1, 0.1, 1000);
  const target = new THREE.Vector3();
  let forced = true; // the next tick draws, whatever changed
  const materials = makeMaterials();
  const house: House = buildHouse(materials);
  scene.add(house.group);
  // each piece that rises in the opening becomes a few meshes (one per material)
  for (const r of house.rising) mergeStatic(r, house.moving);
  const sky = buildSky(scene);
  // haze: the far ground melts into the horizon instead of ending at an edge
  const fog = new THREE.Fog('#e8d9c4', 34, 140);
  scene.fog = fog;

  // ---------- light from the sky ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT: THREE.WebGLRenderTarget | null = null;
  let envHour = -99;
  const updateEnv = (h: number) => {
    if (Math.abs(h - envHour) < 0.08) return;
    envHour = h;
    const next = pmrem.fromScene(sky.envScene, 0.02, 0.1, 100, { size: 128 });
    scene.environment = next.texture;
    envRT?.dispose();
    envRT = next;
  };

  // Two ways to draw a frame. While the camera moves: straight to the screen, one pass. Once it
  // rests: through the composer, with ambient occlusion faded in, and then nothing more is drawn
  // until something changes. A fast GPU keeps the occlusion on while moving too.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.2, scale: 1.0 });
  const AO_FULL = 0.7;
  ao.blendIntensity = AO_FULL;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  // the glow halos are already in the picture; the occlusion pass must not see them as solid squares
  const aoRender = ao.render.bind(ao);
  ao.render = (...args: Parameters<GTAOPass['render']>) => {
    const halos = [house.halos.lamp, house.halos.night, ...house.halos.pendants];
    const was = halos.map((h) => h.visible);
    for (const h of halos) h.visible = false;
    aoRender(...args);
    halos.forEach((h, i) => (h.visible = was[i]));
  };
  scene.environmentIntensity = 0.6; // the sky fills the shade; the sun does the drawing

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    forced = true;
  };
  window.addEventListener('resize', resize);
  resize();

  /** Sets the time of day: the sky, the sun, and every lamp in the house. */
  let hour = 17.6;
  let shadowsDirty = true;
  /** `env: false` skips relighting from the sky (costly), for hours that are only passing through. */
  const setHour = (h: number, env = true) => {
    if (Math.abs(h - hour) > 0.004) shadowsDirty = true;
    hour = h;
    renderer.toneMappingExposure = sky.setHour(h);
    fog.color.copy(sky.horizon());
    if (env) updateEnv(h);
    const l = lightsAt(h);
    const warm = 9;
    const { room, spots } = house.lights;
    room.hall.intensity = l.hall * warm;
    room.kitchen.intensity = l.kitchen * warm * 1.1;
    // the living room's light becomes the floor lamp once the ceiling light is off
    const lampOnly = l.lamp > l.living ? 1 : 0;
    room.living.position.copy(lampOnly ? spots.lamp : spots.living);
    room.living.intensity = lampOnly ? l.lamp * 4 : l.living * warm;
    room.living.distance = lampOnly ? 5 : 9;
    // and Maya's becomes her night light
    const nightOnly = l.night > l.maya ? 1 : 0;
    room.maya.position.copy(nightOnly ? spots.night : spots.maya);
    room.maya.intensity = nightOnly ? l.night * 1.6 : l.maya * warm * 0.8;
    room.maya.distance = nightOnly ? 3 : 9;
    house.glow.lampShade.emissiveIntensity = l.lamp * 1.6;
    house.glow.pendants.emissiveIntensity = l.kitchen * 2.2;
    house.glow.nightLight.emissiveIntensity = l.night * 2.6;
    const night = clamp01((h - 19.0) / 0.6);
    const glowTo = (sp: THREE.Sprite, k: number) => {
      (sp.material as THREE.SpriteMaterial).opacity = k;
      sp.visible = k > 0.002;
    };
    glowTo(house.halos.lamp, l.lamp * night * 0.85);
    for (const p of house.halos.pendants) glowTo(p, l.kitchen * night * 0.7);
    glowTo(house.halos.night, l.night * 0.8);
  };
  setHour(hour);

  const view = (vw: View) => {
    camera.position.copy(vw.pos);
    target.copy(vw.target);
    camera.fov = vw.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
  };

  /** A camera position between two views (t from 0 to 1, eased). */
  const between = (a: View, b: View, t: number) => {
    const e = ease(clamp01(t));
    camera.position.lerpVectors(a.pos, b.pos, e);
    target.lerpVectors(a.target, b.target, e);
    camera.fov = a.fov + (b.fov - a.fov) * e;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
  };

  // ---------- the opening: the ink plan rises into the house ----------
  const risers = house.rising;
  const roof = risers.find((r) => (r.userData.delay as number) >= 0.42 && r.children.length === 2);
  for (const r of risers) r.scale.y = 0.0001;
  camera.up.set(0, 0, -1); // the plan view: the back wall at the top of the screen
  view(VIEWS.plan);

  /** Where the plan's corners land on screen in the plan view (for the ink drawing). */
  const planOnScreen = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const p = (x: number, z: number) => {
      const s = new THREE.Vector3(x, 0, z).project(camera);
      return [((s.x + 1) / 2) * w, ((1 - s.y) / 2) * h] as const;
    };
    return { rects: house.plan.map((r) => [p(r.x1, r.z1), p(r.x2, r.z2)] as const), openings: house.openings.map((r) => [p(r.x1, r.z1), p(r.x2, r.z2)] as const), w, h };
  };

  let openingStart = -1;
  let openingDone = false;
  const OPENING = { rise: 0.6, riseLen: 2.6, camera: [0.3, 3.4] as const };
  const startRise = () => {
    openingStart = performance.now();
  };
  /** Runs the rise; returns true when it is complete. */
  const stepOpening = (now: number) => {
    if (openingDone || openingStart < 0) return openingDone;
    const t = (now - openingStart) / 1000;
    for (const r of risers) {
      const d = (r.userData.delay as number) ?? 0;
      const k = clamp01((t - OPENING.rise - d * 2.4) / 0.9);
      r.scale.y = Math.max(0.0001, k < 1 ? easeOutBack(k) : 1);
    }
    if (roof) roof.visible = t > OPENING.rise + 0.42 * 2.4;
    const ct = clamp01((t - OPENING.camera[0]) / (OPENING.camera[1] - OPENING.camera[0]));
    camera.up.set(0, 0, -1).lerp(new THREE.Vector3(0, 1, 0), ease(ct)).normalize();
    between(VIEWS.plan, VIEWS.hero, ct);
    if (t > OPENING.rise + 0.44 * 2.4 + 1 && ct >= 1) {
      for (const r of risers) r.scale.y = 1;
      camera.up.set(0, 1, 0);
      openingDone = true;
    }
    return openingDone;
  };

  // ---------- soft contact shadows under everything on the floor ----------
  // Rendered once, after the opening: the house seen from the floor up, its depth turned into a
  // darkness and blurred, laid on the floor. Furniture and wall bases sit in a soft shadow, the way
  // ambient occlusion would draw them, for nothing per frame.
  const contact = (() => {
    const res = [1024, Math.round((1024 * D) / W)] as const;
    const rt = new THREE.WebGLRenderTarget(res[0], res[1]);
    const rtBlur = new THREE.WebGLRenderTarget(res[0], res[1]);
    rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity: 0, depthWrite: false }));
    plane.position.set(W / 2, 0.0135, D / 2);
    plane.renderOrder = 1;
    plane.scale.y = -1; // the texture comes out flipped (as in three's contact-shadow example)
    plane.visible = false;
    scene.add(plane);
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0, 0.9);
    cam.position.set(W / 2, 0.0125, D / 2);
    cam.rotation.x = Math.PI / 2; // looking up from the floor
    const depth = new THREE.MeshDepthMaterial();
    depth.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * 1.6 );');
    };
    depth.depthTest = depth.depthWrite = false;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
    const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
    hBlur.depthTest = vBlur.depthTest = false;
    const blur = (amount: number) => {
      quad.material = hBlur;
      hBlur.uniforms.tDiffuse.value = rt.texture;
      hBlur.uniforms.h.value = amount / 256;
      renderer.setRenderTarget(rtBlur);
      renderer.render(quad, quadCam);
      quad.material = vBlur;
      vBlur.uniforms.tDiffuse.value = rtBlur.texture;
      vBlur.uniforms.v.value = amount / 256;
      renderer.setRenderTarget(rt);
      renderer.render(quad, quadCam);
    };
    return {
      plane,
      bake() {
        const bg = scene.background;
        const env = scene.environment;
        scene.background = null;
        scene.environment = null;
        const hidden: THREE.Object3D[] = [];
        scene.traverse((o) => {
          if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || o.renderOrder === -1) {
            if (o.visible) hidden.push(o);
            o.visible = false;
          }
        });
        scene.overrideMaterial = depth;
        const clear = renderer.getClearAlpha();
        renderer.setClearAlpha(0);
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(scene, cam);
        scene.overrideMaterial = null;
        blur(1.2);
        blur(0.5);
        renderer.setRenderTarget(null);
        renderer.setClearAlpha(clear);
        for (const o of hidden) o.visible = true;
        scene.background = bg;
        scene.environment = env;
        plane.visible = true;
      },
    };
  })();

  /** After the opening: fold the whole house into a few dozen meshes and bake the contact shadows. */
  const settle = () => {
    mergeStatic(house.group, [...house.moving, contact.plane]);
    contact.bake();
    shadowsDirty = true;
  };

  // ---------- drawing frames only when something changed ----------
  let rich = true; // ambient occlusion while moving; dropped for good if the GPU can't keep up
  let slowFor = 0;
  let lastSig: number[] = [];
  let stillAt = 0;
  let aoStep = -1; // >= 0 while the occlusion fades in on a resting frame
  const AO_STEPS = 9;
  const signature = () => {
    const p = camera.position;
    const q = camera.quaternion;
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, camera.fov, hour, house.drawer.position.z, contact.plane.material.opacity];
  };
  /** Draws a frame if needed. Returns true when it drew (so overlays can follow). */
  const tick = (now: number, dt: number) => {
    // the contact shadows fade in after the bake
    if (contact.plane.visible && contact.plane.material.opacity < 0.62) contact.plane.material.opacity = Math.min(0.62, contact.plane.material.opacity + dt * 1.2);
    const sig = signature();
    const moved = forced || sig.length !== lastSig.length || sig.some((x, i) => Math.abs(x - lastSig[i]) > 1e-5);
    forced = false;
    if (moved) {
      lastSig = sig;
      stillAt = now;
      aoStep = -1;
      if (shadowsDirty || !openingDone) {
        renderer.shadowMap.needsUpdate = true;
        shadowsDirty = false;
      }
      if (rich) {
        ao.blendIntensity = AO_FULL;
        composer.render();
        // a laptop GPU: two seconds of slow frames while moving, and the occlusion waits for rest
        slowFor = dt > 0.026 ? slowFor + dt : Math.max(0, slowFor - dt);
        if (slowFor > 0.6) rich = false;
      } else renderer.render(scene, camera);
      return true;
    }
    if (rich) return false;
    // at rest: fade the occlusion in over a few frames, then stop drawing
    if (aoStep < 0 && now - stillAt > 160) aoStep = 0;
    if (aoStep >= 0 && aoStep <= AO_STEPS) {
      ao.blendIntensity = (AO_FULL * aoStep) / AO_STEPS;
      composer.render();
      aoStep++;
      return true;
    }
    return false;
  };
  const invalidate = () => {
    forced = true;
  };
  /** Compiles every shader up front, so the first frames of the opening don't stutter. */
  const warm = () => renderer.compile(scene, camera);

  return { renderer, composer, ao, scene, camera, target, house, sky, contact: contact.plane, setHour, getHour: () => hour, view, between, planOnScreen, startRise, stepOpening, tick, invalidate, settle, warm, resize, isRich: () => rich };
}
