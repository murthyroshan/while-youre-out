// The night sky behind the content pages: one small fragment shader (no library) with drifting
// aurora in Alexa's cyan and the house's warm light, stars that twinkle, and a soft glow where the
// pointer is. Drawn at most 30 times a second, only while it can be seen; one still frame when
// the reader prefers less motion.

const FRAG = `
precision mediump float;
uniform vec2 r;
uniform float t;
uniform vec2 m;
uniform float s;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = (gl_FragCoord.xy - 0.5 * r) / r.y;
  float scroll = s * 0.00025;
  vec3 col = mix(vec3(0.016, 0.024, 0.06), vec3(0.05, 0.075, 0.16), smoothstep(-0.2, 1.1, uv.y));
  // aurora: two folded bands, slowly moving, shifting as you scroll
  vec2 q = vec2(p.x * 1.1 + t * 0.015, p.y * 1.6 + scroll);
  float w = fbm(q + fbm(q * 1.3 - t * 0.02));
  float band = smoothstep(0.38, 0.8, w) * smoothstep(-0.7, 0.4, p.y + 0.15 * sin(p.x * 2.0 + t * 0.05));
  vec3 cyan = vec3(0.06, 0.62, 0.82);
  vec3 violet = vec3(0.35, 0.22, 0.75);
  vec3 warm = vec3(1.0, 0.62, 0.32);
  vec3 tint = mix(cyan, violet, smoothstep(-0.6, 0.8, p.x + 0.3 * sin(t * 0.03)));
  col += band * tint * 0.5;
  col += smoothstep(0.62, 0.95, w) * warm * 0.05 * smoothstep(0.2, -0.6, p.y);
  // stars
  vec2 g = floor(gl_FragCoord.xy / 2.0 + vec2(0.0, scroll * 900.0));
  float st = h(g);
  float tw = 0.6 + 0.4 * sin(t * (1.0 + st * 3.0) + st * 40.0);
  col += step(0.9965, st) * tw * vec3(0.85, 0.9, 1.0) * smoothstep(0.0, 0.5, uv.y + 0.2);
  // the pointer's light
  vec2 mp = (m - 0.5 * r) / r.y;
  col += vec3(0.1, 0.55, 0.75) * 0.11 * exp(-length(p - mp) * 2.6);
  // vignette and a little grain
  col *= 1.0 - 0.35 * length(uv - 0.5);
  col += (h(gl_FragCoord.xy + t) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

/** Fills `canvas` (sized by CSS) with the sky. Returns nothing; it looks after itself. */
export function mountSky(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;
  const shader = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = { r: gl.getUniformLocation(prog, 'r'), t: gl.getUniformLocation(prog, 't'), m: gl.getUniformLocation(prog, 'm'), s: gl.getUniformLocation(prog, 's') };

  // drawn at a little under full resolution: it's soft, and it should cost nothing
  const scale = Math.min(devicePixelRatio, 1.25) * 0.75;
  const size = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };
  const mouse = { x: 0.7, y: 0.75, tx: 0.7, ty: 0.75 };
  addEventListener('pointermove', (e) => {
    const b = canvas.getBoundingClientRect();
    mouse.tx = (e.clientX - b.left) / b.width;
    mouse.ty = 1 - (e.clientY - b.top) / b.height;
  }, { passive: true });

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true;
  let last = 0;
  const start = performance.now();
  const draw = (now: number) => {
    size();
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    gl.uniform2f(u.r, canvas.width, canvas.height);
    gl.uniform1f(u.t, (now - start) / 1000);
    gl.uniform2f(u.m, mouse.x * canvas.width, mouse.y * canvas.height);
    gl.uniform1f(u.s, scrollY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const loop = (now: number) => {
    if (!visible) return;
    requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    draw(now);
  };
  if (still) {
    draw(performance.now());
    addEventListener('resize', () => draw(performance.now()));
    return;
  }
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) requestAnimationFrame(loop);
  }).observe(canvas);
  requestAnimationFrame(loop);
}
