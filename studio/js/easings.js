// Motion easing tokens — dual representation:
//  - `css`: string usable in CSS / WAAPI (cubic-bezier or linear())
//  - `fn`:  JS function t∈[0,1] → progress, used to derive velocity for motion blur
// Both representations MUST describe the same curve.

function cubicBezier(x1, y1, x2, y2) {
  // Newton-Raphson solve for t given x, then evaluate y — standard CSS timing function math.
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) break;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

// Damped spring → sampled into both a JS function and a CSS linear() stop list.
// stiffness/damping/mass follow the familiar framer-motion parameterization.
export function spring({ stiffness = 170, damping = 20, mass = 1, samples = 60 } = {}) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  let fn;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    fn = (t) => {
      const T = t * 1.0;
      return 1 - Math.exp(-zeta * w0 * T * 6) *
        (Math.cos(wd * T * 6) + (zeta * w0 / wd) * Math.sin(wd * T * 6));
    };
  } else {
    fn = (t) => 1 - Math.exp(-w0 * t * 6) * (1 + w0 * t * 6);
  }
  const stops = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    stops.push(`${+fn(t).toFixed(4)} ${+(t * 100).toFixed(2)}%`);
  }
  return { css: `linear(${stops.join(', ')})`, fn };
}

const bez = (x1, y1, x2, y2) => ({
  css: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`,
  fn: cubicBezier(x1, y1, x2, y2),
});

// The token set. Names are part of the scene-JSON contract — additive changes only.
export const EASINGS = {
  'linear':      { css: 'linear', fn: (t) => t },
  'out-quad':    bez(0.25, 0.46, 0.45, 0.94),
  'out-cubic':   bez(0.215, 0.61, 0.355, 1),
  'out-quart':   bez(0.165, 0.84, 0.44, 1),
  'out-expo':    bez(0.19, 1, 0.22, 1),
  'out-back':    bez(0.175, 0.885, 0.32, 1.275),
  'in-quad':     bez(0.55, 0.085, 0.68, 0.53),
  'in-cubic':    bez(0.55, 0.055, 0.675, 0.19),
  'in-expo':     bez(0.95, 0.05, 0.795, 0.035),
  'in-back':     bez(0.6, -0.28, 0.735, 0.045),
  'in-out-cubic':bez(0.645, 0.045, 0.355, 1),
  'in-out-expo': bez(0.87, 0, 0.13, 1),
  'smooth':      bez(0.4, 0.0, 0.2, 1),        // material standard — the safe default
  'snap':        bez(0.9, 0.05, 0.1, 1),       // fast middle, soft ends
  'spring-soft':  spring({ stiffness: 120, damping: 18 }),
  'spring-tight': spring({ stiffness: 260, damping: 24 }),
  'spring-bouncy':spring({ stiffness: 220, damping: 12 }),
};

export function ease(name) {
  return EASINGS[name] || EASINGS['smooth'];
}

// Numeric velocity of an easing at t (progress units per normalized time).
// Drives the motion-blur intensity curve.
export function velocityAt(fn, t, dt = 1 / 240) {
  const a = fn(Math.max(0, t - dt));
  const b = fn(Math.min(1, t + dt));
  return (b - a) / (2 * dt);
}
