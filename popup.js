'use strict';
const $ = id => document.getElementById(id);
const BANDS = [60, 230, 910, 3600, 14000];
const DEFAULTS = {
  enabled: true, preamp: 0, volume: 100, bass: 0, treble: 0, bands: [0, 0, 0, 0, 0],
  reverb: 0, width: 100, eightD: false, eightDSpeed: 0.12, speed: 100, preservePitch: false
};
const PRESETS = {
  flat: { preamp: 0, volume: 100, bass: 0, treble: 0, bands: [0, 0, 0, 0, 0], reverb: 0, width: 100, eightD: false, speed: 100, preservePitch: false },
  bass: { preamp: -1, bass: 11, treble: 1, bands: [9, 5, 0, 0, 1], reverb: 0, width: 110, eightD: false, speed: 100 },
  slowed: { bass: 4, treble: -1, bands: [3, 2, 0, -1, -2], reverb: 55, width: 130, eightD: false, speed: 85, preservePitch: false },
  nightcore: { preamp: -1, treble: 4, bands: [0, 0, 1, 3, 5], reverb: 10, width: 110, eightD: false, speed: 128, preservePitch: false },
  lofi: { bass: 5, treble: -8, bands: [4, 2, -2, -6, -10], reverb: 30, width: 90, eightD: false, speed: 96 },
  eightd: { bass: 3, treble: 1, bands: [2, 0, 0, 1, 2], reverb: 35, width: 140, eightD: true, eightDSpeed: 0.12, speed: 100 }
};
const SLIDERS = { volume: '%', preamp: ' dB', bass: ' dB', treble: ' dB', reverb: '%', width: '%', speed: '%' };

let store = { sites: {}, custom: [] };
let host = 'default';
let s = { ...DEFAULTS };

function persist() { store.sites[host] = s; chrome.storage.local.set({ store }); }

function render() {
  $('enabled').checked = s.enabled;
  for (const id in SLIDERS) { $(id).value = s[id]; $('v-' + id).textContent = s[id] + SLIDERS[id]; }
  $('preservePitch').checked = s.preservePitch;
  $('eightD').checked = s.eightD; $('eightDSpeed').value = s.eightDSpeed;
  document.querySelectorAll('.band input').forEach((el, i) => { el.value = s.bands[i]; el.nextElementSibling.textContent = (s.bands[i] > 0 ? '+' : '') + s.bands[i]; });
}

function buildEq() {
  $('eq').innerHTML = BANDS.map((f, i) =>
    `<div class="band"><input type="range" min="-15" max="15" step="0.5" value="0" data-i="${i}" data-def="0"><span class="db">0</span><span class="hz">${f >= 1000 ? (f / 1000) + 'k' : f}</span></div>`
  ).join('');
  document.querySelectorAll('.band input').forEach(el => el.addEventListener('input', () => {
    s.bands[+el.dataset.i] = +el.value; el.nextElementSibling.textContent = (el.value > 0 ? '+' : '') + el.value; clearPreset(); persist();
  }));
}
function clearPreset() { document.querySelectorAll('.preset').forEach(b => b.classList.remove('on')); }

for (const id in SLIDERS) $(id).addEventListener('input', () => { s[id] = +$(id).value; $('v-' + id).textContent = $(id).value + SLIDERS[id]; clearPreset(); persist(); });
$('enabled').addEventListener('change', () => { s.enabled = $('enabled').checked; persist(); });
$('preservePitch').addEventListener('change', () => { s.preservePitch = $('preservePitch').checked; persist(); });
$('eightD').addEventListener('change', () => { s.eightD = $('eightD').checked; clearPreset(); persist(); });
$('eightDSpeed').addEventListener('input', () => { s.eightDSpeed = +$('eightDSpeed').value; persist(); });

document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
  s = { ...s, ...PRESETS[b.dataset.preset] }; render(); clearPreset(); b.classList.add('on'); persist();
}));

// slider QoL: double-click resets to default, wheel fine-tunes
document.addEventListener('dblclick', e => { const el = e.target; if (el.type === 'range' && el.dataset.def !== undefined) { el.value = el.dataset.def; el.dispatchEvent(new Event('input', { bubbles: true })); } });
document.addEventListener('wheel', e => {
  const el = e.target; if (el.type !== 'range') return; e.preventDefault();
  const step = +(el.step || 1); el.value = +el.value + (e.deltaY < 0 ? step : -step); el.dispatchEvent(new Event('input', { bubbles: true }));
}, { passive: false });

// custom presets
function renderCustom() {
  $('custom-chips').innerHTML = (store.custom || []).map((p, i) =>
    `<span class="chip" data-i="${i}">${p.name}<span class="x" data-del="${i}">×</span></span>`).join('');
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', e => {
    if (e.target.dataset.del !== undefined) { store.custom.splice(+e.target.dataset.del, 1); chrome.storage.local.set({ store }); renderCustom(); return; }
    s = { ...s, ...store.custom[+c.dataset.i].s }; render(); clearPreset(); persist();
  }));
}
$('preset-save').addEventListener('click', () => {
  const name = $('preset-name').value.trim(); if (!name) return;
  const { enabled, ...snap } = s;
  store.custom = store.custom || []; store.custom.push({ name, s: snap });
  chrome.storage.local.set({ store }); $('preset-name').value = ''; renderCustom();
});
$('preset-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('preset-save').click(); });

// visualizer
function drawViz(bars) {
  const c = $('viz'), ctx = c.getContext('2d'), W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#6366f1'); grad.addColorStop(.5, '#8b5cf6'); grad.addColorStop(1, '#22d3ee');
  ctx.fillStyle = grad; const bw = W / bars.length;
  for (let i = 0; i < bars.length; i++) { const h = Math.max(2, (bars[i] / 255) * H); ctx.fillRect(i * bw + 1, H - h, bw - 2, h); }
}

function setStatus(kind, text) { const el = $('status'); el.className = 'status ' + kind; $('status-text').textContent = text; }

// init
buildEq();
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs[0];
  chrome.storage.local.get('store', d => {
    store = { sites: {}, custom: [], ...(d.store || {}) };
    const finish = () => { s = { ...DEFAULTS, ...(store.sites[host] || {}) }; render(); renderCustom(); };
    if (!tab) { setStatus('bad', 'No active tab'); finish(); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'status' }, resp => {
      if (chrome.runtime.lastError || !resp) { setStatus('bad', 'Not supported on this page'); host = 'default'; finish(); return; }
      host = resp.hostname;
      if (resp.active) setStatus('ok', 'Active on ' + host);
      else if (resp.hasMedia) setStatus('warn', 'Ready - effects apply on play');
      else setStatus('warn', 'No audio found on this tab yet');
      try { const port = chrome.tabs.connect(tab.id, { name: 'viz' }); port.onMessage.addListener(drawViz); } catch (e) {}
      finish();
    });
  });
});
