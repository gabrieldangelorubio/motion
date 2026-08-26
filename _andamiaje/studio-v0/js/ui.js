// Studio UI — transport, manual controls, scene JSON editor.
import { MotionEngine } from './engine.js';
import { EASINGS } from './easings.js';

const $ = (s) => document.querySelector(s);

const engine = new MotionEngine($('.mg-stage'));
let currentSceneName = null;

// ——— Scene loading ———
async function listScenes() {
  const res = await fetch('../scenes/index.json');
  return res.json();
}

async function loadScene(name) {
  const res = await fetch(`../scenes/${name}.json`);
  const scene = await res.json();
  currentSceneName = name;
  $('#scene-json').value = JSON.stringify(scene, null, 2);
  $('#json-error').textContent = '';
  engine.load(scene);
  engine.play();
  $('#btn-play').textContent = '⏸';
}

// ——— Transport ———
$('#btn-play').addEventListener('click', () => {
  if (engine.playing) { engine.pause(); $('#btn-play').textContent = '▶'; }
  else { engine.play(); $('#btn-play').textContent = '⏸'; }
});
$('#btn-restart').addEventListener('click', () => { engine.seek(0); if (!engine.playing) engine.play(); $('#btn-play').textContent = '⏸'; });

const scrub = $('#scrub');
let scrubbing = false;
scrub.addEventListener('input', () => {
  scrubbing = true;
  engine.pause();
  $('#btn-play').textContent = '▶';
  engine.seek((scrub.value / 1000) * engine.duration);
});
scrub.addEventListener('change', () => { scrubbing = false; });

engine.onTick = (t, dur) => {
  if (!scrubbing) scrub.value = (t / dur) * 1000;
  $('#time').textContent = `${(t / 1000).toFixed(2)}s / ${(dur / 1000).toFixed(2)}s`;
};

// ——— Manual controls ———
function bindRange(id, out, fmt, onChange) {
  const el = $(id);
  const outEl = $(out);
  const update = () => { outEl.value = fmt(parseFloat(el.value)); };
  el.addEventListener('input', update);
  el.addEventListener('change', () => { update(); onChange(parseFloat(el.value)); });
  update();
}

bindRange('#ctl-speed', '#out-speed', (v) => v.toFixed(2) + '×', (v) => engine.setOverrides({ speed: v }));
bindRange('#ctl-stagger', '#out-stagger', (v) => v.toFixed(2) + '×', (v) => engine.setOverrides({ staggerMul: v }));
bindRange('#ctl-blur', '#out-blur', (v) => v.toFixed(2) + '×', (v) => engine.setOverrides({ blurMul: v }));

const easeSel = $('#ctl-ease');
easeSel.innerHTML = '<option value="">(por escena)</option>' +
  Object.keys(EASINGS).map((k) => `<option value="${k}">${k}</option>`).join('');
easeSel.addEventListener('change', () => engine.setOverrides({ easeOverride: easeSel.value || null }));

// ——— Scene JSON editor ———
$('#btn-apply').addEventListener('click', () => {
  try {
    const scene = JSON.parse($('#scene-json').value);
    $('#json-error').textContent = '';
    engine.load(scene);
    engine.play();
    $('#btn-play').textContent = '⏸';
  } catch (e) {
    $('#json-error').textContent = String(e.message || e);
  }
});

// ——— Boot ———
(async () => {
  const scenes = await listScenes();
  const sel = $('#scene-select');
  sel.innerHTML = scenes.map((s) => `<option value="${s.file}">${s.name}</option>`).join('');
  sel.addEventListener('change', () => loadScene(sel.value));
  await loadScene(scenes[0].file);
})();
