# Text/Title Motion-Graphics Animation Presets: Production Sources Report

**Research Date:** August 2026  
**Objective:** Identify production-quality, reusable CSS/web animation code for text motion-graphics preset library  
**Ranking Criteria:** License openness, preset count, code extractability (pure CSS/WAAPI), production readiness

---

## TIER 1: PREMIUM PRESET LIBRARIES (Pure CSS, MIT, Text-Focused)

### 1. **@vysmo/text**
- **URL:** https://github.com/vysmodev/vysmo | https://vysmo.com/text
- **License:** MIT
- **Presets:** 243 text animation presets (229 generated + 14 curated)
- **Format:** ES modules, tree-shakable, zero-dependency
- **Code Format:** Pure CSS keyframes, grapheme-safe text splitting
- **Bundle Size:** ~3 KB gzipped
- **Quality/Reusability:** ⭐⭐⭐⭐⭐ HIGHEST. Exactly what a preset library needs—massive preset count, tiny gzipped, modular import. Each preset is an independent export. Web-accessible catalog at vysmo.com/text for visual browsing.
- **Production Ready:** Yes
- **Notes:** Most aligned with stated goal. Includes entrance, exit, and emphasis effects. React companion (@vysmo/text-react) available.

### 2. **Animate.css**
- **URL:** https://github.com/animate-css/animate.css | https://animate.style/
- **License:** Hippocratic License 2.1
- **Presets:** 70+ animations (entrances, exits, attention-seekers, flippers, rotators, zooming, sliding)
- **Format:** Pure CSS keyframes (@keyframes) in .css files
- **Code Format:** Pure CSS—no JavaScript, no WAAPI (legacy approach, CSS-native)
- **Versions:** Standard, minified, compat
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. Easiest to extract presets (copy-paste keyframes). Well-documented. Industry standard. Accessibility-aware (prefers-reduced-motion support).
- **Production Ready:** Yes (11k+ GitHub stars)
- **Limitation:** Hippocratic License (not permissive MIT, but open for most use cases)

### 3. **Animista**
- **URL:** https://animista.net/ | https://www.uwarp.design/animista
- **License:** Not explicitly stated (appears proprietary/commercial)
- **Presets:** 100+ animations in categories (Basic, Entrances, Exits, Text, Attention, Background)
- **Format:** On-demand CSS generator; custom animation builder
- **Code Format:** Pure CSS keyframes, generated on-demand
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. Text-specific category. Visual editor for customization. Export standard or minified CSS. No dependencies.
- **Production Ready:** Yes
- **Limitation:** License unclear; primarily web-based tool (not a reusable library repo)
- **Notes:** Best for interactive browsing/customization; less suitable for direct repo integration

### 4. **Vivify**
- **URL:** https://github.com/Martz90/vivify | https://www.hongkiat.com/blog/vivify-animation-library/
- **License:** MIT
- **Presets:** 50+ animations (fade, flip, zoom, bounce, slide variants)
- **Format:** Pure CSS keyframes, class-based application
- **Code Format:** Pure CSS
- **Composability:** Supports delay/duration modifiers (delay-{ms}, duration-{ms})
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. MIT clean. Easy copy-paste presets. ~1.7k GitHub stars.
- **Production Ready:** Yes
- **Notes:** Great for entrance/exit effects; not text-specific but highly extractable

### 5. **Motion One (motion.dev)**
- **URL:** https://github.com/motiondivision/motionone | https://motion.dev/
- **License:** MIT
- **Presets:** No fixed preset count (WAAPI-based; generators like spring/glide)
- **Format:** Web Animations API (WAAPI) with polyfill; modular packages (@motionone/dom, @motionone/animation, @motionone/easing, @motionone/generators)
- **Code Format:** WAAPI + JavaScript (not pure CSS keyframes)
- **Bundle Size:** 3.8 KB
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. Modern, performant WAAPI-first approach. Tree-shakable. Works without main thread. Excellent for high-performance UIs.
- **Production Ready:** Yes
- **Limitation:** Requires JavaScript for animation control (less "copy-paste preset" friendly than pure CSS)
- **Notes:** Best for programmatic animation composition, not static preset export

### 6. **AnimXYZ**
- **URL:** https://github.com/ingram-projects/animxyz | https://animxyz.com/
- **License:** MIT
- **Presets:** Unlimited (CSS variables allow near-infinite combinations)
- **Format:** CSS variables (custom properties) with utility-class composition
- **Code Format:** Pure CSS variables + SCSS
- **Composability:** Composable via `xyz-in`, `xyz-out`, `xyz="fade up big"` attributes
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. MIT licensed. Highly composable. Vue, React, SCSS, and CSS support.
- **Production Ready:** Yes
- **Limitation:** CSS-variable approach requires more setup than straight @keyframes
- **Notes:** Excellent for component libraries (React, Vue); less suitable for static CSS preset export

---

## TIER 2: FOCUSED TEXT ANIMATION TOOLS (MIT, Partial Pure CSS)

### 7. **Splitting.js**
- **URL:** https://github.com/shshaw/Splitting | https://splitting.js.org/
- **License:** MIT
- **Presets:** N/A (utility for text splitting, not animation presets)
- **Format:** JavaScript utility; populates elements with CSS variables and data attributes
- **Code Format:** Pure JavaScript + CSS (requires JS for splitting, CSS for animation)
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. Perfect companion for text animations. Splits by words, characters, lines. Enables per-character animation.
- **Production Ready:** Yes
- **Notes:** Essential infrastructure for character-by-character animations; pair with Animate.css or custom keyframes

### 8. **SplitType**
- **URL:** https://github.com/lukePeavey/SplitType | https://www.npmjs.com/package/split-type
- **License:** (Not explicitly stated in results; appears open source)
- **Presets:** N/A (text splitting utility like Splitting.js)
- **Format:** JavaScript utility for lines, words, characters
- **Code Format:** Pure JavaScript
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. GSAP SplitText alternative. Works with any animation library. Inspired by industry-standard tools.
- **Production Ready:** Yes
- **Notes:** Lightweight alternative to GSAP's SplitText; excellent for extracting characters for independent animation

### 9. **Tobias Ahlin: Moving Letters**
- **URL:** https://github.com/tobiasahlin/moving-letters | https://tobiasahlin.com/moving-letters/
- **License:** MIT
- **Presets:** 16 curated text effects (entrance/exit/emphasis)
- **Format:** HTML/CSS/JavaScript using Anime.js animation engine
- **Code Format:** Pure CSS keyframes + JavaScript (Anime.js dependency)
- **Extractability:** High—clean code examples with copy-paste HTML/CSS/JS
- **Quality/Reusability:** ⭐⭐⭐⭐⭐ EXCELLENT. Portfolio-quality effects. MIT license. Each effect documented with runnable demos.
- **Production Ready:** Yes
- **Notes:** Best for design inspiration and proven effect patterns. ~2.4k GitHub stars. Professional quality suitable for commercial work.

### 10. **CSShake**
- **URL:** https://github.com/elrumordelaluz/csshake | https://elrumordelaluz.github.io/csshake/
- **License:** MIT
- **Presets:** 15+ shake animation variants (horizontal, vertical, diagonal, rotation, intensity levels)
- **Format:** Pure CSS keyframes
- **Code Format:** Pure CSS (zero JavaScript)
- **Bundle Size:** ~3 KB gzipped
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. MIT licensed. Lightweight. Perfect subset of animations. Class-based application.
- **Production Ready:** Yes
- **Limitation:** Specialty library (shake effects only)
- **Notes:** Great for emphasis effects; considered in top CSS animation libraries 2026

### 11. **Magic.css (miniMAC)**
- **URL:** https://github.com/miniMAC/magic | https://www.npmjs.com/package/magic.css
- **License:** Not explicitly stated (appears open source)
- **Presets:** 55+ animations (bounce, fade, flip, zoom variants)
- **Format:** Pure CSS keyframes
- **Code Format:** Pure CSS (@keyframes)
- **Bundle Size:** ~3.1 KB gzipped
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Solid preset count. JavaScript-friendly class application (classList.add('magictime', 'puffIn')).
- **Production Ready:** Yes
- **Notes:** Compact alternative to Animate.css; good for lightweight deployments

### 12. **TextillateJS**
- **URL:** https://github.com/jschr/textillate | https://textillate.js.org/
- **License:** MIT
- **Presets:** Unlimited (uses Animate.css + Lettering.js for composition)
- **Format:** jQuery plugin composing Animate.css + Lettering.js
- **Code Format:** Pure CSS (via dependency) + jQuery
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. MIT licensed. Clean API for text animation composition.
- **Production Ready:** Yes
- **Limitation:** jQuery dependency (dated architecture)
- **Notes:** Historical reference; not recommended for new projects (jQuery overhead) but useful pattern reference

---

## TIER 3: ANIMATION FOUNDATIONAL LIBRARIES (MIT, Multi-Purpose)

### 13. **Framer Motion / Motion (motion/react)**
- **URL:** https://github.com/framer/motion | https://motion.dev/
- **License:** MIT
- **Presets:** 430+ copy-paste examples (scroll effects, gestures, carousels, typewriter animations)
- **Format:** React animation library; TypeScript-first
- **Code Format:** JavaScript (React components)
- **Quality/Reusability:** ⭐⭐⭐⭐ HIGH. MIT. Massive example collection. Production-grade performance.
- **Production Ready:** Yes (formerly Framer Motion, now Motion)
- **Limitation:** React-only; not suitable for vanilla CSS preset extraction
- **Notes:** Best for React projects; minimal value for pure CSS preset library

### 14. **AOS (Animate On Scroll)**
- **URL:** https://github.com/michalsnik/aos | https://www.npmjs.com/package/aos
- **License:** MIT
- **Presets:** Fade, flip, and other scroll-triggered effects
- **Format:** JavaScript scroll-trigger library using data-aos attributes
- **Code Format:** JavaScript + CSS
- **Quality/Reusability:** ⭐⭐⭐ GOOD. MIT licensed. Popular (scroll-animation use case).
- **Production Ready:** Yes
- **Limitation:** Scroll-triggered focus (not general-purpose presets); JavaScript-dependent
- **Notes:** Complementary to preset libraries; adds trigger mechanism

### 15. **Tween.js / Popmotion**
- **URL:** https://github.com/tweenjs/tween.js | https://github.com/Popmotion/popmotion
- **License:** MIT (both)
- **Presets:** N/A (animation engines, not preset libraries)
- **Format:** JavaScript animation engines with easing curves
- **Code Format:** JavaScript (low-level animation)
- **Quality/Reusability:** ⭐⭐⭐ GOOD. MIT. Robert Penner easing equations.
- **Production Ready:** Yes
- **Limitation:** Foundational APIs; not preset-focused
- **Notes:** Build blocks for custom animation systems; minimal preset value

---

## TIER 4: TOOL-BASED & VISUAL EDITORS (Limited Code Extractability)

### 16. **Keyframes.app**
- **URL:** https://github.com/mitchas/Keyframes.app
- **License:** Open source (free)
- **Presets:** Includes preset animations
- **Format:** Visual CSS animation editor (web-based + Chrome extension)
- **Code Format:** Pure CSS keyframes (output)
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Visual designer-friendly; generates clean CSS.
- **Production Ready:** Yes
- **Limitation:** Tool-based (not reusable library code); primary value is in UI editor
- **Notes:** Useful for animation generation workflow; less useful for preset library seeding

### 17. **SVGator**
- **URL:** https://www.svgator.com/ (no open-source GitHub repo)
- **License:** Commercial SaaS tool
- **Presets:** 140+ SVG animation examples
- **Format:** Visual animation editor; SVG-focused
- **Code Format:** Exports pure CSS, JavaScript, Lottie JSON
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Production quality. Text animations supported.
- **Production Ready:** Yes
- **Limitation:** SaaS tool (not extractable library); commercial license
- **Notes:** Best for SVG text animations; less suitable for pure CSS preset extraction

### 18. **transition.style / transition.css**
- **URL:** https://github.com/argyleink/transition.css | https://github.com/loadingio/transition.css
- **License:** Open source (license not explicitly stated)
- **Presets:** 46+ transitions (composition-based)
- **Format:** Pure CSS transitions
- **Code Format:** Pure CSS
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Lightweight. Attribute-based composition.
- **Production Ready:** Yes
- **Notes:** Transition-focused (not full animations); complementary to keyframe libraries

### 19. **Hover.css**
- **URL:** https://github.com/IanLunn/Hover | https://ianlunn.github.io/Hover/
- **License:** MIT (for open source), Commercial (for commercial use since v2.2.0)
- **Presets:** 100+ hover effects
- **Format:** Pure CSS (hover state focused)
- **Code Format:** Pure CSS available in CSS, Sass, LESS
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Wide preset count. Licensed complexity.
- **Production Ready:** Yes
- **Limitation:** Hover-specific (not general entrance/exit); commercial licensing since v2.2.0
- **Notes:** Good for interactive UI effects; less suitable for motion-graphics presets

---

## TIER 5: SPECIALIZED & 3D (Limited Text Animation)

### 20. **Theatre.js**
- **URL:** https://github.com/theatre-js/theatre | https://www.theatrejs.com/
- **License:** Apache 2.0 (core @theatre/core), AGPL 3.0 (studio @theatre/studio)
- **Presets:** Not preset-focused; visual motion editor
- **Format:** Motion design editor + JavaScript animation library
- **Code Format:** JavaScript (programmatic) + visual timeline
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Production-grade. Limited text animation specific presets.
- **Production Ready:** Yes
- **Limitation:** Complex setup; visual tool-focused; no built-in text presets
- **Notes:** Best for cinematic animations and complex multi-element compositions; overkill for text presets

### 21. **Three.js Text Animation**
- **URL:** https://github.com/gsn1074-webgl-examples/webgl-text-animation | https://threejs.org/ (official)
- **License:** MIT (Three.js)
- **Presets:** N/A (3D engine, not preset library)
- **Format:** WebGL 3D text animations (custom shaders possible)
- **Code Format:** JavaScript + WebGL
- **Quality/Reusability:** ⭐⭐ FAIR. Overkill for 2D text presets. Learning curve high.
- **Production Ready:** Yes (for 3D; not for simple text presets)
- **Limitation:** 3D-focused; not suitable for 2D title animations
- **Notes:** Only relevant for 3D morphing text effects

### 22. **Lottie**
- **URL:** https://airbnb.io/lottie/ (Airbnb library)
- **License:** Apache 2.0
- **Presets:** Unlimited (After Effects → JSON export)
- **Format:** JSON animation format (After Effects native)
- **Code Format:** JSON (requires Lottie player JavaScript library)
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Professional animation workflow (AE-to-web). Text animations supported.
- **Production Ready:** Yes
- **Limitation:** Requires motion design authoring (After Effects); not extractable CSS; JSON-based
- **Notes:** Best for professional motion designers; not suitable for CSS preset library

---

## TIER 6: CSS-IN-JS FRAMEWORKS (Utility-Based)

### 23. **Tailwind CSS Animation Plugins**
- **Name:** tailwindcss-motion, Tailwind Animations (79+ utilities)
- **URL:** https://github.com/romboHQ/tailwindcss-motion | https://tailwind-animations.com/
- **License:** MIT (typical)
- **Presets:** 79+ animation utility classes
- **Format:** Tailwind CSS plugin (utility class-based)
- **Code Format:** Pure CSS (@keyframes output)
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Modern utility-first approach. Composable.
- **Production Ready:** Yes
- **Limitation:** Tailwind dependency; less suitable for standalone preset extraction
- **Notes:** Best for Tailwind projects; requires Tailwind setup

---

## TIER 7: CURATED COLLECTIONS & TUTORIALS (Not Libraries)

### 24. **Codrops Typography & Animation Articles**
- **URL:** https://tympanus.net/codrops/tag/typography/ | Various articles
- **License:** Educational (CC-by-SA typically)
- **Format:** Tutorial code + runnable examples
- **Quality/Reusability:** ⭐⭐⭐ GOOD. High-quality educational content. Copy-paste friendly code.
- **Production Ready:** Examples yes, but not integrated library
- **Notes:** Excellent reference material; manually extract patterns

### 25. **GitHub Trending CSS Animation Repos**
- Examples: PureCSS-Animations, CSS Glitch Text Effect, various gists
- **Quality/Reusability:** ⭐⭐ FAIR. Highly variable quality. Single-effect focus.
- **Notes:** Useful for specific effects; not systematic preset library

---

## TIER 8: COMMERCIAL/RESTRICTED LICENSES (Limited Reusability)

### 26. **GSAP (Green Sock Animation Platform)**
- **URL:** https://gsap.com/ | https://github.com/greensock/GSAP
- **License:** Free (2025+, no cost for commercial use; historically restricted)
- **Presets:** SplitText plugin + extensive examples library
- **Format:** JavaScript animation library (feature-rich)
- **Code Format:** JavaScript
- **Quality/Reusability:** ⭐⭐⭐ GOOD. Industry-standard. Excellent text animation (SplitText plugin).
- **Production Ready:** Yes
- **Limitation:** Redistribution restrictions (cannot resell code/templates); cannot build competing visual tools
- **Notes:** Good for commercial projects; not suitable as basis for reusable preset library (licensing blocks redistribution)

---

## SUMMARY RANKING FOR TEXT MOTION-GRAPHICS PRESET LIBRARY

### ✅ BEST SOURCES FOR LIBRARY SEEDING (Top 5):

1. **@vysmo/text** (243 presets, 3KB, MIT, pure CSS)
2. **Animate.css** (70+ presets, pure CSS, Hippocratic License, industry standard)
3. **Splitting.js** + **Motion One** (infrastructure + WAAPI presets)
4. **Tobias Ahlin Moving Letters** (16 curated examples, MIT, portfolio quality)
5. **Vivify** (50+ presets, MIT, pure CSS)

### ⚠️ STRONG SECONDARY SOURCES (Complementary value):

- **Animista** (visual generator, 100+ effects, on-demand customization)
- **AnimXYZ** (CSS variables, MIT, composability)
- **SplitType** (text splitting, pairs with animations)
- **CSShake** (15+ shake effects, MIT, lightweight)

### ❌ AVOID FOR PRESET LIBRARY (Unless specialized use):

- **GSAP** (redistribution restrictions)
- **Theatre.js** (overkill, visual editor-focused)
- **Three.js** (3D-focused, not suitable for 2D text presets)
- **Lottie** (JSON format, requires motion designer)
- **Tailwind plugins** (framework-dependent)

---

## RECOMMENDATIONS FOR LIBRARY ARCHITECTURE

### Recommended Foundation Stack:
1. **Base Presets:** @vysmo/text (243 presets) + Animate.css (70+ presets)
2. **Text Splitting:** Splitting.js or SplitType
3. **WAAPI Alternative:** Motion One for modern browser support
4. **CSS Variables:** AnimXYZ for composable animations
5. **Specialty Effects:** CSShake (emphasis), Magic.css (variety)

### License Profile:
- **Ideal:** MIT (100% permissive)
- **Acceptable:** Hippocratic License 2.1 (ethical clause, still open)
- **Avoid:** AGPL, commercial restrictions, redistribution limits

### Code Extraction Strategy:
1. Pure CSS @keyframes files → direct copy into preset bank
2. CSS variables (AnimXYZ) → convert to standard @keyframes if needed
3. WAAPI (Motion One) → document as JS alternative
4. Text splitting + animation combos (Splitting.js + Animate.css) → template patterns

---

## KEY METRICS COMPARISON TABLE

| Source | Presets | License | Format | Bundle | Text-Specific | GitHub Stars | Quality |
|--------|---------|---------|--------|--------|---------------|--------------|---------|
| @vysmo/text | 243 | MIT | Pure CSS | 3KB | Yes | ? | ⭐⭐⭐⭐⭐ |
| Animate.css | 70+ | Hippocratic | Pure CSS | ~40KB | No | 11k+ | ⭐⭐⭐⭐ |
| Vivify | 50+ | MIT | Pure CSS | ? | No | 1.7k+ | ⭐⭐⭐⭐ |
| Magic.css | 55+ | ? | Pure CSS | 3.1KB | No | ? | ⭐⭐⭐ |
| Moving Letters | 16 | MIT | CSS+JS | ~10KB | Yes | 2.4k+ | ⭐⭐⭐⭐⭐ |
| Motion One | N/A | MIT | WAAPI | 3.8KB | No | ? | ⭐⭐⭐⭐ |
| AnimXYZ | ∞* | MIT | CSS vars | ? | No | ? | ⭐⭐⭐⭐ |
| CSShake | 15+ | MIT | Pure CSS | 3KB | No | 2k+ | ⭐⭐⭐⭐ |
| Splitting.js | N/A | MIT | JS util | ? | Util | 2k+ | ⭐⭐⭐⭐ |

*Unlimited via variable composition

---

**END REPORT**
