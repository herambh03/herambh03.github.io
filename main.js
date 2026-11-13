import * as THREE from 'three';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { ShaderPass } from './vendor/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';

const body = document.body;
const $ = (s) => document.querySelector(s);
const intro = $('#intro');
const isMobile = matchMedia('(max-width:800px)').matches || 'ontouchstart' in window;

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
const params = new URLSearchParams(location.search);
if (!webglOK() || params.has('plain')) { plain(); } else { start(); }

function plain() { body.classList.add('nogl'); intro.classList.add('off'); setTimeout(() => intro.remove(), 700); }
$('#skip').addEventListener('click', (e) => { e.preventDefault(); plain(); });

function start() {
  body.classList.remove('nogl');
  body.dataset.mode = 'explore';
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.6);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020a12, isMobile ? 0.022 : 0.017);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

  const BLUE = 0x18d0ff, ORANGE = 0xff6a1a, WHITE = 0xf2f8ff;
  const L = 480; // period of the endless world along z
  const mod = (a, n) => ((a % n) + n) % n;
  const near = (base, ref) => ref + mod(base - ref + L / 2, L) - L / 2;

  // seeded random
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* ---------- ground ---------- */
  const gcv = document.createElement('canvas'); gcv.width = gcv.height = 256;
  { const g = gcv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(24,208,255,.55)'; g.lineWidth = 3; g.strokeRect(1, 1, 254, 254); }
  const gtex = new THREE.CanvasTexture(gcv); gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(60, 60); gtex.anisotropy = 4;
  const TILE = 4;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ map: gtex, transparent: true, opacity: 0.55, fog: true }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  // road surface
  const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 400), new THREE.MeshBasicMaterial({ color: 0x03080e, fog: true }));
  road.rotation.x = -Math.PI / 2; road.position.y = 0.01; scene.add(road);
  const edgeMat = (c) => new THREE.MeshBasicMaterial({ color: c, fog: true });
  const edgeL = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 400), edgeMat(BLUE)); edgeL.rotation.x = -Math.PI / 2; edgeL.position.set(-6.5, 0.02, 0);
  const edgeR = edgeL.clone(); edgeR.position.x = 6.5; scene.add(edgeL, edgeR);
  const dashes = [];
  for (let i = 0; i < 120; i++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 2.4), edgeMat(ORANGE)); d.rotation.x = -Math.PI / 2; d.userData.b = (i >> 1) * 8; d.userData.x = i % 2 ? 3.3 : -3.3; scene.add(d); dashes.push(d); }

  /* ---------- buildings ---------- */
  function winTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#02070c'; g.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) {
      const r = Math.random(); if (r < 0.22) { g.fillStyle = r < 0.05 ? '#ff6a1a' : r < 0.18 ? '#18d0ff' : '#cfeaff'; g.globalAlpha = 0.35 + Math.random() * 0.45; g.fillRect(x, y, 4, 5); }
    }
    g.globalAlpha = 1; const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
  }
  const wt = [winTex(), winTex(), winTex()];
  const buildings = [];
  const NB = isMobile ? 46 : 80;
  for (let i = 0; i < NB; i++) {
    const side = i % 2 ? 1 : -1;
    const w = 6 + rnd() * 9, d = 6 + rnd() * 9, h = 14 + rnd() * 46;
    const x = side * (15 + w / 2 + rnd() * 14);
    const t = wt[i % 3].clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(2, Math.round(h / 7)));
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ map: t, color: 0x8899aa, fog: true }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: rnd() < 0.22 ? ORANGE : BLUE, fog: true }));
    m.add(edges); m.position.set(x, h / 2, 0); m.userData.b = (i / NB) * L + rnd() * 6;
    // rooftop beacon
    const bc = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: rnd() < 0.5 ? ORANGE : WHITE, fog: false }));
    bc.position.y = h / 2 + 0.4; m.add(bc);
    scene.add(m); buildings.push(m);
  }

  /* ---------- billboards ---------- */
  const SIGNS = [
    ['HERAMBH DAKSHINAMOORTHY', 'AUTOMOTIVE DESIGN ENGINEER', BLUE],
    ['ATHER ENERGY', 'CHASSIS STRUCTURAL ENGINEER  /  MAY 2026 -', ORANGE],
    ['SHOCKWAVE CHASSIS', '18 KG  /  20G VERTICAL JUMP LOADS', BLUE],
    ['3 PLATFORMS  /  9 MONTHS', 'F77 MACH 2  /  F77 SUPERSTREET  /  X47 CROSSOVER', ORANGE],
    ['LAP TIME SIMULATOR', 'FORWARD-BACKWARD OPTIMIZATION  /  FASTF1', BLUE],
    ['ACKERMANN OPTIMIZATION', 'TIRE DATA  /  FORMULA STUDENT STEERING', ORANGE],
    ['PINN BATTERY TEMPERATURE', 'IEEE GLOBCONET 2023', BLUE],
    ['SELF-DRIVING CONTROL', 'PID  /  CARLA  /  100% WAYPOINT COVERAGE', ORANGE],
    ['FORMULA STUDENT CAPTAIN', '25+ ENGINEERS  /  FIRST ELECTRIC CAR IN 18 MONTHS', BLUE],
    ['RGB RACING, MADRID', 'PORSCHE 992 GT3 TIRE + RACE DATA ANALYSIS', ORANGE],
    ['IIT (ISM) DHANBAD', 'B.TECH MECHANICAL ENGINEERING  /  GPA 8.64', BLUE],
    ['GET IN TOUCH', 'HERAMBHD03@GMAIL.COM', ORANGE],
  ];
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  function signTex(title, sub, col, n) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d');
    g.fillStyle = 'rgba(2,8,14,.92)'; g.fillRect(0, 0, 640, 360);
    g.strokeStyle = hex(col); g.lineWidth = 6; g.strokeRect(10, 10, 620, 340);
    g.lineWidth = 2; g.globalAlpha = .5; g.strokeRect(24, 24, 592, 312); g.globalAlpha = 1;
    g.fillStyle = hex(col); g.font = '700 22px monospace'; g.fillText(String(n + 1).padStart(2, '0') + ' / 12', 40, 62);
    g.fillRect(40, 76, 80, 4);
    g.fillStyle = '#f2f8ff'; g.font = '900 54px Helvetica, Arial, sans-serif';
    const words = title.split(' '); let line = '', y = 150; const lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > 560 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    if (lines.length > 2) g.font = '900 42px Helvetica, Arial, sans-serif';
    lines.forEach((ln, i) => g.fillText(ln, 40, y + i * 58));
    g.fillStyle = hex(col); g.font = '700 22px monospace';
    const sw = sub.split('  /  '); sw.forEach((s, i) => g.fillText(s, 40, 292 - (sw.length - 1 - i) * 30 + 10));
    // scan noise lines
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let yy = 0; yy < 360; yy += 4) g.fillRect(0, yy, 640, 1);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  const SPACING = L / SIGNS.length;
  const signs = [];
  SIGNS.forEach((s, i) => {
    const side = i % 2 ? 1 : -1;
    const grp = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(11, 6.2), new THREE.MeshBasicMaterial({ map: signTex(s[0], s[1], s[2], i), toneMapped: false, fog: true }));
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(11.4, 6.6)), new THREE.LineBasicMaterial({ color: s[2], fog: true }));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5, 0.18), new THREE.MeshBasicMaterial({ color: s[2], fog: true }));
    post.position.set(0, -5.6, -0.2);
    grp.add(plane, frame, post);
    grp.position.set(side * 13.5, 7.2, 0); grp.rotation.y = -side * 0.42;
    grp.userData.b = 30 + i * SPACING; scene.add(grp); signs.push(grp);
  });

  /* ---------- rain / particles ---------- */
  const NP = isMobile ? 300 : 700;
  const pg = new THREE.BufferGeometry(); const pp = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pp[i * 3] = (rnd() - 0.5) * 80; pp[i * 3 + 1] = rnd() * 40; pp[i * 3 + 2] = (rnd() - 0.5) * 200; }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const rain = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9fe8ff, size: 0.12, transparent: true, opacity: 0.7, fog: true }));
  rain.frustumCulled = false; scene.add(rain);

  /* ---------- bike ---------- */
  const bike = new THREE.Group(); const lean = new THREE.Group(); bike.add(lean); scene.add(bike);
  const lm = (c, w = 1) => new THREE.LineBasicMaterial({ color: c });
  const N = { hl: [1.0, .55, 0], tl: [.9, .62, 0], tF: [.55, .62, .16], tFr: [.55, .62, -.16], tB: [-.1, .6, .16], tBr: [-.1, .6, -.16], sF: [-.15, .5, .12], sFr: [-.15, .5, -.12], tail: [-1.0, .62, .1], tailr: [-1.0, .62, -.1], pL: [-.35, .05, .16], pR: [-.35, .05, -.16], swL: [-1.0, -.1, .16], swR: [-1.0, -.1, -.16], eF: [.25, 0, .13], eFr: [.25, 0, -.13], fL: [1.35, -.12, .12], fR: [1.35, -.12, -.12], bL: [.95, .78, .35], bR: [.95, .78, -.35] };
  const E = [['hl', 'tl'], ['hl', 'tF'], ['hl', 'tFr'], ['tF', 'tB'], ['tFr', 'tBr'], ['tF', 'tFr'], ['tB', 'tBr'], ['tB', 'pL'], ['tBr', 'pR'], ['tF', 'eF'], ['tFr', 'eFr'], ['eF', 'pL'], ['eFr', 'pR'], ['pL', 'pR'], ['eF', 'eFr'], ['tB', 'sF'], ['tBr', 'sFr'], ['sF', 'tail'], ['sFr', 'tailr'], ['tail', 'tailr'], ['pL', 'sF'], ['pR', 'sFr'], ['pL', 'swL'], ['pR', 'swR'], ['swL', 'swR'], ['hl', 'fL'], ['hl', 'fR'], ['hl', 'bL'], ['hl', 'bR']];
  // model x forward -> world -z
  const P3 = (a) => new THREE.Vector3(a[2], a[1], -a[0]);
  const pts = []; E.forEach(([a, b]) => { pts.push(P3(N[a]), P3(N[b])); });
  const frameLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm(ORANGE));
  lean.add(frameLines);
  // thicker look: duplicate with slight offsets
  [0.02, -0.02].forEach((o) => { const f = frameLines.clone(); f.position.y = o; lean.add(f); });
  const nodes = new THREE.Points(new THREE.BufferGeometry().setFromPoints(Object.values(N).map(P3)), new THREE.PointsMaterial({ color: WHITE, size: 0.09 }));
  lean.add(nodes);
  const wheels = [];
  [[1.35, -.12], [-1.0, -.1]].forEach(([fx, fy]) => {
    const wg = new THREE.Group(); wg.position.set(0, fy, -fx);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 36), new THREE.MeshBasicMaterial({ color: BLUE })); tor.rotation.y = Math.PI / 2;
    wg.add(tor);
    const sp = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; sp.push(new THREE.Vector3(0, Math.sin(a) * .5, Math.cos(a) * .5), new THREE.Vector3(0, -Math.sin(a) * .5, -Math.cos(a) * .5)); }
    wg.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(sp), lm(0x0a8fb8)));
    lean.add(wg); wheels.push(wg);
  });
  const head = new THREE.PointLight(0xaeeaff, 2.2, 40); head.position.set(0, 0.9, -2.2); bike.add(head);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x66dfff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.8, -9); 
  const tailGlow = new THREE.PointLight(ORANGE, 1.2, 10); tailGlow.position.set(0, 0.7, 1.4); bike.add(tailGlow);
  bike.scale.setScalar(1.25); lean.position.y = 0.62;

  /* ---------- post ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), isMobile ? 0.45 : 0.6, 0.5, 0.35);
  composer.addPass(bloom);
  const fx = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAb: { value: 0.0006 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime;uniform float uAb;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec2 c=vUv-.5;float d=dot(c,c);vec2 o=c*d*uAb*60.;
    float r=texture2D(tDiffuse,vUv+o).r;float g=texture2D(tDiffuse,vUv).g;float b=texture2D(tDiffuse,vUv-o).b;
    vec3 col=vec3(r,g,b);col=pow(col,vec3(.92));
    col*=1.-smoothstep(.25,.75,d)*.75;col+=(h(vUv*vec2(1920.,1080.)+uTime)-.5)*.02;
    gl_FragColor=vec4(col,1.);}`
  });
  composer.addPass(fx);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h); composer.setPixelRatio(DPR);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  /* ---------- state / input ---------- */
  let mode = 'explore';
  const keys = {};
  const touch = { l: false, r: false, boost: false };
  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && body.dataset.mode === 'explore') e.preventDefault();
    keys[e.code] = true; if (e.code === 'Space') jump();
    if (e.code === 'Escape') setMode('explore');
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  const hold = (id, k) => { const el = $(id); const on = (v) => (e) => { e.preventDefault(); touch[k] = v; }; el.addEventListener('pointerdown', on(true)); ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, on(false))); };
  hold('#bl', 'l'); hold('#br', 'r'); hold('#bb', 'boost');
  $('#bj').addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });
  function setMode(m) {
    mode = m; body.dataset.mode = m;
    document.querySelectorAll('.pills button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  const S = { z: 0, x: 0, vx: 0, speed: 14, y: 0, vy: 0, roll: 0 };
  function jump() { if (S.y <= 0.001) S.vy = 7.5; }

  let started = false;
  function begin() { started = true; intro.classList.add('off'); setTimeout(() => intro.remove(), 700); }
  $('#go').addEventListener('click', begin);
  if (params.has('autostart')) begin();
  if (params.get('mode')) setMode(params.get('mode'));

  /* ---------- loop ---------- */
  const clock = new THREE.Clock(); let t = 0;
  const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
  let viewShift = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05); t += dt;
    const explore = mode === 'explore';
    // controls
    const left = keys.KeyA || keys.ArrowLeft || touch.l, right = keys.KeyD || keys.ArrowRight || touch.r;
    const fwd = keys.KeyW || keys.ArrowUp, back = keys.KeyS || keys.ArrowDown, boost = keys.ShiftLeft || keys.ShiftRight || touch.boost;
    let target = 16, steer = 0;
    if (explore) {
      if (fwd) target = 34; if (boost) target = 62; if (back) target = 5;
      steer = (right ? 1 : 0) - (left ? 1 : 0);
    } else { target = 11; steer = Math.sin(t * 0.35) * 0.5 - S.x * 0.12; }
    if (!started) { target = 8; steer = Math.sin(t * 0.3) * 0.4; }
    S.speed += (target - S.speed) * Math.min(1, dt * 2.2);
    S.vx += (steer * 14 - S.vx) * Math.min(1, dt * 5);
    S.x += S.vx * dt * (0.6 + S.speed / 60);
    if (S.x > 5.4) { S.x = 5.4; S.vx = 0; } if (S.x < -5.4) { S.x = -5.4; S.vx = 0; }
    S.vy -= 22 * dt; S.y += S.vy * dt; if (S.y < 0) { S.y = 0; S.vy = 0; }
    S.z -= S.speed * dt;
    S.roll += ((-S.vx / 14) * 0.5 - S.roll) * Math.min(1, dt * 6);

    bike.position.set(S.x, S.y, S.z);
    bike.rotation.y = -S.vx * 0.018;
    lean.rotation.z = S.roll;
    wheels.forEach((w) => { w.rotation.x -= S.speed * dt / 0.5; });

    // periodic world
    const z = S.z;
    ground.position.set(0, 0, Math.round(z / TILE) * TILE);
    road.position.z = z; edgeL.position.z = z; edgeR.position.z = z;
    dashes.forEach((d) => { d.position.set(d.userData.x, 0.03, near(d.userData.b, z)); });
    buildings.forEach((b) => { b.position.z = near(b.userData.b, z); });
    signs.forEach((s) => { s.position.z = near(s.userData.b, z); });
    const arr = pg.attributes.position.array;
    for (let i = 0; i < NP; i++) { arr[i * 3 + 1] -= dt * 18; if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 40; }
    pg.attributes.position.needsUpdate = true; rain.position.set(S.x, 0, z);

    // camera
    const fov = 62 + Math.min(S.speed, 62) * 0.28; camera.fov += (fov - camera.fov) * 0.08; camera.updateProjectionMatrix();
    const shiftT = (!explore && innerWidth > 800) ? 0.2 : 0; viewShift += (shiftT - viewShift) * 0.06;
    camPos.set(S.x * 0.55 + 2.6, 2.9 + S.y * 0.4, S.z + 6.6);
    camera.position.lerp(camPos, 0.12);
    camTarget.set(S.x * 0.8 - 0.4, 0.9 + S.y * 0.3, S.z - 7);
    camera.lookAt(camTarget);
    camera.setViewOffset(innerWidth, innerHeight, viewShift * innerWidth, 0, innerWidth, innerHeight);
    $('#spd').textContent = String(Math.round(S.speed * 3.6 * 0.9)).padStart(3, '0');
    fx.uniforms.uTime.value = t; fx.uniforms.uAb.value = 0.0004 + S.speed * 0.00001;
    composer.render(dt);
    requestAnimationFrame(frame);
  }
  window.__hd = { S, setMode, begin };
  requestAnimationFrame(frame);
}
