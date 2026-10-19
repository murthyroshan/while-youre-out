// Draw calls are what slow a laptop down, not triangles: the house is ~140 small meshes, and each
// one is drawn again for the shadows. This folds every mesh under a container into one mesh per
// material, so the house draws in a few dozen calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Merges the meshes under `container` (except those inside `keep`) into one mesh per material and
 * shadow setting, added to `container`. Matrices are taken relative to the container.
 */
export function mergeStatic(container: THREE.Object3D, keep: THREE.Object3D[] = []) {
  container.updateMatrixWorld(true);
  const inverse = container.matrixWorld.clone().invert();
  const kept = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== container; p = p.parent) if (keep.includes(p)) return true;
    return false;
  };
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  container.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || kept(mesh) || Array.isArray(mesh.material)) return;
    for (let p = mesh.parent; p && p !== container; p = p.parent) if (!p.visible) return;
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [], meshes: [] }));
    const g = mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    b.parts.push(g.index ? g.toNonIndexed() : g);
    b.meshes.push(mesh);
  });
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const merged = mergeGeometries(b.parts, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    container.add(mesh);
    for (const m of b.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    for (const g of b.parts) g.dispose();
  }
}
