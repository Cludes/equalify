'use strict';
// Equalify full-screen visualizer. window.EqualifyViz.open(getAnalyser) injects a fullscreen
// canvas overlay with beat-reactive, additive-blended neon patterns from a live AnalyserNode.
window.EqualifyViz = (function () {
  const MODES = ['Spectrum bars', 'Radial', 'Waveform', 'Orb', 'Particles'];
  let S = null, particles = [];

  function open(getAnalyser) {
    if (S) { S.overlay.style.display = 'block'; if (!S.running) { S.running = true; loop(); } return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#04050a;margin:0;padding:0;overflow:hidden;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    overlay.appendChild(canvas);

    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;top:14px;right:16px;display:flex;gap:8px;font-family:system-ui,Segoe UI,sans-serif;transition:opacity .4s;';
    const mk = t => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:8px 13px;font-size:12px;font-weight:600;cursor:pointer;'; return b; };
    const bMode = mk('Mode (M)'), bAuto = mk('Auto: off'), bFull = mk('Fullscreen (F)'), bClose = mk('Close (Esc)');
    bar.append(bMode, bAuto, bFull, bClose); overlay.appendChild(bar);

    const title = document.createElement('div');
    title.style.cssText = 'position:absolute;top:16px;left:20px;color:rgba(255,255,255,.55);font-family:system-ui,Segoe UI,sans-serif;font-size:13px;font-weight:700;letter-spacing:.6px;transition:opacity .4s;';
    overlay.appendChild(title);
    (document.body || document.documentElement).appendChild(overlay);

    S = {
      overlay, canvas, ctx: canvas.getContext('2d'), mode: 0, running: true, raf: 0, t: 0,
      hue: 200, dpr: Math.min(window.devicePixelRatio || 1, 1.6), getAnalyser, freq: null, wave: null,
      smooth: [], peaks: [], peakVel: [], bassAvg: 0.12, flash: 0, zoom: 1, auto: false, autoAt: 0,
      bar, title, bAuto, hideAt: 0
    };

    const resize = () => { canvas.width = Math.floor(overlay.clientWidth * S.dpr); canvas.height = Math.floor(overlay.clientHeight * S.dpr); };
    S.resize = resize; resize(); window.addEventListener('resize', resize);

    const flash = () => { S.hideAt = performance.now() + 2600; bar.style.opacity = '1'; title.style.opacity = '1'; overlay.style.cursor = 'default'; };
    const setMode = m => { S.mode = (m + MODES.length) % MODES.length; title.textContent = 'CludesAmp  ·  ' + MODES[S.mode]; flash(); };
    const toggleAuto = () => { S.auto = !S.auto; bAuto.textContent = 'Auto: ' + (S.auto ? 'on' : 'off'); S.autoAt = performance.now() + 13000; flash(); };
    const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else overlay.requestFullscreen().catch(() => {}); };
    const close = () => { S.running = false; cancelAnimationFrame(S.raf); window.removeEventListener('resize', resize); document.removeEventListener('keydown', key); overlay.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); S = null; };
    const key = e => { const k = e.key.toLowerCase(); if (k === 'escape') close(); else if (k === 'm' || k === ' ') { e.preventDefault(); setMode(S.mode + 1); } else if (k === 'f') toggleFull(); else if (k === 'a') toggleAuto(); };

    S.setMode = setMode; S.close = close;
    overlay.addEventListener('mousemove', flash);
    canvas.addEventListener('click', () => setMode(S.mode + 1));
    bMode.onclick = e => { e.stopPropagation(); setMode(S.mode + 1); };
    bAuto.onclick = e => { e.stopPropagation(); toggleAuto(); };
    bFull.onclick = e => { e.stopPropagation(); toggleFull(); };
    bClose.onclick = e => { e.stopPropagation(); close(); };
    document.addEventListener('keydown', key);

    setMode(0); loop();
  }

  function getBars(n) {
    const freq = S.freq, step = Math.floor(freq.length * 0.72 / n) || 1;
    if (S.smooth.length !== n) { S.smooth = new Array(n).fill(0); S.peaks = new Array(n).fill(0); S.peakVel = new Array(n).fill(0); }
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0; for (let j = 0; j < step; j++) v += freq[i * step + j] || 0;
      v = Math.pow(v / (step * 255), 1.45);
      S.smooth[i] += (v - S.smooth[i]) * (v > S.smooth[i] ? 0.55 : 0.13);
      out[i] = S.smooth[i];
      if (out[i] >= S.peaks[i]) { S.peaks[i] = out[i]; S.peakVel[i] = 0; }
      else { S.peakVel[i] += 0.0011; S.peaks[i] = Math.max(out[i], S.peaks[i] - S.peakVel[i]); }
    }
    return out;
  }

  function loop() {
    if (!S || !S.running) return;
    S.raf = requestAnimationFrame(loop);
    const ctx = S.ctx, W = S.canvas.width, H = S.canvas.height, cx = W / 2, cy = H / 2; S.t++;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(4,5,10,0.24)'; ctx.fillRect(0, 0, W, H);

    const a = S.getAnalyser && S.getAnalyser();
    if (!a) {
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'center';
      ctx.font = `${Math.round(H / 26)}px system-ui,Segoe UI,sans-serif`;
      ctx.fillText('Play audio in this tab to see the visualizer', cx, cy);
      return;
    }
    if (!S.freq || S.freq.length !== a.frequencyBinCount) { S.freq = new Uint8Array(a.frequencyBinCount); S.wave = new Uint8Array(a.fftSize); }
    a.getByteFrequencyData(S.freq); a.getByteTimeDomainData(S.wave);

    let bass = 0; for (let i = 1; i < 10; i++) bass += S.freq[i]; bass /= 9 * 255;
    S.bassAvg = S.bassAvg * 0.93 + bass * 0.07;
    if (bass > S.bassAvg * 1.32 && bass > 0.2) S.flash = 1; else S.flash *= 0.90;
    S.hue = (S.hue + 0.45 + bass * 2.2) % 360;
    S.zoom += ((1 + S.flash * 0.05) - S.zoom) * 0.25;

    ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.62);
    bg.addColorStop(0, `hsla(${S.hue},80%,55%,${0.03 + S.flash * 0.13 + bass * 0.05})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.save(); ctx.translate(cx, cy); ctx.scale(S.zoom, S.zoom); ctx.translate(-cx, -cy);
    [bars, radial, waveform, orb, particleField][S.mode](ctx, W, H, bass);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    if (S.auto && performance.now() > S.autoAt) { S.setMode(S.mode + 1); S.autoAt = performance.now() + 13000; }
    if (S.hideAt && performance.now() > S.hideAt) { S.bar.style.opacity = '0'; S.title.style.opacity = '0'; S.overlay.style.cursor = 'none'; S.hideAt = 0; }
  }

  function bars(ctx, W, H, bass) {
    const n = 72, b = getBars(n), bw = W / n, baseY = H * 0.82;
    for (let i = 0; i < n; i++) {
      const h = b[i] * H * 0.74, x = i * bw, hh = (S.hue + i * 2.4) % 360;
      const g = ctx.createLinearGradient(0, baseY, 0, baseY - h);
      g.addColorStop(0, `hsla(${hh},95%,52%,0.9)`); g.addColorStop(1, `hsla(${(hh + 45) % 360},98%,68%,0.95)`);
      ctx.fillStyle = g; ctx.fillRect(x + bw * 0.14, baseY - h, bw * 0.72, h);
      ctx.fillStyle = `hsla(${hh},95%,55%,0.10)`; ctx.fillRect(x + bw * 0.14, baseY, bw * 0.72, h * 0.42);
      const py = baseY - S.peaks[i] * H * 0.74;
      ctx.fillStyle = `hsla(${(hh + 30) % 360},100%,82%,0.95)`; ctx.fillRect(x + bw * 0.14, py - 3 * S.dpr, bw * 0.72, 3 * S.dpr);
    }
  }

  function radial(ctx, W, H, bass) {
    const n = 120, b = getBars(n), R = Math.min(W, H) * (0.14 + bass * 0.05 + S.flash * 0.03);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(S.t / 900); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const len = b[i] * Math.min(W, H) * 0.36, ang = (i / n) * Math.PI * 2, hh = (S.hue + i * 3) % 360;
      ctx.strokeStyle = `hsla(${hh},95%,${52 + b[i] * 30}%,0.9)`; ctx.lineWidth = Math.max(2, W / n * 0.55);
      ctx.beginPath(); ctx.moveTo(Math.cos(ang) * R, Math.sin(ang) * R); ctx.lineTo(Math.cos(ang) * (R + len), Math.sin(ang) * (R + len)); ctx.stroke();
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    core.addColorStop(0, `hsla(${S.hue},95%,70%,${0.35 + S.flash * 0.5})`); core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function waveform(ctx, W, H, bass) {
    const wave = S.wave, n = wave.length;
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath(); ctx.lineWidth = (layer === 0 ? 3 : 6 + layer * 4) * S.dpr;
      ctx.strokeStyle = `hsla(${(S.hue + layer * 24) % 360},95%,${65 - layer * 12}%,${layer === 0 ? 0.95 : 0.18})`;
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * W, y = H / 2 + ((wave[i] - 128) / 128) * H * 0.38 * (1 + bass); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
  }

  function orb(ctx, W, H, bass) {
    const wave = S.wave, n = wave.length, R = Math.min(W, H) * (0.2 + bass * 0.06 + S.flash * 0.04), amp = Math.min(W, H) * 0.14;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(S.t / 1400);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath(); ctx.lineWidth = (pass ? 9 : 2.5) * S.dpr;
      ctx.strokeStyle = `hsla(${(S.hue + pass * 40) % 360},95%,${pass ? 55 : 70}%,${pass ? 0.18 : 0.95})`;
      for (let i = 0; i <= n; i++) { const k = i % n, ang = (i / n) * Math.PI * 2, r = R + ((wave[k] - 128) / 128) * amp * (1 + S.flash); const x = Math.cos(ang) * r, y = Math.sin(ang) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.stroke();
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.8);
    core.addColorStop(0, `hsla(${S.hue},95%,68%,${0.25 + S.flash * 0.45})`); core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function particleField(ctx, W, H, bass) {
    if (particles.length === 0 || particles._w !== W) { particles = []; particles._w = W; for (let i = 0; i < 160; i++) particles.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 1 + 0.25 }); }
    const push = 1 + bass * 6 + S.flash * 8;
    for (const p of particles) {
      p.x += (p.x - W / 2) * 0.0022 * push * p.z; p.y += (p.y - H / 2) * 0.0022 * push * p.z;
      if (p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) { p.x = W / 2 + (Math.random() - 0.5) * 70; p.y = H / 2 + (Math.random() - 0.5) * 70; }
      const hh = (S.hue + p.z * 70) % 360, r = (1 + p.z * 2.6) * (1 + bass * 2 + S.flash * 3) * S.dpr;
      ctx.fillStyle = `hsla(${hh},95%,${58 + bass * 25}%,0.9)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  return { open };
})();
