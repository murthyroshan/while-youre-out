// The house's materials: an architect's model, not a game. Matte plaster, oak, stone, linen and
// one black ink for the section cut. Textures are drawn in code, so nothing is licensed or fetched.
import * as THREE from 'three';

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat: [number, number] = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Oak planks: long boards, slightly different tones, a fine grain. */
function oak() {
  return canvasTexture(
    1024,
    (g, s) => {
      const boards = 8;
      const h = s / boards;
      for (let i = 0; i < boards; i++) {
        const tone = 0.9 + Math.random() * 0.14;
        g.fillStyle = `rgb(${Math.round(176 * tone)}, ${Math.round(138 * tone)}, ${Math.round(96 * tone)})`;
        g.fillRect(0, i * h, s, h);
        // grain
        for (let k = 0; k < 120; k++) {
          g.strokeStyle = `rgba(90, 60, 35, ${0.03 + Math.random() * 0.05})`;
          g.lineWidth = 0.6 + Math.random();
          const y = i * h + Math.random() * h;
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 6, s * 0.7, y + (Math.random() - 0.5) * 6, s, y + (Math.random() - 0.5) * 4);
          g.stroke();
        }
        // board joints, staggered
        g.fillStyle = 'rgba(60, 40, 25, 0.35)';
        g.fillRect(0, i * h, s, 1.5);
        const cut = ((i * 0.37) % 1) * s;
        g.fillRect(cut, i * h, 1.5, h);
      }
    },
    [3, 3],
  );
}

/** Plaster: almost flat, with a faint trowelled unevenness. */
function plaster() {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#efe9df';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,100,80'}, ${Math.random() * 0.035})`;
      const r = 2 + Math.random() * 10;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
      g.fill();
    }
  }, [2, 2]);
}

/** Cast concrete for the roof slab and the plinth. */
function concrete() {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#c9c4bb';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,55,50'}, ${Math.random() * 0.06})`;
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, [4, 1]);
}

export function makeMaterials() {
  const std = (color: string, roughness = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  return {
    plaster: std('#ffffff', 0.95, { map: plaster() }),
    plasterOutside: std('#e7e1d6', 0.95),
    oak: std('#ffffff', 0.7, { map: oak() }),
    oakSolid: std('#b78f5f', 0.65),
    concrete: std('#ffffff', 0.92, { map: concrete() }),
    ink: new THREE.MeshBasicMaterial({ color: '#141416' }),
    cabinet: std('#a7ad9c', 0.62), // soft sage fronts
    cabinetDark: std('#7c8274', 0.6), // the shadow lines between them
    walnut: std('#6a4c37', 0.55),
    stone: std('#dcd6cc', 0.45),
    steel: std('#c9cbcd', 0.3, { metalness: 0.9 }),
    blackGlass: std('#1f2124', 0.1), // dark glass that still reflects the room
    linen: std('#cbbfa9', 0.98),
    linenWhite: std('#f1ece3', 0.98),
    mustard: std('#c8973a', 0.95),
    terracotta: std('#b4664a', 0.9),
    sage: std('#8a9a84', 0.95),
    rug: std('#d9cdb8', 1),
    rugBlue: std('#7d8fa3', 1),
    leaf: std('#efeadf', 1), // an architect's model: smooth, pale, abstract trees
    trunk: std('#cdbfa8', 0.85),
    grass: std('#e2ddd0', 1), // the model's base board
    path: std('#d4cec3', 0.95),
    // plain transparent glass that reflects the sky (real transmission would draw the scene twice)
    glass: new THREE.MeshStandardMaterial({ color: '#cfdde4', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false }),
    frame: std('#2a2c2f', 0.6),
    device: std('#1b1c20', 0.5),
    screenOff: std('#05070b', 0.3),
    pouch: std('#c63b30', 0.7),
    penBody: std('#e8c33a', 0.45),
    penCap: std('#2f6fc4', 0.4),
    lampShade: new THREE.MeshStandardMaterial({ color: '#f3e7d2', roughness: 0.9, emissive: '#ffb46b', emissiveIntensity: 0 }),
    nightLight: new THREE.MeshStandardMaterial({ color: '#ffe1b0', roughness: 0.6, emissive: '#ffb257', emissiveIntensity: 0 }),
    fur: std('#a0763f', 1),
  };
}

export type Materials = ReturnType<typeof makeMaterials>;
