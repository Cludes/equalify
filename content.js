'use strict';
// Equalify content script: owns the live Web Audio graph for this page's media element.
// Settings are per-site, stored in chrome.storage.local under store.sites[hostname].

(() => {
  if (window.__equalify) return;
  window.__equalify = true;

  const BANDS = [60, 230, 910, 3600, 14000];
  const DEFAULTS = {
    enabled: true, preamp: 0, volume: 100, bass: 0, treble: 0, bands: [0, 0, 0, 0, 0],
    reverb: 0, width: 100, eightD: false, eightDSpeed: 0.12, speed: 100, preservePitch: false
  };
  const NEUTRAL = { ...DEFAULTS };
  const HOST = location.hostname;

  let settings = { ...DEFAULTS };
  let graph = null, mediaEl = null;

  function makeImpulse(ctx, sec) {
    const rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
    return buf;
  }

  function buildGraph(el) {
    let ctx; try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    let src; try { src = ctx.createMediaElementSource(el); } catch (e) { return null; }

    const preamp = ctx.createGain();
    const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 110;
    const treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 4000;
    const bands = BANDS.map(f => { const b = ctx.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.Q.value = 1.1; return b; });

    const splitter = ctx.createChannelSplitter(2), merger = ctx.createChannelMerger(2);
    const mL = ctx.createGain(), mR = ctx.createGain(), sL = ctx.createGain(), sR = ctx.createGain();
    mL.gain.value = 0.5; mR.gain.value = 0.5; sL.gain.value = 0.5; sR.gain.value = -0.5;
    const mid = ctx.createGain(), side = ctx.createGain(), sideW = ctx.createGain(), sideNeg = ctx.createGain();
    sideNeg.gain.value = -1;

    const panner = ctx.createStereoPanner();
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.12;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(panner.pan); lfo.start();

    const convolver = ctx.createConvolver(); convolver.buffer = makeImpulse(ctx, 2.6);
    const dry = ctx.createGain(); dry.gain.value = 1;
    const wet = ctx.createGain(); wet.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8;

    src.connect(preamp); preamp.connect(bass); bass.connect(bands[0]);
    for (let i = 0; i < bands.length - 1; i++) bands[i].connect(bands[i + 1]);
    bands[bands.length - 1].connect(treble);
    treble.connect(splitter);
    splitter.connect(mL, 0); splitter.connect(mR, 1); mL.connect(mid); mR.connect(mid);
    splitter.connect(sL, 0); splitter.connect(sR, 1); sL.connect(side); sR.connect(side);
    side.connect(sideW);
    mid.connect(merger, 0, 0); sideW.connect(merger, 0, 0);
    mid.connect(merger, 0, 1); sideW.connect(sideNeg); sideNeg.connect(merger, 0, 1);
    merger.connect(panner);
    panner.connect(dry); panner.connect(convolver); convolver.connect(wet);
    dry.connect(comp); wet.connect(comp); comp.connect(analyser); comp.connect(ctx.destination);

    return { ctx, preamp, bass, treble, bands, sideW, panner, lfo, lfoDepth, wet, dry, analyser };
  }

  function applyPitch() {
    if (!mediaEl) return;
    try { mediaEl.preservesPitch = mediaEl.mozPreservesPitch = mediaEl.webkitPreservesPitch = !!settings.preservePitch; } catch (e) {}
    const r = (settings.enabled ? settings.speed : 100) / 100;
    if (Math.abs(mediaEl.playbackRate - r) > 0.001) try { mediaEl.playbackRate = r; } catch (e) {}
  }

  function apply() {
    applyPitch();
    if (!graph) return;
    const s = settings.enabled ? settings : NEUTRAL;
    const g = graph, t = g.ctx.currentTime + 0.02;
    g.preamp.gain.setTargetAtTime(Math.pow(10, s.preamp / 20) * (s.volume / 100), t, 0.03);
    g.bass.gain.setTargetAtTime(s.bass, t, 0.02);
    g.treble.gain.setTargetAtTime(s.treble, t, 0.02);
    s.bands.forEach((v, i) => g.bands[i].gain.setTargetAtTime(v, t, 0.02));
    g.sideW.gain.setTargetAtTime(s.width / 100, t, 0.02);
    g.lfo.frequency.setTargetAtTime(s.eightDSpeed, t, 0.05);
    g.lfoDepth.gain.setTargetAtTime(s.eightD ? 1 : 0, t, 0.05);
    if (!s.eightD) g.panner.pan.setTargetAtTime(0, t, 0.05);
    const rv = (s.reverb / 100) * 0.9;
    g.wet.gain.setTargetAtTime(rv, t, 0.05); g.dry.gain.setTargetAtTime(1 - rv * 0.4, t, 0.05);
    if (g.ctx.state === 'suspended') g.ctx.resume();
  }

  function ensureGraph() {
    if (graph) return;
    const el = document.querySelector('video, audio');
    if (!el) return;
    mediaEl = el; graph = buildGraph(el); if (graph) apply();
  }
  function hook() { ensureGraph(); apply(); }

  document.addEventListener('play', hook, true);
  let tries = 0;
  const poll = setInterval(() => { ensureGraph(); if (graph || ++tries > 40) clearInterval(poll); }, 1500);
  window.addEventListener('yt-navigate-finish', () => setTimeout(apply, 800));

  function readSettings(store) { settings = { ...DEFAULTS, ...(((store || {}).sites || {})[HOST] || {}) }; }
  chrome.storage.local.get('store', d => { readSettings(d.store); hook(); });
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.store) { readSettings(c.store.newValue); ensureGraph(); apply(); } });

  // status query from popup
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg && msg.type === 'status') {
      const el = document.querySelector('video, audio');
      reply({ hostname: HOST, hasMedia: !!el, playing: !!(el && !el.paused), active: !!graph });
      return true;
    }
  });
  // visualizer stream while popup is open
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'viz') return;
    let run = true;
    const loop = () => {
      if (!run) return;
      if (graph && graph.analyser) {
        const a = graph.analyser, raw = new Uint8Array(a.frequencyBinCount); a.getByteFrequencyData(raw);
        const n = 28, step = Math.floor(raw.length / n) || 1, bars = [];
        for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < step; j++) sum += raw[i * step + j] || 0; bars.push(Math.round(sum / step)); }
        try { port.postMessage(bars); } catch (e) { run = false; return; }
      }
      requestAnimationFrame(loop);
    };
    loop();
    port.onDisconnect.addListener(() => { run = false; });
  });
})();
