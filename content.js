'use strict';
// Equalify content script: owns the live Web Audio graph for the page's media element.
// Settings live in chrome.storage.local under "eq"; we react to changes and apply live.

(() => {
  if (window.__equalify) return;
  window.__equalify = true;

  const BANDS = [60, 230, 910, 3600, 14000];
  const DEFAULTS = {
    enabled: true, preamp: 0, bass: 0, treble: 0, bands: [0, 0, 0, 0, 0],
    reverb: 0, width: 100, eightD: false, eightDSpeed: 0.12, speed: 100
  };
  const NEUTRAL = { ...DEFAULTS, reverb: 0, width: 100, eightD: false, speed: 100, bands: [0, 0, 0, 0, 0] };

  let settings = { ...DEFAULTS };
  let graph = null;     // built once per media element
  let mediaEl = null;

  function makeImpulse(ctx, seconds) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    return buf;
  }

  function buildGraph(el) {
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    let src;
    try { src = ctx.createMediaElementSource(el); }
    catch (e) { return null; } // already captured or DRM-protected

    const preamp = ctx.createGain();
    const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 110;
    const treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 4000;
    const bands = BANDS.map(f => { const b = ctx.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.Q.value = 1.1; return b; });

    // mid/side stereo width
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const mL = ctx.createGain(), mR = ctx.createGain(), sL = ctx.createGain(), sR = ctx.createGain();
    mL.gain.value = 0.5; mR.gain.value = 0.5; sL.gain.value = 0.5; sR.gain.value = -0.5;
    const mid = ctx.createGain(), side = ctx.createGain(), sideW = ctx.createGain(), sideNeg = ctx.createGain();
    sideNeg.gain.value = -1;

    // 8D auto-pan
    const panner = ctx.createStereoPanner();
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.12;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(panner.pan); lfo.start();

    // reverb wet/dry
    const convolver = ctx.createConvolver(); convolver.buffer = makeImpulse(ctx, 2.6);
    const dry = ctx.createGain(); dry.gain.value = 1;
    const wet = ctx.createGain(); wet.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();

    // wire EQ chain
    src.connect(preamp); preamp.connect(bass); bass.connect(bands[0]);
    for (let i = 0; i < bands.length - 1; i++) bands[i].connect(bands[i + 1]);
    bands[bands.length - 1].connect(treble);

    // width: treble -> splitter -> M/S -> merger
    treble.connect(splitter);
    splitter.connect(mL, 0); splitter.connect(mR, 1); mL.connect(mid); mR.connect(mid);
    splitter.connect(sL, 0); splitter.connect(sR, 1); sL.connect(side); sR.connect(side);
    side.connect(sideW);
    mid.connect(merger, 0, 0); sideW.connect(merger, 0, 0);
    mid.connect(merger, 0, 1); sideW.connect(sideNeg); sideNeg.connect(merger, 0, 1);

    // panner -> reverb mix -> compressor -> out
    merger.connect(panner);
    panner.connect(dry); panner.connect(convolver); convolver.connect(wet);
    dry.connect(comp); wet.connect(comp); comp.connect(ctx.destination);

    return { ctx, preamp, bass, treble, bands, sideW, panner, lfo, lfoDepth, wet, dry };
  }

  function apply() {
    const s = settings.enabled ? settings : { ...NEUTRAL, preamp: 0 };
    if (mediaEl) { const r = (settings.enabled ? settings.speed : 100) / 100; if (Math.abs(mediaEl.playbackRate - r) > 0.001) try { mediaEl.playbackRate = r; } catch (e) {} }
    if (!graph) return;
    const g = graph; const t = g.ctx.currentTime + 0.02;
    g.preamp.gain.setTargetAtTime(Math.pow(10, s.preamp / 20), t, 0.02);
    g.bass.gain.setTargetAtTime(s.bass, t, 0.02);
    g.treble.gain.setTargetAtTime(s.treble, t, 0.02);
    s.bands.forEach((v, i) => g.bands[i].gain.setTargetAtTime(v, t, 0.02));
    const w = s.width / 100; g.sideW.gain.setTargetAtTime(w, t, 0.02);
    g.lfo.frequency.setTargetAtTime(s.eightDSpeed, t, 0.05);
    g.lfoDepth.gain.setTargetAtTime(s.eightD ? 1 : 0, t, 0.05);
    if (!s.eightD) g.panner.pan.setTargetAtTime(0, t, 0.05);
    const rv = (s.reverb / 100) * 0.9; g.wet.gain.setTargetAtTime(rv, t, 0.05); g.dry.gain.setTargetAtTime(1 - rv * 0.4, t, 0.05);
    if (g.ctx.state === 'suspended') g.ctx.resume();
  }

  function ensureGraph() {
    if (graph) return;
    const el = document.querySelector('video, audio');
    if (!el) return;
    mediaEl = el;
    graph = buildGraph(el);
    if (graph) apply();
  }

  // try to attach when media starts / appears
  function hook() { ensureGraph(); apply(); }
  document.addEventListener('play', hook, true);
  let tries = 0;
  const poll = setInterval(() => { ensureGraph(); if (graph || ++tries > 40) clearInterval(poll); }, 1500);
  // YouTube SPA navigations reuse the same <video>, so the graph persists; just re-apply
  window.addEventListener('yt-navigate-finish', () => setTimeout(apply, 800));

  chrome.storage.local.get('eq', d => { settings = { ...DEFAULTS, ...(d.eq || {}) }; hook(); });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.eq) { settings = { ...DEFAULTS, ...c.eq.newValue }; ensureGraph(); apply(); }
  });
})();
