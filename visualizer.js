'use strict';
// Equalify full-screen visualizer. window.EqualifyViz.open(getAnalyser) injects a fullscreen
// canvas overlay that draws old-school reactive patterns from a live AnalyserNode.
window.EqualifyViz = (function () {
  const MODES = ['Spectrum bars', 'Radial', 'Waveform', 'Particles'];
  let S = null;
  let particles = [];

  function open(getAnalyser) {
    if (S) { S.overlay.style.display = 'block'; if (!S.running) { S.running = true; loop(); } return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#05060a;margin:0;padding:0;overflow:hidden;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    overlay.appendChild(canvas);

    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;top:14px;right:16px;display:flex;gap:8px;font-family:system-ui,Segoe UI,sans-serif;transition:opacity .4s;';
    const mk = t => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:8px 13px;font-size:12px;font-weight:600;cursor:pointer;'; return b; };
    const bMode = mk('Mode (M)'), bFull = mk('Fullscreen (F)'), bClose = mk('Close (Esc)');
    bar.append(bMode, bFull, bClose); overlay.appendChild(bar);

    const title = document.createElement('div');
    title.style.cssText = 'position:absolute;top:16px;left:20px;color:rgba(255,255,255,.55);font-family:system-ui,Segoe UI,sans-serif;font-size:13px;font-weight:700;letter-spacing:.6px;transition:opacity .4s;';
    overlay.appendChild(title);

    (document.body || document.documentElement).appendChild(overlay);

    S = {
      overlay, canvas, ctx: canvas.getContext('2d'), mode: 0, running: true, raf: 0,
      hue: 200, dpr: Math.min(window.devicePixelRatio || 1, 1.6), getAnalyser, freq: null, wave: null,
      bar, title, hideAt: 0
    };

    const resize = () => { canvas.width = Math.floor(overlay.clientWidth * S.dpr); canvas.height = Math.floor(overlay.clientHeight * S.dpr); };
    S.resize = resize; resize(); window.addEventListener('resize', resize);

    const flash = () => { S.hideAt = performance.now() + 2600; bar.style.opacity = '1'; title.style.opacity = '1'; overlay.style.cursor = 'default'; };
    const setMode = m => { S.mode = (m + MODES.length) % MODES.length; title.textContent = 'Equalify  ·  ' + MODES[S.mode]; flash(); };
    const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else overlay.requestFullscreen().catch(() => {}); };
    const close = () => { S.running = false; cancelAnimationFrame(S.raf); window.removeEventListener('resize', resize); document.removeEventListener('keydown', key); overlay.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); S = null; };
    const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'm' || e.key === 'M' || e.key === ' ') { e.preventDefault(); setMode(S.mode + 1); } else if (e.key === 'f' || e.key === 'F') toggleFull(); };

    S.setMode = setMode; S.close = close;
    overlay.addEventListener('mousemove', flash);
    canvas.addEventListener('click', () => setMode(S.mode + 1));
    bMode.onclick = e => { e.stopPropagation(); setMode(S.mode + 1); };
    bFull.onclick = e => { e.stopPropagation(); toggleFull(); };
    bClose.onclick = e => { e.stopPropagation(); close(); };
    document.addEventListener('keydown', key);

    setMode(0); loop();
  }

  function loop() {
    if (!S || !S.running) return;
    S.raf = requestAnimationFrame(loop);
    const ctx = S.ctx, W = S.canvas.width, H = S.canvas.height;
    ctx.fillStyle = 'rgba(5,6,10,0.20)'; ctx.fillRect(0, 0, W, H);
    const a = S.getAnalyser && S.getAnalyser();
    if (!a) {
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'center';
      ctx.font = `${Math.round(H / 26)}px system-ui,Segoe UI,sans-serif`;
      ctx.fillText('Play audio in this tab to see the visualizer', W / 2, H / 2);
      return;
    }
    if (!S.freq || S.freq.length !== a.frequencyBinCount) { S.freq = new Uint8Array(a.frequencyBinCount); S.wave = new Uint8Array(a.fftSize); }
    a.getByteFrequencyData(S.freq); a.getByteTimeDomainData(S.wave);
    let bass = 0; for (let i = 0; i < 8; i++) bass += S.freq[i]; bass /= 8 * 255;
    S.hue = (S.hue + 0.6 + bass * 2) % 360;
    [bars, radial, waveform, particleField][S.mode](ctx, W, H, bass);
    if (S.hideAt && performance.now() > S.hideAt) { S.bar.style.opacity = '0'; S.title.style.opacity = '0'; S.overlay.style.cursor = 'none'; S.hideAt = 0; }
  }

  function bars(ctx, W, H, bass) {
    const freq = S.freq, n = 64, step = Math.floor(freq.length * 0.7 / n) || 1, bw = W / n;
    ctx.save(); ctx.shadowBlur = 22 * S.dpr;
    for (let i = 0; i < n; i++) {
      let v = 0; for (let j = 0; j < step; j++) v += freq[i * step + j] || 0; v /= step * 255;
      const h = Math.pow(v, 1.4) * H * 0.92, hh = (S.hue + i * 2.4) % 360;
      ctx.fillStyle = `hsl(${hh},92%,60%)`; ctx.shadowColor = `hsl(${hh},92%,55%)`;
      ctx.fillRect(i * bw + bw * 0.12, H - h, bw * 0.76, h);
    }
    ctx.restore();
  }
  function radial(ctx, W, H, bass) {
    const freq = S.freq, n = 110, step = Math.floor(freq.length * 0.6 / n) || 1, base = Math.min(W, H) * (0.13 + bass * 0.06);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(performance.now() / 9000); ctx.shadowBlur = 16 * S.dpr; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let v = 0; for (let j = 0; j < step; j++) v += freq[i * step + j] || 0; v /= step * 255;
      const len = Math.pow(v, 1.3) * Math.min(W, H) * 0.34, ang = (i / n) * Math.PI * 2, hh = (S.hue + i * 3) % 360;
      ctx.strokeStyle = `hsl(${hh},92%,${48 + v * 22}%)`; ctx.shadowColor = `hsl(${hh},92%,55%)`; ctx.lineWidth = Math.max(2, W / n * 0.5);
      ctx.beginPath(); ctx.moveTo(Math.cos(ang) * base, Math.sin(ang) * base); ctx.lineTo(Math.cos(ang) * (base + len), Math.sin(ang) * (base + len)); ctx.stroke();
    }
    ctx.beginPath(); ctx.fillStyle = `hsla(${S.hue},92%,62%,${0.2 + bass * 0.5})`; ctx.shadowColor = `hsl(${S.hue},92%,60%)`;
    ctx.arc(0, 0, base * (0.6 + bass * 0.6), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function waveform(ctx, W, H, bass) {
    const wave = S.wave, n = wave.length;
    ctx.save(); ctx.lineWidth = Math.max(2, 3 * S.dpr); ctx.shadowBlur = 20 * S.dpr;
    ctx.strokeStyle = `hsl(${S.hue},92%,63%)`; ctx.shadowColor = `hsl(${S.hue},92%,60%)`;
    for (let m = 0; m < 2; m++) {
      ctx.globalAlpha = m ? 0.3 : 1; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * W, off = ((wave[i] - 128) / 128) * H * 0.4 * (1 + bass); const y = m ? H / 2 - off : H / 2 + off; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function particleField(ctx, W, H, bass) {
    if (particles.length === 0 || particles._w !== W) { particles = []; particles._w = W; for (let i = 0; i < 140; i++) particles.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 1 + 0.25 }); }
    ctx.save(); const push = 1 + bass * 7;
    for (const p of particles) {
      p.x += (p.x - W / 2) * 0.0022 * push * p.z; p.y += (p.y - H / 2) * 0.0022 * push * p.z;
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) { p.x = W / 2 + (Math.random() - 0.5) * 60; p.y = H / 2 + (Math.random() - 0.5) * 60; }
      const hh = (S.hue + p.z * 70) % 360, r = (1 + p.z * 2.6) * (1 + bass * 2.2) * S.dpr;
      ctx.fillStyle = `hsl(${hh},92%,${52 + bass * 28}%)`; ctx.shadowBlur = 9 * S.dpr; ctx.shadowColor = `hsl(${hh},92%,60%)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  return { open };
})();
