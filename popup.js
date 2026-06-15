'use strict';
const $ = id => document.getElementById(id);
const BANDS = [60, 230, 910, 3600, 14000];
const DEFAULTS = {
  enabled: true, preamp: 0, bass: 0, treble: 0, bands: [0, 0, 0, 0, 0],
  reverb: 0, width: 100, eightD: false, eightDSpeed: 0.12, speed: 100
};
const PRESETS = {
  flat: { preamp: 0, bass: 0, treble: 0, bands: [0, 0, 0, 0, 0], reverb: 0, width: 100, eightD: false, speed: 100 },
  bass: { preamp: -1, bass: 11, treble: 1, bands: [9, 5, 0, 0, 1], reverb: 0, width: 110, eightD: false, speed: 100 },
  slowed: { preamp: 0, bass: 4, treble: -1, bands: [3, 2, 0, -1, -2], reverb: 55, width: 130, eightD: false, speed: 85 },
  nightcore: { preamp: -1, bass: 0, treble: 4, bands: [0, 0, 1, 3, 5], reverb: 10, width: 110, eightD: false, speed: 128 },
  lofi: { preamp: 0, bass: 5, treble: -8, bands: [4, 2, -2, -6, -10], reverb: 30, width: 90, eightD: false, speed: 96 },
  eightd: { preamp: 0, bass: 3, treble: 1, bands: [2, 0, 0, 1, 2], reverb: 35, width: 140, eightD: true, eightDSpeed: 0.12, speed: 100 }
};
let s = { ...DEFAULTS };

function save() { chrome.storage.local.set({ eq: s }); }

function render() {
  $('enabled').checked = s.enabled;
  $('preamp').value = s.preamp; $('v-preamp').textContent = s.preamp + ' dB';
  $('bass').value = s.bass; $('v-bass').textContent = s.bass + ' dB';
  $('treble').value = s.treble; $('v-treble').textContent = s.treble + ' dB';
  $('reverb').value = s.reverb; $('v-reverb').textContent = s.reverb + '%';
  $('width').value = s.width; $('v-width').textContent = s.width + '%';
  $('speed').value = s.speed; $('v-speed').textContent = s.speed + '%';
  $('eightD').checked = s.eightD; $('eightDSpeed').value = s.eightDSpeed;
  document.querySelectorAll('.band input').forEach((el, i) => { el.value = s.bands[i]; el.nextElementSibling.textContent = (s.bands[i] > 0 ? '+' : '') + s.bands[i]; });
}

function buildEq() {
  $('eq').innerHTML = BANDS.map((f, i) =>
    `<div class="band"><input type="range" min="-15" max="15" step="0.5" value="0" data-i="${i}"><span class="db">0</span><span class="hz">${f >= 1000 ? (f / 1000) + 'k' : f}</span></div>`
  ).join('');
  document.querySelectorAll('.band input').forEach(el => el.addEventListener('input', () => {
    s.bands[+el.dataset.i] = +el.value; el.nextElementSibling.textContent = (el.value > 0 ? '+' : '') + el.value;
    clearPreset(); save();
  }));
}

function clearPreset() { document.querySelectorAll('.preset').forEach(b => b.classList.remove('on')); }

function bindSlider(id, key, suffix) {
  $(id).addEventListener('input', () => { s[key] = +$(id).value; $('v-' + id).textContent = $(id).value + suffix; clearPreset(); save(); });
}

buildEq();
bindSlider('preamp', 'preamp', ' dB');
bindSlider('bass', 'bass', ' dB');
bindSlider('treble', 'treble', ' dB');
bindSlider('reverb', 'reverb', '%');
bindSlider('width', 'width', '%');
bindSlider('speed', 'speed', '%');
$('enabled').addEventListener('change', () => { s.enabled = $('enabled').checked; save(); });
$('eightD').addEventListener('change', () => { s.eightD = $('eightD').checked; clearPreset(); save(); });
$('eightDSpeed').addEventListener('input', () => { s.eightDSpeed = +$('eightDSpeed').value; save(); });

document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
  s = { ...s, ...PRESETS[b.dataset.preset] };
  render(); clearPreset(); b.classList.add('on'); save();
}));

chrome.storage.local.get('eq', d => { s = { ...DEFAULTS, ...(d.eq || {}) }; render(); });
