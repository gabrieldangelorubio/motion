# Premium Design-Agency Motion Vocabulary Taxonomy
## Web Animation Elements & Implementation Guide (2026)

This taxonomy covers every motion element seen in Awwwards-winning case study videos, mapped to achievable web techniques with difficulty, performance notes, and required tools.

---

## 1. ANIMATED TITLES & KINETIC TYPOGRAPHY

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Character-by-character reveal** | GSAP SplitText + mask: "chars" | Easy | GSAP (free) | GPU-accelerated | Wrap each char in `overflow:hidden` with staggered tweens. Built-in accessibility via aria labels. |
| **Word reveal (sliding)** | GSAP SplitText + mask: "words" + translateX | Easy | GSAP | GPU | Masks auto-wrap words; animate x-translation for slide-in. Responsive re-split on resize/font load. |
| **Line-by-line entrance** | GSAP SplitText + mask: "lines" + opacity/y | Easy | GSAP | GPU | Mask each line; stagger opacity or y-position. Clean for headlines. |
| **Character morphing** | GSAP MorphSVG (SVG fonts) | Medium | GSAP MorphSVG plugin | GPU | Morph text outlines between two SVG shapes. Ensure equal vertex counts. Requires SVG text conversion. |
| **Scramble/glitch reveal** | GSAP SplitText + char swaps onUpdate | Medium | GSAP + custom logic | CPU-bound | Randomly swap chars before final reveal. Can stutter if overused. Cap to 100-200 chars. |
| **Kinetic dance (elastic/bounce)** | GSAP tweens + easing (Elastic, Back) | Easy | GSAP | GPU | Position chars individually; use staggered easing. Apple-style: subtle scale + rotation tweens. |
| **3D text rotation/perspective** | CSS transform-style: preserve-3d + GSAP rotationX/Y/Z | Medium | GSAP + CSS 3D | GPU | Set perspective on parent; animate rotationX, rotationY. Watch browser paint for scale effects. |
| **Gradient/duotone text** | CSS background-clip: text + animated SVG gradient | Medium | CSS + SVG filters | GPU | Use `background-clip: text` with animated `<linearGradient>` or `<radialGradient>`. Requires prefixes (-webkit). |
| **Text shadow glow pulse** | CSS filter: drop-shadow + @keyframes or GSAP | Easy | CSS or GSAP | GPU | Stack multiple drop-shadows for multi-color glow. Animate filter on demand (not on scroll = performance). |
| **Word-break with stagger** | GSAP SplitText with propIndex + onUpdate callback | Medium | GSAP + CSS | GPU | Use `propIndex: true` to add `--i` CSS var; target with `:nth-child(var(--i))` for wave/delay effects. |

### Code Sketch: Character Reveal with Stagger
```javascript
gsap.registerPlugin(SplitText);
const split = new SplitText("h1", { type: "chars" });
gsap.to(split.chars, {
  opacity: 1,
  y: 0,
  duration: 0.5,
  stagger: 0.05,
  ease: "power2.out"
});
```

---

## 2. DEVICE MOCKUPS & FRAME CONTAINERS

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Phone/laptop frame (static)** | Tailwind CSS or CSS Device Mockups lib | Easy | CSS (Tailwind/Flowbite) | Static | Use pseudo-elements for bezels; SVG-based frames scale infinitely. Device-frames lib on GitHub. |
| **Screen content scrolling inside frame** | iframe + position:absolute overflow + GSAP scroll simulation | Medium | GSAP ScrollTrigger | GPU | Nest scrollable content in mockup container; drive scroll via ScrollTrigger or manual scroll. Avoid nested iframes for perf. |
| **Parallax inside device frame** | CSS preserve-3d + translateZ layers inside frame | Medium | CSS 3D + GSAP (optional) | GPU | Position content at different Z depths; perspective on frame container creates depth illusion as user scrolls. |
| **Responsive frame adapt** | CSS aspect-ratio + CSS Grid layout | Easy | CSS | Static | Use `aspect-ratio: 9/16` or `aspect-ratio: 16/9` for frame; content scales with container. |
| **Frame rotation (3D isometric)** | CSS transform: rotateX() rotateY() + perspective | Medium | CSS 3D | GPU | Position frames in 3D space; watch for browser repaint costs on scale transforms. |
| **Multiple frames transition (Flip)** | GSAP Flip + grid layout change | Medium | GSAP Flip | GPU | Record state, change grid columns, Flip animates rearrangement. Smooth multi-device showcase. |

### Code Sketch: Responsive Device Frame
```css
.device-frame {
  aspect-ratio: 9 / 16;
  border-radius: 2rem;
  border: 2rem solid #1a1a1a;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.device-screen {
  width: 100%;
  height: 100%;
  overflow-y: scroll;
}
```

---

## 3. MEDIA FRAMING & GRID LAYOUTS

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Aspect-ratio image containers** | CSS aspect-ratio property + object-fit | Easy | CSS | Static | `aspect-ratio: 16/9` keeps size without layout shift. Use `object-fit: cover` for cropping. |
| **Grid rearrange (filter/sort)** | GSAP Flip + CSS Grid | Medium | GSAP Flip | GPU | Flip records grid item positions, DOM changes, Flip animates. Smooth layout shift for portfolios. |
| **Image-in-frame pan/zoom** | GSAP x,y,scale tweens on img or SVG viewBox | Medium | GSAP | GPU | Nest image in fixed container; animate img transform. Use MotionPath for complex trajectories. |
| **Masonry layout entry** | GSAP staggered opacity + y from different offsets | Easy | GSAP | GPU | Stagger each item reveal by row/column index. Use propIndex via SplitText logic. |
| **Media carousel parallax** | GSAP Draggable + momentum via InertiaPlugin | Medium | GSAP Draggable + Inertia | GPU | Drag items horizontally; InertiaPlugin adds physics decel. Snap to grid points for cleanliness. |
| **Aspect ratio video responsive** | CSS aspect-ratio + object-fit: cover on video element | Easy | CSS | GPU (video HW decode) | Modern browsers support aspect-ratio natively. Combine with media queries for mobile fallback (image). |
| **Image swap/crossfade** | GSAP opacity tween + visibility toggle | Easy | GSAP | GPU | Fade out old image, swap src/background, fade in. Or use position:absolute layers for seamless swap. |

### Code Sketch: Grid Rearrange with Flip
```javascript
gsap.registerPlugin(Flip);
const grid = document.querySelector(".grid");
const state = Flip.getState(".grid-item");
// ... update grid layout in CSS or DOM ...
Flip.from(state, {
  duration: 0.6,
  ease: "power2.inOut"
});
```

---

## 4. CAMERA MOVES & 2.5D PARALLAX

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Horizontal pan (offset-x)** | GSAP x-tween on container or background-position | Easy | GSAP | GPU | Translate container left/right. Combine with ScrollTrigger for scroll-driven pan. |
| **Vertical push-in (zoom + y-offset)** | GSAP scale + y combined tweens | Easy | GSAP | GPU | Grow scale while shifting y-position. Typical for hero-to-content transitions. |
| **Parallax depth (translateZ layers)** | CSS perspective + preserve-3d + translateZ + ScrollTrigger | Medium | CSS 3D + GSAP ScrollTrigger | GPU | Parent has perspective; children at different Z coords move at different scroll speeds. Negative Z = slower, positive Z = faster. |
| **2.5D camera rig (inverse transform)** | Container transform + child inverse transforms for 3D layer effect | Advanced | GSAP + custom math | GPU | Apply perspective + 3D transforms to world container; child elements inherit parallax. Requires manual offset calcs. |
| **Zoom transition (scale keyframes)** | GSAP timeline with scale, opacity, blur sequenced tweens | Medium | GSAP | GPU | Chain tweens: shrink element A, transition blur, grow element B. Masks optional for reveal. |
| **Mouse-tracking parallax (3D tilt)** | Listener for mousemove + GSAP rotationX/rotationY + perspective | Medium | GSAP + JS mouse tracking | GPU | Tilt container based on mouse position; child layers at different Z create illusion of depth. Watch for jank on slow devices. |
| **Path-based camera (MotionPath simulation)** | GSAP MotionPath + SVG path or custom bezier | Advanced | GSAP MotionPath | GPU | Animate element position along complex path. Useful for "camera flying" through sections. |

### Code Sketch: Parallax with Perspective & ScrollTrigger
```javascript
gsap.registerPlugin(ScrollTrigger);
// Parent has perspective:1000px and transform-style:preserve-3d
gsap.to(".parallax-layer", {
  z: -200,
  scrollTrigger: {
    trigger: ".hero",
    start: "top top",
    end: "bottom top",
    scrub: 1,
    markers: true
  }
});
```

---

## 5. TEXTURE LAYERS & GRAIN EFFECTS

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **SVG feTurbulence grain** | Inline SVG `<feTurbulence type="fractalNoise">` + `<feColorMatrix>` | Easy | SVG filters | GPU | Static or SMIL-animated. Attributes: `baseFrequency="0.5"`, `numOctaves="3"`, `stitchTiles="stitch"`. Renders seamlessly. |
| **Animated noise loop** | SVG feTurbulence with animated `<animate>` or GSAP attr tweens | Medium | SVG + GSAP | GPU | Animate `baseFrequency` or seed attribute for organic evolving grain. Limit numOctaves ≤ 3 for perf; large numOctaves = expensive. |
| **Film grain overlay (blend mode)** | Div with SVG grain bg + mix-blend-mode: overlay/multiply | Easy | CSS + SVG | GPU | Layer grain texture on top; blend mode darkens/lightens base. `opacity: 0.05–0.15` for subtle effect. |
| **Halftone texture** | SVG circle patterns (radialGradient) or `<feSpotLight>` | Medium | SVG filters | GPU | Use `<feSpecularLighting>` + `<fePointLight>` for halftone look. Or CSS background pattern via `radial-gradient` repeating. |
| **Paper/canvas texture** | SVG feTurbulence + feDisplacementMap | Medium | SVG filters | GPU | Displace actual content via turbulence map. Costly; use sparingly on hero sections only. Test on older devices. |
| **Noise layer fade-in/out** | GSAP opacity tween on grain SVG or blend-mode animation | Easy | GSAP | GPU | Reveal or hide grain via opacity or filter blur. Pairs well with scroll-triggered reveals. |
| **Animated glow aura** | Nested SVG circles with animated `r`, feGaussianBlur, blur filters | Medium | SVG + GSAP | GPU | Concentric circles with gradients + blur. Animate r (radius) for pulse. Limit 2–3 glows per element (expensive). |

### Code Sketch: Inline SVG Grain Generator
```html
<svg width="100%" height="100%" style="position:fixed; top:0; left:0; pointer-events:none">
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="2"/>
    <feColorMatrix type="saturate" values="0"/>
    <feBlend in="SourceGraphic" in2="grain" mode="overlay"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#grain)" opacity="0.08"/>
</svg>
```

---

## 6. COLOR & LIGHT EFFECTS

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Animated gradient background** | CSS `@keyframes` or `linear-gradient` + GSAP bg animation | Easy | CSS or GSAP | GPU | Animate background position or via GSAP `backgroundImage` tween (limited). Better: SVG `<linearGradient>` + animate stop offsets. |
| **Duotone color overlay** | SVG `<feColorMatrix>` with `saturate`, `hueRotate` | Easy | SVG filters | GPU | Apply to image or layer. Adjust matrix values for blue/orange, red/teal duotone looks. |
| **Glow/shadow drop** | CSS `filter: drop-shadow()` or text-shadow + blur | Easy | CSS | GPU | Stack multiple drop-shadows for multi-color aura. Animate via GSAP `filter` tween. Cheaper than box-shadow. |
| **Backdrop blur effect** | CSS `backdrop-filter: blur(10px)` | Easy | CSS | GPU | Browser support good (2026). Frosted glass look. Do NOT combine with mask/clip-path (browser bug). Use blend mode workaround. |
| **Glowing text (neon)** | text-shadow stacked + glow filter + mix-blend-mode: screen | Medium | CSS + GSAP | GPU | Layer multiple text-shadows with different colors. Add `mix-blend-mode: screen` for light amplification. Animate shadow-blur via GSAP. |
| **Chromatic aberration** | WebGL shader (Curtains.js) or CSS `filter: hue-rotate() invert()` | Advanced | WebGL + shader lib or CSS | GPU/WebGL | Full CA requires WebGL. CSS approximation: layer RGB channels separately with slight offset (via SVG feColorMatrix). |
| **Ambient light shift** | GSAP color tween on CSS variables or SVG gradient stops | Medium | GSAP + CSS custom properties | GPU | Use `--primary-color: hsl(...)` ; tween via GSAP `duration: long` for cinematic color sweep. |
| **Mesh gradient (animated)** | Canvas-based mesh or SVG gradients with multiple stops | Advanced | Canvas/WebGL or SVG | GPU/Canvas | SVG: use radial gradients at different positions, animate cx/cy/r. Canvas: need custom gradient painter. |

### Code Sketch: Duotone + Animated Overlay
```javascript
gsap.to(".overlay", {
  // Animate SVG feColorMatrix
  attr: { "values": "0 .2 0 0 0 0 .2 0 0 0 0 0 .2 0 0 0 0 0 1 0" },
  duration: 3,
  repeat: -1,
  yoyo: true
});
```

---

## 7. TRANSITIONS & MORPHING SHAPES

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **SVG shape morph** | GSAP MorphSVG plugin on SVG `<path d="...">` | Easy | GSAP MorphSVG | GPU | Interpolates path commands. Ensure both shapes have **equal vertex count**. Use Flubber.js (free alt) if avoiding MorphSVG cost. |
| **Wipe transition (mask reveal)** | CSS `mask-image` + animated gradient, or SVG `<mask>` | Medium | CSS or SVG | GPU | Animate mask-position or update mask gradient direction. Horizontal wipe: animate `mask-position-x: 0% → 100%`. |
| **Morph to blur + fade** | GSAP MorphSVG + opacity + blur chained tweens | Medium | GSAP MorphSVG + filters | GPU | Chain: morph shape, fade, blur. Clean for state transitions. |
| **Liquid blob morph** | SVG Blob paths + MorphSVG + feTurbulence animation | Advanced | GSAP MorphSVG + SVG filters | GPU | Combine MorphSVG for keyframe morphs + feTurbulence for organic wobble. Expensive if constant; use clip-path mask. |
| **Page curl peel** | Canvas-based (Three.js) or CSS skew + clip-path | Advanced | Three.js or CSS hacks | Canvas/GPU | CSS approximation: `skew()` + `clip-path: polygon()` animation. True curl requires 3D mesh. |
| **Dissolve (scatter/particle)** | Canvas particle system or SVG circles fading + random y | Advanced | Canvas or GSAP Draggable rig | Canvas | Dissolve element into particles as exit. Expensive; limit to hero sections. GSAP approach: many tiny SVG circles, stagger fade + random translate. |
| **Transition between sections (fade + scale)** | GSAP opacity + scale timeline | Easy | GSAP | GPU | Fade out section A, scale-down slightly (depth cue), fade in section B. Clean, Apple-style. |

### Code Sketch: SVG Shape Morph
```javascript
gsap.registerPlugin(MorphSVG);
gsap.to("#shape", {
  attr: { d: "M100,100 L200,100 L200,200 L100,200 Z" }, // target path
  duration: 1,
  ease: "power2.inOut"
});
```

---

## 8. UI WALKTHROUGH RECORDINGS (Scripted Animation)

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Screen cursor path** | SVG circle element + GSAP MotionPath | Medium | GSAP MotionPath | GPU | Animate cursor (SVG or img) along path; show click circles on tap points. Pair with ScrollTrigger for scroll-sync. |
| **Element highlight/focus ring** | SVG circle or rect + GSAP scale + glow filter | Easy | GSAP + SVG | GPU | Highlight UI element with animated stroke or shadow. Scale pulse for "look here" cue. |
| **Text input simulation (typing)** | GSAP onUpdate callback + string slice or SplitText reveal | Medium | GSAP SplitText | GPU | Reveal chars one-by-one to simulate typing. Pair with cursor blink via CSS keyframes. |
| **Button click sequence** | Timeline of scale + shadow tweens | Easy | GSAP | GPU | Tween button: `scale: 1 → 0.95 → 1` + shadow blur on click. Mimic interaction feedback. |
| **Screen scroll demo** | ScrollTrigger scrub + simulated scroll wheel via `window.scrollTo` or GSAP y-tween on content container | Medium | GSAP ScrollTrigger | GPU | Scripted scroll or manual tween of `transform: translateY()` to mimic scroll effect. Timeline for choreography. |
| **Tooltip/callout reveal** | GSAP opacity + y entrance + line connector animation | Easy | GSAP + SVG | GPU | Pop in tooltip with scale + opacity; draw line from callout to element via DrawSVG. |
| **Full walkthrough choreography** | GSAP Timeline with nested tweens, ScrollTrigger or manual play() | Advanced | GSAP Timeline | GPU | Build timeline: `cursor move → element highlight → input type → button click → next screen`. Sync audio if needed. |

### Code Sketch: Cursor + Click Animation
```javascript
const tl = gsap.timeline();
tl.to(".cursor", { x: 300, y: 150, duration: 1 }, 0)
  .to(".click-circle", { scale: 1, opacity: 1, duration: 0.2 }, 1)
  .to(".click-circle", { scale: 0, opacity: 0, duration: 0.3 }, 1.2);
```

---

## 9. DATA VISUALIZATION & STAT COUNTERS

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Number counter (0 → X)** | GSAP number tween with onUpdate + DOM text injection | Easy | GSAP | GPU | Use `gsap.to({count: 0}, {count: 1000, onUpdate() { el.textContent = Math.round(this.targets()[0].count); }})`. Pair with ScrollTrigger for scroll-in. |
| **Stat bar fill (progress bar)** | GSAP width or scaleX tween on bar element | Easy | GSAP | GPU | Animate `width: 0 → 100%` or `scaleX: 0 → 1`. Include label counter above. |
| **Circular progress ring** | SVG circle stroke-dasharray animation | Medium | GSAP + SVG | GPU | Animate `stroke-dasharray` + `stroke-dashoffset` via GSAP. Formula: `circumference = 2πr`. |
| **Donut/pie chart animated build** | SVG circle segments with animated `stroke-dasharray` | Medium | GSAP + SVG | GPU | Each segment is separate circle; stagger dash animation per segment. Color via `stroke` attribute. |
| **Sparkline/line graph draw** | SVG `<path>` + DrawSVG or GSAP attr tween on `d` | Medium | GSAP DrawSVG | GPU | Draw line as if charting in real-time. Pair with number counter. |
| **Gauge/meter needle** | SVG line + GSAP rotationZ around transform-origin | Easy | GSAP + SVG | GPU | Rotate needle from 0° to angle. Set `transform-origin: cx,cy` at pivot point. |
| **Animating data label entrance** | GSAP opacity + y + SplitText or number counter | Medium | GSAP | GPU | Fade in label while number counts up. Stagger if multiple stats. |

### Code Sketch: Number Counter with Formatting
```javascript
const target = 1250;
gsap.to({ value: 0 }, {
  value: target,
  duration: 2.5,
  ease: "power2.out",
  scrollTrigger: ".stats-section",
  onUpdate() {
    document.querySelector("#stat-value").textContent = 
      Math.round(this.targets()[0].value).toLocaleString();
  }
});
```

---

## 10. LOGO ANIMATIONS & REVEALS

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **SVG path draw reveal** | GSAP DrawSVG plugin or GSAP attr tween on `stroke-dasharray` | Easy | GSAP DrawSVG | GPU | Animate stroke from 0% to 100% to simulate drawing. Requires SVG with stroked paths. |
| **Logo morph/transform** | GSAP MorphSVG between logo variants | Medium | GSAP MorphSVG | GPU | Morph wordmark to icon or vice versa. Equal vertex count. Smooth state transition for brand reveal. |
| **Logo entrance (scale + rotate)** | GSAP scale + rotationZ + opacity combined tween | Easy | GSAP | GPU | Classic "spin + grow + fade in" reveal. Ease: "elastic.out" for bouncy, "back.out" for snappy. |
| **Logo color shift** | GSAP attr tween on SVG `fill` or CSS color var | Easy | GSAP | GPU | Animate `fill: oldColor → newColor` via GSAP. Pair with duotone filter for multi-layer effect. |
| **Nested logo element animation** | Timeline with offset tweens on child elements (circles, lines, text) | Medium | GSAP Timeline | GPU | Animate each logo component with stagger. Build recognition through choreography. |
| **Logo clip-path reveal** | CSS `clip-path: polygon()` animated via GSAP | Medium | GSAP + CSS | GPU | Reveal logo via expanding polygon or circle. Cheaper than morphing; works on any element. |

### Code Sketch: Draw SVG Logo
```javascript
gsap.registerPlugin(DrawSVG);
gsap.to("#logo-path", {
  strokeDasharray: 1000,
  strokeDashoffset: 1000,
  duration: 0,
  onComplete() {
    gsap.to("#logo-path", {
      strokeDashoffset: 0,
      duration: 2,
      ease: "power2.inOut"
    });
  }
});
```

---

## 11. BACKGROUND LOOPS & AMBIENT MOTION

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Animated particle field** | Canvas with requestAnimationFrame or WebGL (Three.js) | Advanced | Canvas or Three.js | Canvas/WebGL | CPU-heavy; limit to 500–1000 particles for 60fps on mid-range devices. Three.js: use BufferGeometry + Points for 10K+ particles. |
| **Looping video background** | HTML `<video>` with autoplay muted loop + `object-fit: cover` | Easy | HTML + CSS | GPU (HW video decode) | Use `.webm` or `.mp4` codec; keep file <5MB. Mute for autoplay. Fallback to static image on mobile. |
| **Animated SVG pattern** | SVG `<pattern>` + animated `<g>` or `<animate>` | Medium | SVG | GPU | Repeat pattern tile; animate child offset or opacity for drift effect. Seamless repeat for infinite loop. |
| **Gradient mesh drift** | SVG radial gradients with animated cx/cy/r or Canvas mesh | Medium | SVG or Canvas | GPU/Canvas | Animate gradient focal point. Canvas mesh: more complex but smoother for organic flows. |
| **Noise field (Perlin walk)** | Canvas + feTurbulence-inspired algorithm or shader | Advanced | Canvas or WebGL | Canvas/WebGL | Simulate organic noise animation via canvas pixel drawing. Expensive; use canvas offscreen layer. |
| **Floating elements parallax** | GSAP tween on y-position with `yoyo: true` infinite | Easy | GSAP | GPU | Gentle up-down float via `y: "-=20px"` oscillation. Vary speed per element for depth. |
| **Morphing blob animation** | SVG blob paths + MorphSVG looped timeline | Medium | GSAP MorphSVG | GPU | Keyframe morphs between 3–4 blob shapes. Timeline: `gsap.timeline({repeat: -1, yoyo: true})`. |

### Code Sketch: Floating Animation Loop
```javascript
gsap.to(".floating-elem", {
  y: -20,
  duration: 3,
  ease: "sine.inOut",
  repeat: -1,
  yoyo: true
});
```

---

## 12. INTERACTIVE & DRAGGABLE ELEMENTS

| Motion Element | Web Technique | Difficulty | Required Tools | Performance | Notes |
|---|---|---|---|---|---|
| **Drag-to-scroll carousel** | GSAP Draggable plugin with `type: "x"` | Easy | GSAP Draggable | GPU | Simple drag handler; set `bounds` to limit. Pairs with InertiaPlugin for physics-based fling. |
| **Draggable with inertia/throw** | GSAP Draggable + InertiaPlugin | Medium | GSAP Draggable + Inertia | GPU | Momentum-based deceleration on release. Feels native. Use `snap` to lock to grid points. |
| **Hover parallax tilt (3D)** | Mouse listener + GSAP rotationX/Y tweens based on mouse position | Medium | GSAP + JS | GPU | Tilt container based on mouse delta; transform-origin affects pivot. Watch for jank; use throttled listener. |
| **Click-to-expand card** | GSAP Flip + scale + z-index layering | Medium | GSAP Flip | GPU | Flip captures expanded state; scale/position animate smoothly. Overlay click-outside to close. |
| **Draggable filtered/snapped grid** | GSAP Draggable with `snap` callback returning nearest grid coord | Advanced | GSAP Draggable | GPU | Drag item, snap to grid via callback. Use CSS Grid positions as snap points. |
| **Physics-based throw (with gravity simulation)** | GSAP InertiaPlugin with custom `onMove` callback | Advanced | GSAP Draggable + Inertia | GPU | Simulate gravity/bounce via InertiaPlugin easing curves. Advanced: use RapierJS for complex phys. |

### Code Sketch: Draggable with Inertia
```javascript
gsap.registerPlugin(Draggable);
Draggable.create(".carousel", {
  type: "x",
  edgeResistance: 0.65,
  inertia: true,
  snap: { x: 300 }, // snap to 300px increments
  bounds: { minX: -1500, maxX: 0 }
});
```

---

## PERFORMANCE REFERENCE TABLE

| Technique | GPU Accelerated | CPU Load | Typical FPS (60fps target) | Notes |
|---|---|---|---|---|
| CSS transforms (translate, scale, rotate) | ✓ Yes | Minimal | 60 | Best-in-class perf. Use for all animations. |
| GSAP tweens on CSS properties | ✓ Yes | Minimal | 60 | Fast; GPU-accelerated. No layout thrashing. |
| SVG attribute animation (fill, opacity, d) | ✓ Yes | Low | 60 | Good; use DrawSVG/MorphSVG for paths. |
| SVG filters (feTurbulence, feDisplacementMap) | Partial | Medium | 30–60 | Expensive for large areas. Limit to hero sections. Use numOctaves ≤ 3. |
| CSS backdrop-filter | ✓ Yes | Low | 60 | Blur performance varies by browser. Test on mobile. |
| Canvas API (rasterization) | Partial | High | 30–60 | CPU-bound. Prerender to offscreen canvas for perf. |
| WebGL / Three.js | ✓ Yes (GPU-native) | Low | 60–120 | Best for high-poly 3D. Use instancing for many objects. |
| Draggable (GSAP) | ✓ Yes | Low | 60 | Touch-optimized; inertia adds minimal cost. |
| SplitText (GSAP) | ✓ Yes (animates splits) | Low | 60 | Fast if stagger is < 200 chars. Watch for paint on mask-based reveals. |
| Flip (GSAP) | ✓ Yes | Low | 60 | Efficient layout transitions. No layout recalc thrash if DOM stable. |

---

## DEVICE MOCKUP RESOURCES

**Open-Source Libraries:**
- **Flowbite Device Mockups** (Tailwind CSS): Responsive device frames with iOS/Android variants.
- **CSS Device Mockups** (GitHub: callmenick/CSS-Device-Mockups): Pure CSS; bezel pseudo-elements.
- **HTML5 Device Frame** (GitHub: raydian/html5-device-frame): CSS frames; HTML generator for customization.
- **Mockup Device Frames** (GitHub: jamesjingyi/mockup-device-frames): SVG-based laptop/phone frames.

---

## GRAIN/TEXTURE CODE RECIPES

### SVG feTurbulence Grain (Seamless, Animated)
```html
<svg width="100%" height="100%" style="position:fixed; top:0; left:0; pointer-events:none; mix-blend-mode:overlay">
  <defs>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" seed="1"/>
      <feColorMatrix in="noise" type="saturate" values="0"/>
      <feBlend in="SourceGraphic" in2="noise" mode="overlay"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" filter="url(#noise)" opacity="0.06"/>
</svg>
```

Animate seed:
```javascript
gsap.to("#noise feTurbulence", {
  attr: { seed: 100 },
  duration: 10,
  repeat: -1,
  ease: "none"
});
```

### Film Grain Overlay (CSS Blend Mode)
```css
.grain-overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background-image: url('data:image/svg+xml...'); /* inline SVG noise */
  mix-blend-mode: overlay;
  pointer-events: none;
  opacity: 0.05;
}
```

---

## CAMERA SYSTEM: DOM INVERSE TRANSFORM PATTERN

For 2.5D scenes with multiple parallax layers, use a "camera as inverse transform" rig:

```javascript
// World container (inverse camera)
const world = document.querySelector(".world");

gsap.to(world, {
  x: -cameraX,
  y: -cameraY,
  z: -cameraZ, // depth for lens
  scale: 1 - cameraZoom * 0.01,
  duration: 1
});

// Child layers inherit perspective
// Set individual translateZ for parallax
```

This pattern avoids nested perspective issues and allows smooth camera keyframe sequences.

---

## KEY LEARNINGS FOR PREMIUM CASE STUDIES (2026)

1. **GSAP is now 100% free** (including MorphSVG, DrawSVG, SplitText, Flip). This is *the* standard for professional web animation.
2. **CSS 3D transforms + GPU acceleration** are reliable on all major browsers. Use perspective + preserve-3d for depth; avoid expensive clip-path + backdrop-filter combo (browser bug).
3. **ScrollTrigger is essential** for scroll-driven reveals; scrub, pin, and snap are the three patterns underlying most case study effects.
4. **SVG filters (feTurbulence, feDisplacementMap)** are GPU-accelerated but expensive. Limit numOctaves ≤ 3 and apply only to visible regions.
5. **WebGL/Three.js** only if you need true 3D geometry or very high object count (10K+ particles). DOM + CSS scales to ~1000 animated elements before perf degrades.
6. **Draggable + Inertia** makes interactive galleries feel native. Always enable for touch.
7. **Aspect-ratio CSS property** is now standard; use it for responsive media framing without layout shift.
8. **Device mockup + parallax inside frame** is a signature technique for premium portfolios (iPhone scrolling inside a static bezel).
9. **Kinetic type (SplitText + stagger)** is cheap (GPU) and high-impact. Pair with duotone filters for cinematic titles.
10. **Scripted UI walkthroughs** (animated cursor + element highlights + Draggable simulations) are lighter than video screencaps and fully responsive.

---

## RECOMMENDED SETUP STACK

For a production premium case study site:

```javascript
// GSAP core + plugins (100% free as of 2025-2026)
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import { Draggable } from "gsap/Draggable";
import { SplitText } from "gsap/SplitText";
import { DrawSVG } from "gsap/DrawSVG";
import { MorphSVG } from "gsap/MorphSVG";
import { MotionPath } from "gsap/MotionPath";

gsap.registerPlugin(ScrollTrigger, Flip, Draggable, SplitText, DrawSVG, MorphSVG, MotionPath);

// CSS: Tailwind for layout, custom for 3D transforms
// SVG: Inline for grain/filters, external for device frames
// Optional WebGL: Three.js if needed for hero 3D (low-poly products)
```

**Total bundle size**: ~60 KB gzipped (GSAP core + all plugins free).
**Performance**: 60fps on mid-range devices with 100+ simultaneous tweens.

---

## SOURCES

- [GSAP Official Docs & Plugins](https://gsap.com/)
- [The Best Motion Design Agencies 2026](https://www.awesomic.com/blog/motion-design-agencies)
- [10 Websites with Great Animation 2026](https://schoolofmotion.com/blog/websites-with-great-animation-2026)
- [SVG Filter Effects: feTurbulence](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/)
- [CSS 3D Transforms Guide](https://www.carmenansio.com/articles/3d-css-guide/)
- [Animating Responsive Grid Layouts with GSAP Flip](https://tympanus.net/codrops/2026/01/20/animating-responsive-grid-layout-transitions-with-gsap-flip/)
- [Three.js Best Practices 2026](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [SVG Displacement Filtering Deep Dive](https://www.smashingmagazine.com/2021/09/deep-dive-wonderful-world-svg-displacement-filtering/)
- [GSAP ScrollTrigger: Pin, Scrub & Parallax](https://www.hontran.dev/blog/gsap-scrolltrigger-tutorial-pin-scrub-parallax)
- [SplitText Plugin](https://gsap.com/docs/v3/Plugins/SplitText/)
- [Draggable & Inertia Physics](https://gsap.com/docs/v3/Plugins/Draggable/)
- [CSS Aspect Ratio Guide](https://csstoolkit.net/blog/css-aspect-ratio-guide/)
- [WebGL vs DOM Performance](https://blog.teamtreehouse.com/3d-in-the-browser-webgl-versus-css-3d-transforms)
