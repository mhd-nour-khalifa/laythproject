/* SITE — lower-half cinematics: header behaviour, reveals, manifesto word-light,
   counters, pinned horizontal services, case previews, magnetic buttons. */
(() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;


  /* header: hide on scroll down, show on up */
  const top = document.querySelector('.top'), filmEl = document.getElementById('film');
  top.classList.toggle('infilm', filmEl.getBoundingClientRect().bottom > 90);
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    top.classList.toggle('hide', y > lastY && y > 200);
    top.classList.toggle('solid', y > 60);
    top.classList.toggle('infilm', filmEl.getBoundingClientRect().bottom > 90);
    lastY = y;
  }, { passive: true });

  /* reveal on view */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .18, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rv').forEach(el => io.observe(el));

  /* counters */
  const fmt = (n, f) => f === 'k' ? Math.round(n).toLocaleString('en-US') : Math.round(n);
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; cio.unobserve(e.target);
    const el = e.target, to = +el.dataset.to, f = el.dataset.fmt, t0 = performance.now(), dur = reduce ? 1 : 2200;
    (function step() {
      const k = clamp((performance.now() - t0) / dur), v = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(to * v, f);
      if (k < 1) requestAnimationFrame(step);
    })();
  }), { threshold: .6 });
  document.querySelectorAll('.cnt').forEach(el => cio.observe(el));

  /* manifesto: split into words, light them with scroll */
  const man = document.getElementById('manifesto'), mt = document.getElementById('mtext');
  const HL = /^(people|first\.?|الإنسان|أولاً\.?)$/i;
  let words = [];
  function split() {
    const txt = mt.textContent.trim();
    mt.innerHTML = txt.split(/\s+/).map(w => `<span class="w${HL.test(w) ? ' hl' : ''}">${w}</span>`).join(' ');
    words = [...mt.querySelectorAll('.w')];
  }
  split();
  document.addEventListener('langchange', split);

  /* pinned horizontal services */
  const svc = document.getElementById('services'), track = document.getElementById('htrack'), hp = document.getElementById('hprog');
  const imgs = [...track.querySelectorAll('.pimg img')];
  let hx = 0;

  function frame() {
    const vh = innerHeight;
    // manifesto
    const mr = man.getBoundingClientRect(), mq = clamp(-mr.top / (mr.height - vh) * 1.15);
    const lit = Math.round(mq * words.length);
    words.forEach((w, i) => w.classList.toggle('on', i < lit));
    // services
    const sr = svc.getBoundingClientRect(), sq = clamp(-sr.top / (sr.height - vh));
    const rtl = document.documentElement.dir === 'rtl';
    const max = Math.max(0, track.scrollWidth - innerWidth);
    hx = lerp(hx, sq * max, .14);
    track.style.transform = `translate3d(${(rtl ? hx : -hx).toFixed(1)}px,0,0)`;
    hp.style.width = (sq * 100).toFixed(1) + '%';
    imgs.forEach((im, i) => {
      const r = im.parentElement.getBoundingClientRect(), c = (r.left + r.width / 2) / innerWidth - .5;
      im.style.setProperty('--px', (-8 - c * 10).toFixed(2) + '%');
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* use-case hover preview */
  const prev = document.getElementById('cprev'), pimg = prev.querySelector('img');
  const pp = { x: 0, y: 0, tx: 0, ty: 0 };
  document.querySelectorAll('#cases li').forEach(li => {
    li.addEventListener('pointerenter', () => { pimg.src = li.dataset.img; prev.classList.add('on'); });
    li.addEventListener('pointerleave', () => prev.classList.remove('on'));
  });
  addEventListener('pointermove', e => { pp.tx = e.clientX; pp.ty = e.clientY; }, { passive: true });
  (function follow() {
    pp.x = lerp(pp.x, pp.tx, .15); pp.y = lerp(pp.y, pp.ty, .15);
    const tilt = clamp((pp.tx - pp.x) * .05, -8, 8);
    prev.style.transform = `translate3d(${(pp.x + 30).toFixed(1)}px,${(pp.y - 110).toFixed(1)}px,0) rotate(${tilt.toFixed(2)}deg) scale(${prev.classList.contains('on') ? 1 : .85})`;
    requestAnimationFrame(follow);
  })();

  /* magnetic buttons */
  if (matchMedia('(hover:hover)').matches) document.querySelectorAll('.btn,.top .cta,.lang').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * .25).toFixed(1)}px,${((e.clientY - r.top - r.height / 2) * .35).toFixed(1)}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
})();
