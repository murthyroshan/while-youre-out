// The Echo Show on the kitchen wall is the live product: the real While You're Out, running in a
// frame placed exactly on the 3D screen (CSS3D). The page talks to it with postMessage: it can say
// things to it, and it hears which tools ran (so "where_is EpiPen" can move the camera to the drawer).
import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

export const LIVE_ORIGIN = import.meta.env.DEV ? 'http://127.0.0.1:5173' : 'https://while-youre-out-wpj3.onrender.com';

export interface LiveEvents {
  onTool?: (name: string, args: Record<string, unknown>) => void;
  onSaid?: (text: string) => void;
  onReady?: (parentUrl: string) => void;
}

export function mountLiveScreen(screen: THREE.Mesh, width: number, height: number, camera: THREE.Camera, events: LiveEvents) {
  const css = new CSS3DRenderer();
  css.domElement.className = 'live-layer';
  document.body.append(css.domElement);

  // The app is laid out at the Echo Show's own resolution, then scaled onto the 3D screen.
  const pxW = 1280;
  const pxH = Math.round((1280 * height) / width);
  const frame = document.createElement('iframe');
  frame.title = "The live While You're Out, on the kitchen Echo Show";
  frame.width = String(pxW);
  frame.height = String(pxH);
  frame.allow = 'autoplay; microphone';
  frame.className = 'live-frame';
  const holder = document.createElement('div');
  holder.className = 'live-holder';
  holder.append(frame);
  const obj = new CSS3DObject(holder);
  obj.scale.setScalar(width / pxW);
  // follow the screen every frame: the house rises during the opening, so its place changes
  const follow = () => {
    screen.updateWorldMatrix(true, false);
    screen.getWorldPosition(obj.position);
    screen.getWorldQuaternion(obj.quaternion);
  };
  const scene = new THREE.Scene();
  scene.add(obj);

  let ready = false;
  let shownK = -1;
  window.addEventListener('message', (e) => {
    if (e.origin !== LIVE_ORIGIN || e.data?.source !== 'wyo') return;
    const d = e.data;
    if (d.type === 'tool') events.onTool?.(String(d.name), (d.args as Record<string, unknown>) ?? {});
    else if (d.type === 'said') events.onSaid?.(String(d.text));
    else if (d.type === 'ready') {
      ready = true;
      events.onReady?.(String(d.parentUrl));
    }
  });

  const resize = () => css.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  return {
    render: () => {
      follow();
      css.render(scene, camera);
    },
    /** Starts the live app (only once the reader heads for the kitchen: it's a whole app). */
    load: () => {
      if (!frame.src) frame.src = `${LIVE_ORIGIN}/?embed=1`;
    },
    /** How visible the live screen is (it fades in when the camera is close enough to read it). */
    setVisible: (k: number) => {
      const shown = Math.round(k * 50) / 50;
      if (shown === shownK) return;
      shownK = shown;
      holder.style.opacity = String(shown);
      // fully hidden, the layer is not painted at all
      css.domElement.style.visibility = shown > 0 ? 'visible' : 'hidden';
      holder.style.pointerEvents = shown > 0.95 ? 'auto' : 'none';
      // nor can it be tabbed into while it's faded out
      frame.tabIndex = shown > 0.95 ? 0 : -1;
    },
    say: (text: string) => frame.contentWindow?.postMessage({ target: 'wyo', type: 'say', text }, LIVE_ORIGIN),
    ring: (who: string) => frame.contentWindow?.postMessage({ target: 'wyo', type: 'ring', who }, LIVE_ORIGIN),
    get ready() {
      return ready;
    },
  };
}
