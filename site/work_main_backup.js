/* INNO Missions — scroll-scrubbed film: three AI clips merged into one journey.
   A: The Road (truck + telematics tracking HUD)  →  match-cut dissolve on rear doors  →
   B: The Cargo (doors open, fly inside; services ride the walls in 3D)  →
   bridge: zoom into the dark back wall, logo assembles in the darkness  →
   C: The Cab (driver, telematics HUD)  →  zoom into the dashcam; its screen becomes the page. */
(() => {
  const VW = 1024, VH = 576; // logical coords (tracking/dashcam data); real frames are HD or 4K
  // quality tier: real 4K monitors get 4K, retina laptops 2.5K (lighter decode = smoother), others 1080p
  const devW = Math.max(screen.width, screen.height) * (devicePixelRatio || 1), qs = location.search;
  const RES = /[?&]4k/.test(qs) ? '4k' : /[?&]2k/.test(qs) ? '2k' : /[?&]hd/.test(qs) ? 'hd' : devW > 3400 ? '4k' : devW > 1700 ? '2k' : 'hd';
  const SEG = {
    a: { n: 145, dir: 'frames/' + RES + '/a/', p0: 0.000, p1: 0.335 },
    b: { n: 121, dir: 'frames/' + RES + '/b/', p0: 0.335, p1: 0.625 },
    c: { n: 145, dir: 'frames/' + RES + '/c/', p0: 0.675, p1: 0.97 },
  };
  const DASH = { x: 480, y: 137, w: 166, h: 123 }; // dashcam screen in last C frame (video px)
  // exact (tilted) dashcam screen corners in the last C frame: TL, TR, BR, BL
  const DQ = [[480.5, 156.5], [645.5, 137.5], [642, 257], [480, 258]];
  const DQC = [DQ.reduce((a, p) => a + p[0], 0) / 4, DQ.reduce((a, p) => a + p[1], 0) / 4];
  function homography(w, h, d) { // CSS matrix3d mapping rect (0,0,w,h) onto quad d
    const src = [[0, 0], [w, 0], [w, h], [0, h]], A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = d[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++) {                       // gaussian elimination
      let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = 0; r < 8; r++) if (r !== c) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const H = b.map((v, i) => v / A[i][i]);
    return `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,1)`;
  }

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const range = (p, a, b) => clamp((p - a) / (b - a));

  const film = document.getElementById('film');
  const stage = film.querySelector('.stage');
  const cv = document.getElementById('cv');
  const GL = window.FX && FX.init(cv), ctx = GL ? null : cv.getContext('2d');
  const hud = document.getElementById('hud'), hx = hud.getContext('2d');
  const screenEl = document.getElementById('screen');
  const dcam = document.getElementById('dcam'), dctx = dcam.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  /* ---------- frame loading ---------- */
  const total = SEG.a.n + SEG.b.n + SEG.c.n;
  let loaded = 0, dirty = true;
  for (const k in SEG) {
    const s = SEG[k];
    s.img = new Array(s.n);
    s.ok = new Uint8Array(s.n);
  }
  const ldFill = document.getElementById('ldFill'), ldPct = document.getElementById('ldPct');
  function loadSeg(s) {
    return new Promise(res => {
      let left = s.n, next = 0;
      const pump = () => {
        if (next >= s.n) return;
        const i = next++, im = new Image();
        im.decoding = 'async';
        im.src = s.dir + String(i + 1).padStart(4, '0') + '.webp';
        const done = () => {
          s.ok[i] = im.naturalWidth ? 1 : 0; s.img[i] = im;
          loaded++; dirty = true;
          const pc = Math.round(loaded / total * 100);
          ldFill.style.width = pc + '%'; ldPct.textContent = pc;
          if (--left === 0) res(); else pump();
        };
        im.onload = done; im.onerror = done;
      };
      for (let j = 0; j < 8; j++) pump(); // 8 parallel
    });
  }
  function frame(s, f) {
    let i = Math.round(clamp(f, 0, s.n - 1));
    if (s.ok[i]) return s.img[i];
    for (let d = 1; d < s.n; d++) {           // nearest loaded fallback
      if (i - d >= 0 && s.ok[i - d]) return s.img[i - d];
      if (i + d < s.n && s.ok[i + d]) return s.img[i + d];
    }
    return null;
  }
  document.body.classList.add('loading');
  loadSeg(SEG.a).then(() => {
    document.getElementById('loader').classList.add('done');
    document.body.classList.remove('loading');
    return loadSeg(SEG.b);
  }).then(() => loadSeg(SEG.c));

  /* ---------- view math (video px rect shown on screen) ---------- */
  function cover(fx = .5, fy = .5, zoom = 1) {
    const va = W / H;
    let sw, sh;
    if (va > VW / VH) { sw = VW; sh = VW / va; } else { sh = VH; sw = VH * va; }
    sw /= zoom; sh /= zoom;
    return { x: clamp(fx * VW - sw / 2, 0, VW - sw), y: clamp(fy * VH - sh / 2, 0, VH - sh), w: sw, h: sh };
  }
  function fitInside(r) { // largest viewport-aspect rect inside r, centered
    const va = W / H; let w = r.w, h = r.w / va;
    if (h > r.h) { h = r.h; w = h * va; }
    return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
  }
  const toScreen = (V, x, y) => [(x - V.x) / V.w * W, (y - V.y) / V.h * H];
  let layers = [], fxs = {}, segs = [], lastIdx = -1, lastDir = 1;
  function drawSeg(s, f, V, alpha = 1) { if (alpha > 0) segs.push({ s, f: clamp(f, 0, s.n - 1), V, alpha }); }
  // single segment on screen -> crossfade neighbouring frames (sub-frame smoothness);
  // during dissolves -> nearest frames only. Also pre-decode frames ahead of the scroll direction.
  function resolveSegs() {
    if (segs.length === 1) {
      const { s, f, V, alpha } = segs[0], i0 = Math.floor(f), fr = f - i0;
      const i = Math.round(f);
      draw(frame(s, i), V, alpha);                      // single texture per frame = no upload hitches
      prefetch(s, i);
    } else segs.forEach(({ s, f, V, alpha }) => { draw(frame(s, f), V, alpha); prefetch(s, Math.round(f)); });
  }
  function prefetch(s, i) {
    const key = s.dir + i; if (key === lastIdx) return;
    lastDir = i >= (prefetch[s.dir] ?? i) ? 1 : -1; prefetch[s.dir] = i; lastIdx = key;
    for (let k = 1; k <= 6; k++) { const j = i + k * lastDir; if (j >= 0 && j < s.n && s.ok[j] && s.img[j].decode) s.img[j].decode().catch(() => {}); }
  }
  function draw(img, V, alpha = 1) {
    if (!img || alpha <= 0) return;
    layers.push({ img, V, alpha });
  }
  function paint2D() { // fallback without WebGL
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (const { img, V, alpha } of layers) blit(img, V, alpha);
    if (fxs.dark > 0) { ctx.fillStyle = `rgba(0,0,0,${fxs.dark})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  }
  function blit(img, V, alpha) {
    ctx.globalAlpha = alpha;
    const k = img.naturalWidth / VW;
    ctx.drawImage(img, V.x * k, V.y * k, V.w * k, V.h * k, 0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth; H = stage.clientHeight;
    for (const c of [cv, hud, dcam]) { c.width = W * DPR; c.height = H * DPR; }
    if (ctx) ctx.imageSmoothingQuality = 'high';
    hx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dirty = true;
  }
  addEventListener('resize', resize);
  resize();

  /* ---------- overlays ---------- */
  const ovs = [...document.querySelectorAll('[data-r]')].map(el => ({ el, r: el.dataset.r.split(',').map(Number) }));
  const crates = [...document.querySelectorAll('.crate')];
  const lps = [...document.querySelectorAll('#burstLogo .lp')].map((el, i) => {
    const a = i * 2.39996 + .7, d = 90 + (i * 37) % 70;
    return { el, dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: ((i * 97) % 360) - 180, k: i / 12 };
  });
  const burst = document.querySelector('.burst');
  const railLis = [...document.querySelectorAll('.rail li')];
  const progFill = document.getElementById('progFill');

  function overlays(p) {
    for (const { el, r } of ovs) {
      const [a, b, c, d] = r;
      let o;
      if (p < c) o = a < 0 ? 1 : range(p, a, b); else o = 1 - range(p, c, d);
      o = ease(clamp(o));
      const leaving = p >= c;
      el.style.setProperty('--o', o.toFixed(3));
      el.style.setProperty('--y', ((1 - o) * (leaving ? -40 : 40)).toFixed(1));
      el.style.setProperty('--b', ((1 - o) * 8).toFixed(1));
      el.style.visibility = o < .002 ? 'hidden' : 'visible';

    }
    // cargo: services ride the walls of the box towards the camera
    const t = range(p, .42, .635), side = W < 760 ? 0 : Math.min(W * .17, 270), rot = W < 760 ? 0 : 34;
    crates.forEach((el, i) => {
      const u = clamp((t - i * .18) / .46), s = 2 * u - 1;
      const z = s < 0 ? -150 - 2250 * Math.pow(-s, 1.8) : -150 + 900 * Math.pow(s, 1.8);
      const L = el.dataset.side === 'L' ? -1 : 1;
      const o = Math.min(range(u, 0, .18), 1 - range(u, .82, 1));
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(${L * side}px,0,${z.toFixed(1)}px) rotateY(${-L * rot}deg)`;
    });
    // bridge: logo assembles in the dark
    const k = ease(range(p, .654, .672));
    lps.forEach(l => {
      const q = 1 - ease(clamp((k - l.k * .35) / .65));
      l.el.style.transform = `translate(${(l.dx * q).toFixed(2)}px,${(l.dy * q).toFixed(2)}px) rotate(${(l.r * q).toFixed(1)}deg) scale(${(1 - q * .7).toFixed(3)})`;
      l.el.style.opacity = (1 - q * .9).toFixed(3);
    });
    burst.style.setProperty('--o1', ease(range(p, .664, .669)).toFixed(3));
    burst.style.setProperty('--o2', ease(range(p, .668, .673)).toFixed(3));
    burst.style.setProperty('--o3', ease(range(p, .672, .677)).toFixed(3));
    burst.style.transform = `scale(${(1 + range(p, .677, .69) * .25).toFixed(3)})`;

    const ch = p < .34 ? 0 : p < .64 ? 1 : p < .935 ? 2 : 3;
    railLis.forEach((li, i) => li.classList.toggle('on', i === ch));
    progFill.style.width = (p * 100).toFixed(2) + '%';
    stage.style.setProperty('--bars', (1 - ease(range(p, .02, .07))).toFixed(3));
  }

  /* ---------- "Connect": node network converging into the logo (bridge) ---------- */
  const COLS = ['#674edf', '#89ddff', '#ffcb72'];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const nodes = Array.from({ length: 84 }, (_, i) => ({
    x: rnd(), y: rnd(), ph: rnd() * 6.28, sp: .3 + rnd() * .7, c: COLS[i % 3], r: 1.2 + rnd() * 2.4,
    ang: i * 2.39996, rad: .55 + rnd() * .45,
  }));
  function netDraw(p) {
    const a = Math.min(range(p, .64, .654), 1 - range(p, .664, .676));
    if (a <= 0) return;
    const t = performance.now() / 1000, k = ease(range(p, .646, .666));
    const cx = W / 2, cy = H / 2 - Math.min(W, H) * .07, R = Math.min(W, H) * .16;
    const pts = nodes.map(n => {
      const fx = (n.x + Math.sin(t * n.sp * .3 + n.ph) * .03) * W, fy = (n.y + Math.cos(t * n.sp * .25 + n.ph) * .03) * H;
      const rr = R * n.rad * (1 - k * .55), an = n.ang + t * .25 * (1 - k);
      return [lerp(fx, cx + Math.cos(an) * rr, k), lerp(fy, cy + Math.sin(an) * rr, k), n];
    });
    const md = lerp(150, 70, k), md2 = md * md;
    hx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], d2 = dx * dx + dy * dy;
      if (d2 < md2) {
        hx.globalAlpha = a * (1 - d2 / md2) * .55;
        hx.strokeStyle = pts[i][2].c; hx.beginPath(); hx.moveTo(pts[i][0], pts[i][1]); hx.lineTo(pts[j][0], pts[j][1]); hx.stroke();
      }
    }
    for (const [x, y, n] of pts) {
      hx.globalAlpha = a; hx.fillStyle = n.c; hx.shadowColor = n.c; hx.shadowBlur = 12;
      hx.beginPath(); hx.arc(x, y, n.r * (1 + k * .4), 0, 6.283); hx.fill();
    }
    hx.shadowBlur = 0; hx.globalAlpha = 1;
  }
  /* ---------- labels riding the digital-twin scan lines ---------- */
  function scanLabel(p) {
    const items = [[fxs.scanA, '#89ddff', 'DIGITAL TWIN · SYNCING'], [fxs.scanB, '#b7a8ff', 'BACK TO REALITY']];
    hx.font = '600 10px "JetBrains Mono",monospace';
    for (const [s, c, txt] of items) {
      if (s <= 0 || s >= 1) continue;
      const x = s * W, pct = Math.round(s * 100);
      hx.globalAlpha = Math.min(1, s * 8, (1 - s) * 8);
      hx.fillStyle = c; hx.fillRect(x - 1, H * .78, 2, 14);
      hx.fillText(`${txt} ${pct}%`, Math.min(x + 8, W - 200), H * .78 + 11);
      // random telemetry bits near the line
      const t = Math.floor(performance.now() / 120);
      for (let i = 0; i < 6; i++) {
        const y = H * (.18 + i * .1), v = ((t * 31 + i * 97) % 997) / 10;
        hx.globalAlpha *= .9; hx.fillText(`${(0x3a0 + i * 17).toString(16).toUpperCase()}:${v.toFixed(1)}`, x - 92, y);
      }
    }
    hx.globalAlpha = 1;
  }

  /* ---------- HUD tracking bracket on the truck (scene A) ---------- */
  function hudDraw(p, fa, V) {
    hx.clearRect(0, 0, W, H);
    netDraw(p); scanLabel(p);
    const a = Math.min(range(p, .06, .08), 1 - range(p, .16, .18));
    if (a <= 0 || !window.TRACK) return;
    const q = TRACK[Math.round(clamp(fa, 0, 144))];
    // truck bbox: side panel + a bit for cab & wheels
    let xs = q.map(v => v[0]), ys = q.map(v => v[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const hgt = y1 - y0; x0 -= hgt * .45; y1 += hgt * .55;
    let [sx0, sy0] = toScreen(V, x0, y0), [sx1, sy1] = toScreen(V, x1, y1);
    sx0 -= 10; sy0 -= 10; sx1 += 10; sy1 += 10;
    const L = Math.min(34, (sx1 - sx0) * .15);
    hx.globalAlpha = a;
    hx.strokeStyle = '#89ddff'; hx.lineWidth = 1.5;
    hx.shadowColor = 'rgba(137,221,255,.8)'; hx.shadowBlur = 8;
    hx.beginPath();
    for (const [cx, cy, dx, dy] of [[sx0, sy0, 1, 1], [sx1, sy0, -1, 1], [sx1, sy1, -1, -1], [sx0, sy1, 1, -1]]) {
      hx.moveTo(cx + dx * L, cy); hx.lineTo(cx, cy); hx.lineTo(cx, cy + dy * L);
    }
    hx.stroke(); hx.shadowBlur = 0;
    // label
    const kmh = Math.round(clamp(64 + vel * 90000, 64, 178));
    const lat = (24.7136 + p * .04).toFixed(4), lon = (46.6753 + p * .07).toFixed(4);
    const lx = clamp(sx0, 12, W - 260), ly = Math.max(sy0 - 52, 84);
    hx.fillStyle = 'rgba(8,6,16,.62)'; hx.fillRect(lx, ly, 248, 42);
    hx.fillStyle = '#89ddff'; hx.fillRect(lx, ly, 3, 42);
    hx.font = '600 11px "JetBrains Mono",monospace'; hx.fillStyle = '#fff';
    hx.fillText(`IM-TRK-0042 · ${kmh} km/h · ON ROUTE`, lx + 12, ly + 17);
    hx.fillStyle = 'rgba(246,241,234,.65)'; hx.font = '10px "JetBrains Mono",monospace';
    hx.fillText(`GPS ${lat}°N  ${lon}°E`, lx + 12, ly + 33);
    hx.globalAlpha = 1;
  }

  /* ---------- main render ---------- */
  function render(p) {
    layers = []; segs = []; fxs = { dark: 0, scanA: -1, scanB: -1, torchAmt: 0 };
    let V = cover(.55, .5);
    // A — the road
    const fa = range(p, SEG.a.p0, SEG.a.p1) * (SEG.a.n - 1);
    if (p < .35) drawSeg(SEG.a, fa, V);
    // B — the cargo (match-cut dissolve on the rear doors, then push into the wall)
    if (p > .32 && p < .675) {
      const fb = range(p, SEG.b.p0, SEG.b.p1) * (SEG.b.n - 1);
      const push = ease(range(p, .6, .66));
      const VB = cover(.5, .47, 1 + push * .9);
      drawSeg(SEG.b, fb, VB, ease(range(p, .322, .345)));
      const dark = range(p, .595, .645);
      fxs.dark = dark;
    }
    // C — the cab, then dive into the dashcam
    let z = 0;
    if (p > .665) {
      const fc = range(p, SEG.c.p0, SEG.c.p1) * (SEG.c.n - 1);
      // finale: dive into the dashcam lens; the picture falls to pure black as we go inside.
      const zi = Math.pow(range(p, .935, .995), 2.2);            // ease-in: accelerating dive
      const V0 = cover(.5, .5), zs = 1 + zi * 9;
      const LENS = [554, 200];
      const VC = { w: V0.w / zs, h: V0.h / zs };
      const mv = Math.min(1, range(p, .935, .975));
      VC.x = clamp(lerp(V0.x + V0.w / 2, LENS[0], ease(mv)) - VC.w / 2, 0, VW - VC.w);
      VC.y = clamp(lerp(V0.y + V0.h / 2, LENS[1], ease(mv)) - VC.h / 2, 0, VH - VC.h);
      drawSeg(SEG.c, fc, VC, ease(range(p, .684, .705)));
      fxs.dark = Math.max(fxs.dark, ease(range(p, .95, .982)));
      cv.style.filter = zs > 2.5 ? `blur(${Math.min(8, (zs - 2.5) * 1.1).toFixed(1)}px)` : '';
      screenEl.style.opacity = 0;
      const e2 = zi;
      z = e2;
      screenEl.classList.toggle('live', z > .98);
    } else { screenEl.style.opacity = 0; cv.style.filter = ''; }
    // digital-twin scan sweeps (scene A): reality -> data -> reality
    fxs.scanA = -1; fxs.scanB = -1; // digital-twin scan removed
    // flashlight windows: box goes dark, cab starts in shadow
    fxs.torchAmt = Math.max(Math.min(range(p, .598, .614), 1 - range(p, .642, .654)), Math.min(range(p, .69, .702), 1 - range(p, .728, .745)));
    resolveSegs();
    if (GL) FX.render({
      layers, VW, VH, time: performance.now() / 1000, dark: fxs.dark, scanA: fxs.scanA, scanB: fxs.scanB,
      ab: Math.min(vel * 2000, 10) * DPR, torchAmt: fxs.torchAmt,
      torch: [torch.x * DPR, torch.y * DPR, Math.min(W, H) * .26 * DPR],
    }); else paint2D();
    hudDraw(p, fa, V);
    overlays(p);
    if (window.SOUND) SOUND.update(p, vel);
    curEl.classList.toggle('torch', fxs.torchAmt > .5);
    if (fxs.torchAmt > .5) curLbl.textContent = 'torch';
  }

  /* ---------- scroll loop (lerped for buttery scrub) ---------- */
  let target = 0, cur = 0;
  function readScroll() {
    const r = film.getBoundingClientRect();
    target = clamp(-r.top / (r.height - innerHeight));
  }
  addEventListener('scroll', readScroll, { passive: true });
  readScroll(); cur = target;
  let vel = 0, prev = cur;
  const live = p => p > .59 && p < .75; // time-animated zones
  function tick() {
    const d = target - cur;
    if (Math.abs(d) > 1e-5 || dirty || live(cur) || vel > 1e-5) {
      cur += Math.abs(d) < 1e-4 ? d : d * .14;
      vel = lerp(vel, Math.abs(cur - prev), .2); prev = cur;
      if (vel < 1e-6) vel = 0;
      torchTick();
      render(cur); dirty = false;
    }
    requestAnimationFrame(tick);
  }
  /* torch follows the cursor (eased); on touch devices it wanders on its own */
  const torch = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2, user: false };
  addEventListener('pointermove', e => { torch.tx = e.clientX; torch.ty = e.clientY; torch.user = e.pointerType === 'mouse'; }, { passive: true });
  function torchTick() {
    if (!torch.user) { const t = performance.now() / 1000; torch.tx = W * (.5 + .28 * Math.sin(t * .7)); torch.ty = H * (.5 + .18 * Math.sin(t * 1.1)); }
    torch.x = lerp(torch.x, torch.tx, .14); torch.y = lerp(torch.y, torch.ty, .14);
  }
  requestAnimationFrame(tick);

  /* ---------- text decode ---------- */
  const GLYPHS = '01<>/\\#%&*+=ABCDEFGHJKLMNPRSTUVXYZ';
  function scramble(el) {
    const fin = el.dataset.txt || (el.dataset.txt = el.textContent);
    const t0 = performance.now(), dur = 700;
    cancelAnimationFrame(el._raf);
    const step = () => {
      const k = (performance.now() - t0) / dur;
      el.textContent = [...fin].map((ch, i) => ch === ' ' || i / fin.length < k ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
      if (k < 1) el._raf = requestAnimationFrame(step); else el.textContent = fin;
    };
    step();
  }

  /* ---------- custom cursor ---------- */
  const curEl = document.getElementById('cur'), curLbl = curEl.querySelector('span');
  const cp = { x: -100, y: -100, tx: -100, ty: -100 };
  addEventListener('pointermove', e => { cp.tx = e.clientX; cp.ty = e.clientY; }, { passive: true });
  (function curLoop() {
    cp.x = lerp(cp.x, cp.tx, .25); cp.y = lerp(cp.y, cp.ty, .25);
    curEl.style.transform = `translate3d(${cp.x}px,${cp.y}px,0)`;
    requestAnimationFrame(curLoop);
  })();
  document.addEventListener('pointerover', e => {
    const a = e.target.closest('a,button,select,input,textarea');
    curEl.classList.toggle('big', !!a);
    if (a) curLbl.textContent = a.matches('#snd') ? 'sound' : a.matches('input,textarea,select') ? '' : 'go';
  });

  /* ---------- sound toggle ---------- */
  const snd = document.getElementById('snd');
  snd.addEventListener('click', () => {
    const on = SOUND.toggle();
    snd.setAttribute('aria-pressed', on); const ar = document.documentElement.lang === 'ar';
    snd.querySelector('b').textContent = ar ? (on ? 'الصوت يعمل' : 'الصوت متوقف') : (on ? 'Sound on' : 'Sound off');
  });

  /* ---------- small live bits ---------- */
  const clock = document.getElementById('clock');
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Riyadh' });
  setInterval(() => { if (clock) clock.textContent = 'RIYADH ' + fmt.format(new Date()); }, 1000);

  document.getElementById('form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = `Name: ${f.get('name')}\nEmail: ${f.get('email')}\nService: ${f.get('service')}\n\n${f.get('msg')}`;
    location.href = `mailto:info@innomissions.ai?subject=${encodeURIComponent('Mission inquiry — ' + f.get('service'))}&body=${encodeURIComponent(body)}`;
  });
})();
