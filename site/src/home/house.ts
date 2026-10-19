// The Sharma family's house, built in code: a modern single-storey home drawn as an architect's
// section. Four rooms sit side by side behind the cut (the hall, the living room, the kitchen and
// Maya's room); the cut edges are solid ink, as on a drawing. Units are metres; the camera looks
// from the front (+z) at the back wall (z = 0).
import * as THREE from 'three';
import type { Materials } from './materials';

export const H = 3; // ceiling height
const T = 0.2; // wall thickness
export const W = 16; // house width
export const D = 6; // house depth (the cut is at z = D)

export interface Rect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface House {
  group: THREE.Group;
  /** What rises in the opening, in order (walls first, then the furniture). */
  rising: THREE.Object3D[];
  /** The plan as rectangles (top view), for the ink drawing. */
  plan: Rect[];
  /** Openings in the plan (doors, windows), drawn as gaps. */
  openings: Rect[];
  rooms: Record<'hall' | 'living' | 'kitchen' | 'maya', THREE.Vector3>;
  echo: { screen: THREE.Mesh; width: number; height: number };
  drawer: THREE.Object3D;
  pouch: THREE.Object3D;
  door: THREE.Object3D;
  doorbell: THREE.Object3D;
  lights: { room: Record<'hall' | 'living' | 'kitchen' | 'maya', THREE.PointLight>; spots: Record<'living' | 'lamp' | 'maya' | 'night', THREE.Vector3> };
  halos: { lamp: THREE.Sprite; pendants: THREE.Sprite[]; night: THREE.Sprite };
  /** What must stay separate when the house is merged (it moves, or something follows it). */
  moving: THREE.Object3D[];
  glow: { lampShade: THREE.MeshStandardMaterial; nightLight: THREE.MeshStandardMaterial; pendants: THREE.MeshStandardMaterial };
}

export function buildHouse(m: Materials): House {
  const group = new THREE.Group();
  const rising: THREE.Object3D[] = [];
  const plan: Rect[] = [];
  const openings: Rect[] = [];

  /** A box from corner (x1,y1,z1) to corner (x2,y2,z2). */
  const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, mat: THREE.Material, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1)), mat);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  /** A group whose origin sits on the floor, so it can grow upward in the opening. */
  const riser = (x: number, z: number, delay: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.userData.delay = delay;
    group.add(g);
    rising.push(g);
    return g;
  };

  // ---------- ground, plinth, floor ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), m.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.26;
  ground.receiveShadow = true;
  group.add(ground);
  box(-0.4, -0.26, -0.4, W + 0.4, -0.02, D, m.concrete); // plinth
  box(-0.4, -0.26, D, W + 0.4, -0.02, D + 0.006, m.ink); // its cut face
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, D - T), m.oak);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0.001, T + (D - T) / 2);
  floor.receiveShadow = true;
  group.add(floor);
  box(-6, -0.255, 2.55, 0, -0.24, 3.25, m.path); // the path to the front door

  // ---------- walls (each grows from the floor in the opening) ----------
  /** A wall along x (at z1..z2) from x1 to x2, with rectangular holes [x1, x2, y1, y2]. */
  const wallX = (x1: number, x2: number, z1: number, z2: number, holes: Array<[number, number, number, number]>, delay: number) => {
    const g = riser(0, 0, delay);
    const cuts = [...holes].sort((a, b) => a[0] - b[0]);
    let x = x1;
    for (const [hx1, hx2, hy1, hy2] of cuts) {
      if (hx1 > x) box(x, 0, z1, hx1, H, z2, m.plaster, g);
      if (hy1 > 0) box(hx1, 0, z1, hx2, hy1, z2, m.plaster, g);
      if (hy2 < H) box(hx1, hy2, z1, hx2, H, z2, m.plaster, g);
      // the window: a thin frame and glass
      if (hy1 > 0) {
        box(hx1, hy1, z1 + 0.06, hx2, hy1 + 0.04, z2 - 0.06, m.frame, g);
        box(hx1, hy2 - 0.04, z1 + 0.06, hx2, hy2, z2 - 0.06, m.frame, g);
        box(hx1, hy1, z1 + 0.06, hx1 + 0.04, hy2, z2 - 0.06, m.frame, g);
        box(hx2 - 0.04, hy1, z1 + 0.06, hx2, hy2, z2 - 0.06, m.frame, g);
        const glass = box(hx1 + 0.04, hy1 + 0.04, z1 + 0.095, hx2 - 0.04, hy2 - 0.04, z1 + 0.105, m.glass, g);
        glass.castShadow = false;
      }
      openings.push({ x1: hx1, z1, x2: hx2, z2 });
      x = hx2;
    }
    if (x < x2) box(x, 0, z1, x2, H, z2, m.plaster, g);
    plan.push({ x1, z1, x2, z2 });
  };
  /** A wall along z (at x1..x2) from z1 to z2, with holes [z1, z2, y1, y2]. */
  const wallZ = (x1: number, x2: number, z1: number, z2: number, holes: Array<[number, number, number, number]>, delay: number, inkEnd = true) => {
    const g = riser(0, 0, delay);
    let z = z1;
    for (const [hz1, hz2, hy1, hy2] of [...holes].sort((a, b) => a[0] - b[0])) {
      if (hz1 > z) box(x1, 0, z, x2, H, hz1, m.plaster, g);
      if (hy1 > 0) box(x1, 0, hz1, x2, hy1, hz2, m.plaster, g);
      if (hy2 < H) box(x1, hy2, hz1, x2, H, hz2, m.plaster, g);
      openings.push({ x1, z1: hz1, x2, z2: hz2 });
      z = hz2;
    }
    if (z < z2) box(x1, 0, z, x2, H, z2, m.plaster, g);
    // the section cut: where the front of the house was sliced away, the wall end is solid ink
    if (inkEnd) box(x1 - 0.002, 0, z2, x2 + 0.002, H, z2 + 0.006, m.ink, g);
    plan.push({ x1, z1, x2, z2 });
  };

  // back wall, with the living room window and Maya's window
  wallX(0, W, 0, T, [
    [4.6, 7.6, 0.7, 2.6],
    [13.8, 15.2, 1.1, 2.3],
  ], 0);
  // the outside walls at both ends; the front door is in the left one
  wallZ(0, T, 0, D, [[2.4, 3.4, 0, 2.2]], 0.05);
  wallZ(W - T, W, 0, D, [], 0.05);
  // partitions: hall | living (a doorway near the front), a short stub between the open living
  // room and kitchen, and kitchen | Maya's room
  wallZ(3.2, 3.2 + T * 0.75, T, D, [[4.4, 5.4, 0, 2.1]], 0.1);
  wallZ(9.0, 9.0 + T * 0.75, T, 1.4, [], 0.12);
  wallZ(13.0, 13.0 + T * 0.75, T, D, [[4.2, 5.1, 0, 2.1]], 0.14);

  // the roof slab, cut at the front; it lands last
  const roof = riser(0, 0, 0.42);
  box(-0.3, H, -0.3, W + 0.3, H + 0.22, D, m.concrete, roof);
  box(-0.3, H, D, W + 0.3, H + 0.22, D + 0.006, m.ink, roof);
  roof.visible = false; // shown once the walls are up (it would hide the interior from the drawing's view)

  // ---------- hall ----------
  const doorPivot = new THREE.Group();
  doorPivot.position.set(T, 0, 2.4);
  group.add(doorPivot);
  box(-0.025, 0, 0, 0.025, 2.18, 1.0, m.oakSolid, doorPivot);
  box(0.03, 1.0, 0.85, 0.06, 1.04, 0.92, m.steel, doorPivot); // handle
  rising.push(Object.assign(doorPivot, { userData: { delay: 0.2 } }));
  const bell = new THREE.Group();
  box(-0.05, 1.25, 3.55, -0.005, 1.38, 3.62, m.device, bell); // the doorbell camera, outside
  group.add(bell);
  const consoleT = riser(1.4, 0.42, 0.3);
  box(-0.8, 0.76, -0.18, 0.8, 0.8, 0.18, m.oakSolid, consoleT);
  for (const sx of [-0.74, 0.74]) box(sx - 0.02, 0, -0.14, sx + 0.02, 0.76, 0.14, m.frame, consoleT);
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 24), m.terracotta);
  vase.position.set(0.45, 0.95, 0);
  vase.castShadow = true;
  consoleT.add(vase);

  // ---------- living room ----------
  const rug = riser(6.2, 3.4, 0.3);
  box(-2, 0, -1.4, 2, 0.012, 1.4, m.rug, rug);
  const sofa = riser(6.1, 0.72, 0.32);
  box(-1.7, 0.1, -0.45, 1.7, 0.44, 0.45, m.linen, sofa); // seat
  box(-1.7, 0.1, -0.45, 1.7, 0.86, -0.22, m.linen, sofa); // back
  box(-1.85, 0.1, -0.45, -1.62, 0.62, 0.45, m.linen, sofa); // arms
  box(1.62, 0.1, -0.45, 1.85, 0.62, 0.45, m.linen, sofa);
  box(-1.1, 0.44, -0.2, -0.45, 0.78, -0.08, m.mustard, sofa); // cushions
  box(0.5, 0.44, -0.2, 1.1, 0.75, -0.08, m.sage, sofa);
  const table = riser(6.1, 2.55, 0.36);
  box(-0.8, 0.36, -0.36, 0.8, 0.4, 0.36, m.oakSolid, table);
  for (const [sx, sz] of [[-0.72, -0.28], [0.72, -0.28], [-0.72, 0.28], [0.72, 0.28]]) box(sx - 0.02, 0, sz - 0.02, sx + 0.02, 0.36, sz + 0.02, m.frame, table);
  const lamp = riser(8.35, 0.75, 0.38);
  box(-0.015, 0, -0.015, 0.015, 1.5, 0.015, m.frame, lamp);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 32, 1, true), m.lampShade);
  shade.position.y = 1.55;
  lamp.add(shade);
  const tv = riser(3.42, 2.3, 0.38);
  box(0, 1.05, -0.7, 0.04, 1.85, 0.7, m.blackGlass, tv);
  // Bruno, asleep in his bed
  const dog = riser(4.2, 4.7, 0.42);
  const bed = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.1, 16, 40), m.rugBlue);
  bed.rotation.x = Math.PI / 2;
  bed.position.y = 0.1;
  dog.add(bed);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.32, 8, 16), m.fur);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.16, 0);
  dog.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), m.fur);
  head.position.set(0.3, 0.16, 0.06);
  dog.add(head);
  for (const e of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), m.trunk);
    ear.scale.set(0.6, 1.2, 0.5);
    ear.position.set(0.3, 0.24, 0.06 + e * 0.07);
    dog.add(ear);
  }
  dog.traverse((o) => (o.castShadow = true));

  // ---------- kitchen ----------
  const run = riser(0, 0, 0.3);
  box(9.25, 0, T, 12.05, 0.86, 0.8, m.cabinet, run); // base cabinets
  box(9.22, 0.86, T, 12.08, 0.9, 0.83, m.stone, run); // worktop
  for (const x of [9.85, 10.3, 10.88, 11.62]) box(x - 0.004, 0.08, 0.8, x + 0.004, 0.84, 0.802, m.cabinetDark, run); // door joints
  box(10.95, 0.9, 0.3, 11.6, 0.906, 0.75, m.blackGlass, run); // the cooktop
  box(10.2, 1.55, T, 12.05, 2.3, 0.55, m.cabinet, run); // upper cabinets
  box(11.05, 1.45, T, 11.5, 1.55, 0.6, m.steel, run); // extractor
  // the drawer left of the stove, where the EpiPen is kept; it slides open
  const drawer = new THREE.Group();
  drawer.position.set(10.575, 0.76, 0.8);
  group.add(drawer);
  // an open tray: the front is the cabinet face, the inside is pale oak
  box(-0.27, -0.075, -0.005, 0.27, 0.075, 0.02, m.cabinet, drawer); // front
  box(-0.25, -0.07, -0.5, 0.25, -0.055, -0.005, m.oakSolid, drawer); // bottom
  for (const sx of [-0.25, 0.235]) box(sx, -0.07, -0.5, sx + 0.015, 0.05, -0.005, m.oakSolid, drawer); // sides
  box(-0.25, -0.07, -0.5, 0.25, 0.05, -0.485, m.oakSolid, drawer); // back
  box(-0.06, 0.02, 0.02, 0.06, 0.035, 0.045, m.steel, drawer); // pull
  // the red pouch, unzipped, with the EpiPen lying on it
  const pouch = new THREE.Group();
  drawer.add(pouch);
  box(-0.13, -0.055, -0.3, 0.09, -0.015, -0.13, m.pouch, pouch);
  const pen = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.13, 6, 16), m.penBody);
  pen.rotation.z = Math.PI / 2;
  pen.position.set(-0.02, -0.0, -0.215);
  pen.castShadow = true;
  pouch.add(pen);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.035, 16), m.penCap);
  cap.rotation.z = Math.PI / 2;
  cap.position.set(-0.095, 0, -0.215);
  pouch.add(cap);
  pouch.visible = false;
  // the fridge
  const fridge = riser(12.47, 0.53, 0.34);
  box(-0.36, 0, -0.32, 0.36, 2.02, 0.32, m.steel, fridge);
  box(-0.36, 1.18, 0.32, 0.36, 1.19, 0.325, m.frame, fridge);
  box(0.25, 1.28, 0.325, 0.27, 1.75, 0.345, m.frame, fridge);
  // the island, with Priya's phone
  const island = riser(10.9, 3.05, 0.36);
  box(-1.0, 0, -0.45, 1.0, 0.86, 0.45, m.walnut, island);
  box(-1.05, 0.86, -0.5, 1.05, 0.9, 0.5, m.stone, island);
  box(0.4, 0.9, -0.05, 0.55, 0.907, 0.24, m.blackGlass, island); // phone
  for (const sx of [-0.55, 0.15]) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 28), m.oakSolid);
    stool.position.set(sx, 0.66, 0.78);
    stool.castShadow = true;
    island.add(stool);
    box(sx - 0.015, 0, 0.765, sx + 0.015, 0.64, 0.795, m.frame, island);
  }
  // pendant lights over the island
  const pendants = new THREE.MeshStandardMaterial({ color: '#f1e3c8', roughness: 0.8, emissive: '#ffb46b', emissiveIntensity: 0 });
  for (const px of [10.4, 11.4]) {
    const p = riser(px, 3.05, 0.4);
    box(-0.004, 1.85, -0.004, 0.004, H, 0.004, m.frame, p);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 0.18, 28, 1, true), pendants);
    cup.position.y = 1.8;
    p.add(cup);
  }
  // the Echo Show 15 on the wall by the worktop
  const echoW = 0.4;
  const echoH = 0.25;
  const echoDev = riser(9.72, 0, 0.44);
  box(-echoW / 2 - 0.012, 1.33, T, echoW / 2 + 0.012, 1.33 + echoH + 0.024, T + 0.03, m.device, echoDev);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(echoW, echoH), m.screenOff);
  screen.position.set(0, 1.33 + 0.012 + echoH / 2, T + 0.0305);
  echoDev.add(screen);

  // ---------- Maya's room ----------
  const kidBed = riser(14.45, 1.25, 0.32);
  box(-0.95, 0.12, -1.0, 0.95, 0.32, 1.0, m.oakSolid, kidBed);
  box(-0.9, 0.32, -0.95, 0.9, 0.5, 0.95, m.linenWhite, kidBed);
  box(-0.92, 0.5, -0.2, 0.92, 0.56, 0.97, m.rugBlue, kidBed); // blanket
  box(-0.45, 0.5, -0.92, 0.45, 0.62, -0.62, m.linenWhite, kidBed); // pillow
  for (const [sx, sz] of [[-0.9, -0.95], [0.9, -0.95], [-0.9, 0.95], [0.9, 0.95]]) box(sx - 0.03, 0, sz - 0.03, sx + 0.03, 0.12, sz + 0.03, m.oakSolid, kidBed);
  const stand = riser(15.55, 0.5, 0.36);
  box(-0.18, 0, -0.2, 0.18, 0.48, 0.2, m.oakSolid, stand);
  const nightLight = new THREE.MeshStandardMaterial({ color: '#ffe1b0', roughness: 0.6, emissive: '#ffb257', emissiveIntensity: 0 });
  const moonLamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), nightLight);
  moonLamp.position.set(0, 0.57, 0);
  stand.add(moonLamp);
  const kidRug = riser(14.4, 3.6, 0.3);
  const round = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.012, 48), m.rugBlue);
  round.position.y = 0.006;
  round.receiveShadow = true;
  kidRug.add(round);
  const toys = riser(13.45, 3.2, 0.4);
  box(-0.18, 0, -0.18, 0.18, 0.36, 0.18, m.oakSolid, toys);
  box(-0.12, 0.36, -0.1, 0.06, 0.48, 0.08, m.mustard, toys);
  box(0.0, 0.36, -0.05, 0.14, 0.44, 0.1, m.terracotta, toys);

  // ---------- garden: a few trees behind the house ----------
  // as on a model maker's bench: a turned dowel and a smooth crown, round or columnar
  const tree = (x: number, z: number, s: number, kind: 'round' | 'column' = 'round') => {
    const t = new THREE.Group();
    t.position.set(x, -0.25, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.05 * s, 1.5 * s, 12), m.trunk);
    trunk.position.y = 0.75 * s;
    t.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), m.leaf);
    if (kind === 'round') {
      crown.scale.set(1.05 * s, 0.95 * s, 1.05 * s);
      crown.position.y = 2.15 * s;
    } else {
      crown.scale.set(0.55 * s, 1.55 * s, 0.55 * s);
      crown.position.y = 2.6 * s;
    }
    t.add(crown);
    t.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    t.userData.delay = 0.5;
    group.add(t);
    rising.push(t);
  };
  tree(-3.4, -2.6, 1.25);
  tree(-1.2, -4.2, 1.0, 'column');
  tree(3.2, -4.6, 1.55);
  tree(9.6, -4.0, 1.05, 'column');
  tree(11.4, -3.4, 1.15);
  tree(18.6, -1.9, 1.4);
  tree(20.2, 1.2, 0.95, 'column');
  tree(-6.5, 4.5, 1.05);

  // ---------- light fittings (off until the evening) ----------
  const point = (x: number, y: number, z: number, intensity = 0, distance = 9) => {
    const l = new THREE.PointLight('#ffb46b', intensity, distance, 1.6);
    l.position.set(x, y, z);
    group.add(l);
    return l;
  };
  // four lights in all: every pixel pays for every light, lit or not. The living room's light
  // moves to the floor lamp when the ceiling light goes off; Maya's moves to her night light.
  const lights = {
    room: { hall: point(1.6, 2.7, 3), living: point(6.1, 2.7, 3), kitchen: point(10.9, 2.5, 3), maya: point(14.4, 2.7, 3) },
    spots: { living: new THREE.Vector3(6.1, 2.7, 3), lamp: new THREE.Vector3(8.3, 1.45, 1.0), maya: new THREE.Vector3(14.4, 2.7, 3), night: new THREE.Vector3(15.5, 0.8, 0.75) },
  };

  // the glow around lit lamps, without a bloom pass: soft additive halos that follow the lights
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,214,160,0.9)');
    r.addColorStop(0.25, 'rgba(255,190,120,0.35)');
    r.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const halo = (x: number, y: number, z: number, size: number) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(size);
    group.add(sp);
    return sp;
  };
  const halos = { lamp: halo(8.35, 1.55, 0.75, 0.9), pendants: [halo(10.4, 1.72, 3.05, 0.7), halo(11.4, 1.72, 3.05, 0.7)], night: halo(15.55, 0.57, 0.5, 0.5) };

  const rooms = {
    hall: new THREE.Vector3(1.6, 1.2, 3),
    living: new THREE.Vector3(6.1, 1.0, 2.5),
    kitchen: new THREE.Vector3(10.9, 1.1, 1.8),
    maya: new THREE.Vector3(14.4, 0.9, 2.0),
  };

  return {
    group,
    rising,
    plan,
    openings,
    rooms,
    echo: { screen, width: echoW, height: echoH },
    drawer,
    pouch,
    door: doorPivot,
    doorbell: bell,
    lights,
    halos,
    moving: [drawer, doorPivot, screen],
    glow: { lampShade: m.lampShade, nightLight, pendants },
  };
}
