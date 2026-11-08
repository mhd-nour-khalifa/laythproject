/* SOUND — synthesized, no files. Engine + wind follow scroll speed; scene-aware filtering;
   door clunk when the box opens, chime + sub boom when the logo assembles. Off until user opts in. */
window.SOUND = (() => {
  let ac, master, eng, engF, engG, o1, o2, wind, windF, windG, on = false, lastP = 0;

  function noiseBuf(sec = 2, brown = true) {
    const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  function start() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    // engine: two detuned saws through a lowpass
    engF = ac.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 200; engF.Q.value = 3;
    engG = ac.createGain(); engG.gain.value = 0;
    o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 46;
    o2 = ac.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 46.8;
    o1.connect(engF); o2.connect(engF); engF.connect(engG); engG.connect(master);
    o1.start(); o2.start();
    // wind/road: brown noise through bandpass
    wind = ac.createBufferSource(); wind.buffer = noiseBuf(); wind.loop = true;
    windF = ac.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 600; windF.Q.value = .6;
    windG = ac.createGain(); windG.gain.value = 0;
    wind.connect(windF); windF.connect(windG); windG.connect(master); wind.start();
  }
  function toggle() {
    if (!ac) start();
    on = !on;
    if (on) ac.resume();
    master.gain.setTargetAtTime(on ? .55 : 0, ac.currentTime, .25);
    return on;
  }
  function clunk() {
    const t = ac.currentTime, n = ac.createBufferSource(); n.buffer = noiseBuf(.4, false);
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = ac.createGain(); g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .35);
    n.connect(f); f.connect(g); g.connect(master); n.start(t);
    const o = ac.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + .3);
    const og = ac.createGain(); og.gain.setValueAtTime(.6, t); og.gain.exponentialRampToValueAtTime(.001, t + .4);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + .45);
  }
  function chime() {
    const t = ac.currentTime;
    // sub boom
    const s = ac.createOscillator(); s.frequency.setValueAtTime(70, t); s.frequency.exponentialRampToValueAtTime(32, t + 1.4);
    const sg = ac.createGain(); sg.gain.setValueAtTime(.8, t); sg.gain.exponentialRampToValueAtTime(.001, t + 1.6);
    s.connect(sg); sg.connect(master); s.start(t); s.stop(t + 1.7);
    // shimmering chord (one note per brand colour)
    [523.25, 659.25, 783.99, 1046.5].forEach((fq, i) => {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = fq;
      const g = ac.createGain(); const st = t + i * .07;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(.12, st + .03); g.gain.exponentialRampToValueAtTime(.001, st + 2.4);
      o.connect(g); g.connect(master); o.start(st); o.stop(st + 2.5);
    });
  }
  // called every frame with film progress p and scroll velocity v (progress / frame)
  function update(p, v) {
    if (!ac || !on) { lastP = p; return; }
    const t = ac.currentTime, sp = Math.min(v * 600, 1);
    const road = p < .345, cargo = p >= .345 && p < .62, gap = p >= .62 && p < .68, cab = p >= .68 && p < .93;
    const eg = road ? .22 + sp * .35 : cargo ? .1 + sp * .15 : cab ? .14 + sp * .2 : gap ? .02 : .04;
    engG.gain.setTargetAtTime(eg, t, .15);
    o1.frequency.setTargetAtTime(42 + sp * 40, t, .2); o2.frequency.setTargetAtTime(42.9 + sp * 41, t, .2);
    engF.frequency.setTargetAtTime(cab ? 150 : cargo ? 260 : 220 + sp * 400, t, .2);
    windG.gain.setTargetAtTime(road ? .05 + sp * .4 : cargo ? .03 + sp * .15 : gap ? .01 : .02 + sp * .1, t, .15);
    windF.frequency.setTargetAtTime(cargo ? 300 : 500 + sp * 900, t, .2);
    if (lastP < .372 && p >= .372) clunk();
    if (lastP < .67 && p >= .67) chime();
    lastP = p;
  }
  return { toggle, update, get on() { return on; } };
})();
