// Text splitter — chars / words / lines, accessibility-safe.
// The original text stays readable to screen readers via aria-label on the layer;
// split units are aria-hidden presentation spans.

export function splitText(el, mode = 'none') {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  if (mode === 'none') {
    const unit = document.createElement('span');
    unit.className = 'mg-unit';
    unit.textContent = text;
    el.textContent = '';
    el.appendChild(unit);
    return [unit];
  }

  el.textContent = '';
  const units = [];
  const words = text.split(/(\s+)/);

  for (const word of words) {
    if (/^\s+$/.test(word)) {
      el.appendChild(document.createTextNode(word));
      continue;
    }
    if (word === '') continue;
    const wordWrap = document.createElement('span');
    wordWrap.className = 'mg-word';
    wordWrap.setAttribute('aria-hidden', 'true');
    if (mode === 'words' || mode === 'lines') {
      wordWrap.classList.add('mg-unit');
      wordWrap.textContent = word;
      units.push(wordWrap);
    } else { // chars
      for (const ch of [...word]) {
        const span = document.createElement('span');
        span.className = 'mg-unit mg-char';
        span.textContent = ch;
        wordWrap.appendChild(span);
        units.push(span);
      }
    }
    el.appendChild(wordWrap);
  }

  if (mode === 'lines') {
    // Group word units into visual lines by offsetTop after layout.
    const byTop = new Map();
    for (const u of units) {
      const top = Math.round(u.offsetTop);
      if (!byTop.has(top)) byTop.set(top, []);
      byTop.get(top).push(u);
    }
    const lineUnits = [];
    for (const [, ws] of [...byTop.entries()].sort((a, b) => a[0] - b[0])) {
      const line = document.createElement('span');
      line.className = 'mg-unit mg-line';
      line.setAttribute('aria-hidden', 'true');
      ws[0].parentNode ? el.insertBefore(line, ws[0]) : el.appendChild(line);
      for (const w of ws) { w.classList.remove('mg-unit'); line.appendChild(w); }
      lineUnits.push(line);
    }
    return lineUnits;
  }
  return units;
}

// Stagger orders — return delay index per unit position.
export function staggerDelays(count, step, order = 'start') {
  const idx = [...Array(count).keys()];
  let ranks;
  switch (order) {
    case 'end':    ranks = idx.map((i) => count - 1 - i); break;
    case 'center': ranks = idx.map((i) => Math.abs(i - (count - 1) / 2)); break;
    case 'edges':  ranks = idx.map((i) => (count - 1) / 2 - Math.abs(i - (count - 1) / 2)); break;
    case 'random': {
      ranks = [...idx];
      // Deterministic shuffle (mulberry32) so replays and export are stable.
      let s = 0x9e3779b9 ^ count;
      const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      for (let i = ranks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
      break;
    }
    default: ranks = idx; // 'start'
  }
  return ranks.map((r) => r * step);
}
