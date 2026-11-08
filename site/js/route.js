/* ROUTE — scroll drives a (demo) trip Riyadh -> Dammam: camera follows the truck,
   route draws itself, checkpoints light up, telematics events stream in. */
(() => {
  const sec = document.getElementById('route');
  if (!sec) return;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const range = (p, a, b) => clamp((p - a) / (b - a));

  const path = document.getElementById('rprog'), world = document.getElementById('world');
  const truck = document.getElementById('truck'), cpsG = document.getElementById('cps');
  const evBox = document.getElementById('revents');
  const L = path.getTotalLength(), KM = 410;
  path.style.strokeDasharray = L; path.style.strokeDashoffset = L;

  const CPS = [
    { at: .34, en: 'FUEL STOP · 140 KM', ar: 'محطة وقود · 140 كم' },
    { at: .66, en: 'REST · HOS 30 MIN', ar: 'استراحة · 30 دقيقة' },
  ];
  const EVENTS = [
    { at: .03, t: '05:40', en: ['Departure', 'Geofence exit · Riyadh depot'], ar: ['الانطلاق', 'الخروج من النطاق الجغرافي · مستودع الرياض'] },
    { at: .22, t: '06:31', en: ['Driver behavior', 'Smooth acceleration · score 94'], ar: ['سلوك السائق', 'تسارع سلس · التقييم 94'] },
    { at: .34, t: '07:05', en: ['Fuel stop logged', '140 km · tank 38% → 100%'], ar: ['تسجيل التزوّد بالوقود', '140 كم · الخزان 38% ← 100%'] },
    { at: .5,  t: '07:58', en: ['Safety alert avoided', 'Following distance restored in 2s'], ar: ['تفادي تنبيه سلامة', 'استعادة مسافة الأمان خلال ثانيتين'] },
    { at: .66, t: '08:41', en: ['Rest break', 'Hours of Service compliant · 30 min'], ar: ['استراحة', 'متوافق مع ساعات الخدمة · 30 دقيقة'] },
    { at: .97, t: '09:50', en: ['Arrived · Dammam port', 'On time · zero incidents'], ar: ['الوصول · ميناء الدمام', 'في الموعد · بدون حوادث'] },
  ];
  let target = 0, cur = 0, last = -1;
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';

  function build() {
    const l = lang();
    cpsG.innerHTML = CPS.map((c, i) => {
      const pt = path.getPointAtLength(L * c.at);
      return `<g class="cp" data-i="${i}"><circle cx="${pt.x}" cy="${pt.y}" r="7"/><text x="${pt.x + 14}" y="${pt.y + 26}">${c[l]}</text></g>`;
    }).join('');
    evBox.innerHTML = EVENTS.map(e => `<div class="rev"><small>${e.t}</small><b>${e[l][0]}</b><span>${e[l][1]}</span></div>`).join('');
    last = -1;
  }
  build();
  document.addEventListener('langchange', build);

  const stageEl = sec.querySelector('.rstage');
  const blackEl = document.createElement('div'); blackEl.className = 'rblack'; stageEl.appendChild(blackEl);
  const read = () => {
    const r = sec.getBoundingClientRect(); target = clamp(-r.top / (r.height - innerHeight));
    // overlaps the film's last screen; appears only once in place, then fades up from black
    stageEl.style.visibility = r.top <= 1 ? 'visible' : 'hidden';
    blackEl.style.opacity = (1 - ease(clamp(-r.top / (innerHeight * .38)))).toFixed(3);
  };
  addEventListener('scroll', read, { passive: true }); addEventListener('resize', read); read(); cur = target;

  const kmEl = document.getElementById('rkm'), etaEl = document.getElementById('reta'), spdEl = document.getElementById('rspd'), scEl = document.getElementById('rscore');
  function update(p) {
    const q = ease(range(p, .04, .9));                     // trip progress
    path.style.strokeDashoffset = L * (1 - q);
    const d = L * q, pt = path.getPointAtLength(d), pa = path.getPointAtLength(Math.min(L, d + 2));
    const ang = Math.atan2(pa.y - pt.y, pa.x - pt.x) * 180 / Math.PI;
    truck.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    // camera: close on the truck, pull back to reveal the whole route at the end
    const s = lerp(2.3, 1, ease(range(p, .82, 1))), fx = lerp(pt.x, 510, ease(range(p, .82, 1))), fy = lerp(pt.y, 310, ease(range(p, .82, 1)));
    world.setAttribute('transform', `translate(${(500 - fx * s).toFixed(1)},${(300 - fy * s).toFixed(1)}) scale(${s.toFixed(3)})`);
    // telemetry
    const km = Math.round(KM * q);
    kmEl.textContent = km;
    const mins = Math.max(0, Math.round(250 * (1 - q)));
    etaEl.textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const stopped = CPS.some(c => Math.abs(q - c.at) < .015) || q < .005 || q > .995;
    spdEl.textContent = stopped ? 0 : Math.round(96 + Math.sin(q * 40) * 7);
    scEl.textContent = q < .01 ? '—' : Math.round(92 + Math.sin(q * 13) * 2.4);
    cpsG.querySelectorAll('.cp').forEach((g, i) => g.classList.toggle('on', q >= CPS[i].at));
    // events (keep last 4 visible)
    let n = 0; EVENTS.forEach(e => { if (q >= e.at) n++; });
    if (n !== last) {
      last = n;
      [...evBox.children].forEach((el, i) => {
        el.classList.toggle('on', i < n && i >= n - 4);
        el.style.display = i < n - 4 ? 'none' : '';
        el.classList.toggle('last', i === n - 1);
      });
    }
  }
  (function loop() {
    const d = target - cur;
    if (Math.abs(d) > 1e-5) { cur += Math.abs(d) < 1e-4 ? d : d * .14; update(cur); }
    requestAnimationFrame(loop);
  })();
  update(cur);
})();
