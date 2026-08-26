// Preset registry — every entrance/exit/emphasis is data, not code:
// a function of params returning WAAPI keyframes plus motion metadata
// (dominant axis + travel distance in px) that the blur engine uses to
// synthesize velocity-matched directional motion blur.
//
// Contract: entrances end at identity; exits start at identity; emphasis
// loops through identity. Identity = no transform, opacity 1, no filter.

const d = (v, def) => (v === undefined ? def : v);

export const PRESETS = {
  // ——— Entrances ———
  'fade': {
    kind: 'in',
    build: (p) => ({
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      motion: { axis: null, distance: 0 },
    }),
  },
  'rise': {
    kind: 'in',
    params: { distance: 90 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, transform: `translateY(${d(p.distance, 90)}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      motion: { axis: 'y', distance: d(p.distance, 90) },
    }),
  },
  'drop': {
    kind: 'in',
    params: { distance: 90 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, transform: `translateY(${-d(p.distance, 90)}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      motion: { axis: 'y', distance: d(p.distance, 90) },
    }),
  },
  'slide-left': {
    kind: 'in',
    params: { distance: 120 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, transform: `translateX(${d(p.distance, 120)}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      motion: { axis: 'x', distance: d(p.distance, 120) },
    }),
  },
  'slide-right': {
    kind: 'in',
    params: { distance: 120 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, transform: `translateX(${-d(p.distance, 120)}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      motion: { axis: 'x', distance: d(p.distance, 120) },
    }),
  },
  'scale-in': {
    kind: 'in',
    params: { from: 0.6 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, transform: `scale(${d(p.from, 0.6)})` },
        { opacity: 1, transform: 'scale(1)' },
      ],
      motion: { axis: null, distance: 40 },
    }),
  },
  'blur-in': {
    kind: 'in',
    params: { blur: 24 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, filter: `blur(${d(p.blur, 24)}px)` },
        { opacity: 1, filter: 'blur(0px)' },
      ],
      motion: { axis: null, distance: 0 },
      ownsFilter: true, // preset animates `filter` itself — engine blur must stay off
    }),
  },
  'rise-blur': {
    kind: 'in',
    params: { distance: 70, blur: 14 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, transform: `translateY(${d(p.distance, 70)}px)`, filter: `blur(${d(p.blur, 14)}px)` },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
      ],
      motion: { axis: 'y', distance: d(p.distance, 70) },
      ownsFilter: true,
    }),
  },
  'reveal-up': {
    kind: 'in',
    params: { distance: 110 },
    // Classic masked title: unit rises inside a clipped line box.
    build: (p) => ({
      keyframes: [
        { transform: `translateY(${d(p.distance, 110)}%)` },
        { transform: 'translateY(0)' },
      ],
      motion: { axis: 'y', distance: d(p.distance, 110) },
      clip: true, // engine sets overflow clipping on the unit's parent
    }),
  },
  'tracking-in': {
    kind: 'in',
    params: { from: '0.5em' },
    build: (p) => ({
      keyframes: [
        { opacity: 0, letterSpacing: d(p.from, '0.5em') },
        { opacity: 1, letterSpacing: 'normal' },
      ],
      motion: { axis: 'x', distance: 30 },
      wholeLayer: true, // letter-spacing only makes sense un-split
    }),
  },
  'flip-up': {
    kind: 'in',
    params: { angle: 90 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, transform: `perspective(600px) rotateX(${-d(p.angle, 90)}deg)` },
        { opacity: 1, transform: 'perspective(600px) rotateX(0deg)' },
      ],
      motion: { axis: 'y', distance: 50 },
    }),
  },
  'pop': {
    kind: 'in',
    params: { overshoot: 1.06 },
    build: (p) => ({
      keyframes: [
        { opacity: 0, transform: 'scale(0.85)', offset: 0 },
        { opacity: 1, transform: `scale(${d(p.overshoot, 1.06)})`, offset: 0.7 },
        { opacity: 1, transform: 'scale(1)', offset: 1 },
      ],
      motion: { axis: null, distance: 20 },
    }),
  },

  // ——— Exits ———
  'fade-out': {
    kind: 'out',
    build: () => ({
      keyframes: [{ opacity: 1 }, { opacity: 0 }],
      motion: { axis: null, distance: 0 },
    }),
  },
  'sink': {
    kind: 'out',
    params: { distance: 70 },
    build: (p) => ({
      keyframes: [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: `translateY(${d(p.distance, 70)}px)` },
      ],
      motion: { axis: 'y', distance: d(p.distance, 70) },
    }),
  },
  'lift-out': {
    kind: 'out',
    params: { distance: 70 },
    build: (p) => ({
      keyframes: [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: `translateY(${-d(p.distance, 70)}px)` },
      ],
      motion: { axis: 'y', distance: d(p.distance, 70) },
    }),
  },
  'blur-out': {
    kind: 'out',
    params: { blur: 20 },
    build: (p) => ({
      keyframes: [
        { opacity: 1, filter: 'blur(0px)' },
        { opacity: 0, filter: `blur(${d(p.blur, 20)}px)` },
      ],
      motion: { axis: null, distance: 0 },
      ownsFilter: true,
    }),
  },
  'lift-blur': {
    kind: 'out',
    params: { distance: 60, blur: 12 },
    build: (p) => ({
      keyframes: [
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
        { opacity: 0, transform: `translateY(${-d(p.distance, 60)}px)`, filter: `blur(${d(p.blur, 12)}px)` },
      ],
      motion: { axis: 'y', distance: d(p.distance, 60) },
      ownsFilter: true,
    }),
  },
  'conceal-down': {
    kind: 'out',
    params: { distance: 110 },
    build: (p) => ({
      keyframes: [
        { transform: 'translateY(0)' },
        { transform: `translateY(${d(p.distance, 110)}%)` },
      ],
      motion: { axis: 'y', distance: d(p.distance, 110) },
      clip: true,
    }),
  },
  'scale-out': {
    kind: 'out',
    params: { to: 0.85 },
    build: (p) => ({
      keyframes: [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: `scale(${d(p.to, 0.85)})` },
      ],
      motion: { axis: null, distance: 30 },
    }),
  },

  // ——— Emphasis (loop through identity) ———
  'pulse': {
    kind: 'fx',
    params: { scale: 1.04 },
    build: (p) => ({
      keyframes: [
        { transform: 'scale(1)' },
        { transform: `scale(${d(p.scale, 1.04)})` },
        { transform: 'scale(1)' },
      ],
      motion: { axis: null, distance: 8 },
    }),
  },
  'shimmer': {
    kind: 'fx',
    build: () => ({
      keyframes: [
        { backgroundPosition: '200% center' },
        { backgroundPosition: '-200% center' },
      ],
      motion: { axis: null, distance: 0 },
      shimmer: true, // engine applies the gradient background-clip setup
      wholeLayer: true,
    }),
  },
  'float': {
    kind: 'fx',
    params: { distance: 10 },
    build: (p) => ({
      keyframes: [
        { transform: 'translateY(0)' },
        { transform: `translateY(${-d(p.distance, 10)}px)` },
        { transform: 'translateY(0)' },
      ],
      motion: { axis: 'y', distance: d(p.distance, 10) },
    }),
  },
};

export function preset(name) {
  const p = PRESETS[name];
  if (!p) throw new Error(`Unknown preset: ${name}`);
  return p;
}

export function presetNames(kind) {
  return Object.entries(PRESETS)
    .filter(([, v]) => !kind || v.kind === kind)
    .map(([k]) => k);
}
