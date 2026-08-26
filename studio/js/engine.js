// Motion engine — declarative JSON scene → DOM + WAAPI animations under a
// single deterministic clock.
//
// Every animation is created paused; a rAF loop advances a master clock and
// writes `currentTime` into each animation. That one decision buys us exact
// scrubbing, variable playback rate, and frame-perfect export (seek to
// t = frame/fps, rasterize, repeat) with zero drift.

import { ease, velocityAt } from './easings.js';
import { splitText, staggerDelays } from './split.js';
import { preset } from './presets.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class MotionEngine {
  constructor(stageEl) {
    this.stage = stageEl;
    this.scene = null;
    this.tracks = [];        // { anim, start, duration }
    this.blurTracks = [];    // velocity-driven directional blur segments
    this.time = 0;
    this.rate = 1;
    this.playing = false;
    this.duration = 0;
    this.overrides = { speed: 1, staggerMul: 1, blurMul: 1, easeOverride: null };
    this.onTick = null;
    this._raf = null;
    this._last = null;
    this._svgDefs = null;
    this._filterSeq = 0;
  }

  load(scene) {
    this.destroy();
    this.scene = scene;
    const { width = 1920, height = 1080, bg = '#0b0b0e' } = scene.canvas || {};
    this.stage.innerHTML = '';
    this.stage.style.background = bg;

    const frame = document.createElement('div');
    frame.className = 'mg-frame';
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    this.stage.appendChild(frame);
    this.frame = frame;
    this._fitFrame(width, height);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'mg-svg-defs');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    this._svgDefs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(this._svgDefs);
    frame.appendChild(svg);

    for (const layer of scene.layers || []) this._buildLayer(layer, frame);

    this.duration = scene.duration ??
      Math.max(1000, ...this.tracks.map((t) => t.start + t.duration));
    this.seek(0);
    return this;
  }

  _fitFrame(w, h) {
    const fit = () => {
      const s = Math.min(this.stage.clientWidth / w, this.stage.clientHeight / h);
      this.frame.style.transform = `translate(-50%, -50%) scale(${s})`;
    };
    fit();
    this._resizeObs = new ResizeObserver(fit);
    this._resizeObs.observe(this.stage);
  }

  _buildLayer(layer, frame) {
    const el = document.createElement('div');
    el.className = 'mg-layer';
    el.dataset.layerId = layer.id || '';
    el.textContent = layer.text || '';
    Object.assign(el.style, layer.style || {});
    const pos = layer.position || {};
    el.style.left = pos.x ?? '50%';
    el.style.top = pos.y ?? '50%';
    el.style.transform = {
      'center': 'translate(-50%, -50%)',
      'top-left': 'none',
      'top-center': 'translateX(-50%)',
      'bottom-center': 'translate(-50%, -100%)',
    }[pos.anchor ?? 'center'] ?? 'translate(-50%, -50%)';
    frame.appendChild(el);

    const needsWholeLayer = ['in', 'out', 'emph'].some((k) => {
      const seg = layer[k];
      return seg && preset(seg.preset).build(seg.params || {}).wholeLayer;
    });
    const splitMode = needsWholeLayer ? 'none' : (layer.split || 'none');
    const units = splitText(el, splitMode);

    for (const segKind of ['in', 'out', 'emph']) {
      const seg = layer[segKind];
      if (!seg) continue;
      this._buildSegment(layer, el, units, seg, segKind);
    }
  }

  _buildSegment(layer, el, units, seg, segKind) {
    const def = preset(seg.preset);
    const built = def.build(seg.params || {});
    const easeTok = ease(this.overrides.easeOverride || seg.ease || 'smooth');
    const dur = (seg.duration ?? 800) / this.overrides.speed;
    const at = (seg.at ?? 0) / this.overrides.speed;
    const stepMs = ((seg.stagger ?? 0) * this.overrides.staggerMul) / this.overrides.speed;
    const targets = built.wholeLayer ? [el] : units;
    const delays = staggerDelays(targets.length, stepMs, seg.staggerOrder || 'start');

    if (built.clip) {
      for (const t of targets) {
        const parent = t.parentElement;
        if (parent && parent !== el) { parent.style.overflow = 'hidden'; parent.style.display = 'inline-block'; parent.style.verticalAlign = 'top'; }
        else el.style.overflow = 'hidden';
      }
    }
    if (built.shimmer) {
      el.classList.add('mg-shimmer');
      el.style.backgroundImage = seg.params?.gradient ||
        'linear-gradient(100deg, currentColor 40%, rgba(255,255,255,0.35) 50%, currentColor 60%)';
    }

    // Out-segments must hold their end state; in-segments must hold their
    // start state before `at` — fill both directions and layer by composite.
    for (let i = 0; i < targets.length; i++) {
      const anim = targets[i].animate(built.keyframes, {
        duration: dur,
        delay: 0,
        easing: easeTok.css,
        fill: 'both',
        composite: segKind === 'emph' ? 'add' : 'replace',
        iterations: segKind === 'emph' ? (seg.loop === false ? 1 : Infinity) : 1,
      });
      anim.pause();
      this.tracks.push({ anim, start: at + delays[i], duration: dur, seg: segKind });
    }

    // Velocity-matched directional motion blur for transform-driven presets.
    const blurAmt = (layer.fx?.motionBlur ?? 0) * this.overrides.blurMul;
    if (blurAmt > 0 && !built.ownsFilter && built.motion.distance > 0) {
      const filterId = `mgblur-${this._filterSeq++}`;
      const f = document.createElementNS(SVG_NS, 'filter');
      f.setAttribute('id', filterId);
      // Generous filter region so blur never clips at unit bounds.
      f.setAttribute('x', '-50%'); f.setAttribute('y', '-50%');
      f.setAttribute('width', '200%'); f.setAttribute('height', '200%');
      const g = document.createElementNS(SVG_NS, 'feGaussianBlur');
      g.setAttribute('stdDeviation', '0 0');
      f.appendChild(g);
      this._svgDefs.appendChild(f);

      const meanDelay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
      this.blurTracks.push({
        el, gaussian: g, filterId,
        start: at + meanDelay, duration: dur,
        easeFn: easeTok.fn,
        axis: built.motion.axis,
        distance: built.motion.distance,
        amount: blurAmt,
        active: false,
      });
    }
  }

  // ——— Transport ———
  play() {
    if (this.playing) return;
    this.playing = true;
    this._last = performance.now();
    const loop = (now) => {
      if (!this.playing) return;
      this.time += (now - this._last) * this.rate;
      this._last = now;
      if (this.time >= this.duration) {
        if (this.scene?.loop === false) { this.time = this.duration; this._apply(); this.pause(); return; }
        this.time = 0;
      }
      this._apply();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  pause() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  seek(ms) {
    this.time = Math.min(Math.max(0, ms), this.duration);
    this._apply();
  }

  _apply() {
    for (const t of this.tracks) {
      const local = this.time - t.start;
      // currentTime < 0 would deactivate the effect; clamp into fill zones.
      t.anim.currentTime = Math.max(-1e-3, local);
    }
    for (const b of this.blurTracks) this._applyBlur(b);
    if (this.onTick) this.onTick(this.time, this.duration);
  }

  _applyBlur(b) {
    const t = (this.time - b.start) / b.duration;
    let std = 0;
    if (t > 0 && t < 1) {
      // px/ms → blur radius: velocity over one 60fps shutter interval,
      // halved (gaussian std ≈ half the smear length), scaled by intensity.
      const v = Math.abs(velocityAt(b.easeFn, t)) * (b.distance / b.duration);
      std = Math.min(40, v * 16.7 * 0.5 * b.amount);
    }
    if (std > 0.3) {
      b.gaussian.setAttribute('stdDeviation',
        b.axis === 'x' ? `${std.toFixed(2)} 0` :
        b.axis === 'y' ? `0 ${std.toFixed(2)}` :
        `${(std / 2).toFixed(2)} ${(std / 2).toFixed(2)}`);
      if (!b.active) { b.el.style.filter = `url(#${b.filterId})`; b.active = true; }
    } else if (b.active) {
      b.el.style.filter = '';
      b.active = false;
    }
  }

  setOverrides(patch) {
    Object.assign(this.overrides, patch);
    // Rebuild with the same scene — overrides bake into track timing.
    if (this.scene) {
      const t = this.time, playing = this.playing;
      this.load(this.scene);
      this.seek(Math.min(t, this.duration));
      if (playing) this.play();
    }
  }

  destroy() {
    this.pause();
    if (this._resizeObs) this._resizeObs.disconnect();
    for (const t of this.tracks) t.anim.cancel();
    this.tracks = [];
    this.blurTracks = [];
    this._filterSeq = 0;
  }
}
