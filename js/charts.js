// Pure-SVG charts: radar, line, heatmap.
import { rankFor } from './stats.js';

export function drawRadar(svg, stats, statPageLink) {
  const cx = 160, cy = 150, R = 90, n = stats.length, step = 360 / n;
  const polar = (r, deg) => {
    const a = (Math.PI / 180) * (deg - 90);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  let grid = '', axis = '', dataPts = [], labels = '';
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const pts = [];
    for (let i = 0; i < n; i++) { const [x, y] = polar(R * f, i * step); pts.push(x + ',' + y); }
    grid += `<polygon points="${pts.join(' ')}" class="grid-ring"/>`;
  });
  stats.forEach((s, i) => {
    const [ax, ay] = polar(R, i * step);
    axis += `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" class="axis-line"/>`;
    const clamped = Math.max(0, Math.min(100, s.value));
    const [dx, dy] = polar(R * (clamped / 100), i * step);
    dataPts.push(dx + ',' + dy);
    const [lx, ly] = polar(R + 32, i * step);
    let anchor = 'middle';
    if (lx < cx - 8) anchor = 'end';
    else if (lx > cx + 8) anchor = 'start';
    const rank = rankFor(clamped).toLowerCase();
    const link = statPageLink[s.axis];
    const cls = link ? 'axis-label clickable' : 'axis-label';
    const click = link ? ` data-link="${link}"` : '';
    labels += `<text x="${lx}" y="${ly - 6}" text-anchor="${anchor}" class="${cls}"${click}>${s.axis}</text>` +
              `<text x="${lx}" y="${ly + 8}" text-anchor="${anchor}" class="axis-value">${clamped}</text>` +
              `<text x="${lx}" y="${ly + 20}" text-anchor="${anchor}" class="axis-rank ${rank}">${rankFor(clamped)}</text>`;
  });
  svg.innerHTML = grid + axis + `<polygon points="${dataPts.join(' ')}" class="data-poly"/>` + labels;
  svg.querySelectorAll('[data-link]').forEach(el => {
    el.addEventListener('click', () => window.dispatchEvent(new CustomEvent('nav', { detail: el.dataset.link })));
  });
}

export function drawLine(svg, pts, suffix, decimals) {
  const max = Math.max(1, ...pts.map(p => p.v));
  const W = 440, H = 170, padL = 8, padR = 40, padT = 16, padB = 20;
  const stepX = (W - padL - padR) / (pts.length - 1);
  const scaleY = v => H - padB - (v / max) * (H - padT - padB);
  const coords = pts.map((p, i) => [padL + i * stepX, scaleY(p.v)]);
  const line = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ');
  const area = line + ` L${coords[coords.length - 1][0].toFixed(1)},${H - padB} L${coords[0][0].toFixed(1)},${H - padB} Z`;
  const dots = coords.map((c, i) => i === coords.length - 1
    ? `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="5" class="run-dot last"/>`
    : `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="2.6" class="run-dot"/>`).join('');
  const grid = [0, 0.5, 1].map(f => {
    const y = H - padB - f * (H - padT - padB);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="run-grid"/>` +
           `<text x="${W - padR + 4}" y="${(y + 3).toFixed(1)}" class="run-axis">${(max * f).toFixed(decimals)}${suffix}</text>`;
  }).join('');
  const xLabels = `<text x="${coords[0][0]}" y="${H - 4}" class="run-axis">${pts[0].label}</text>` +
    `<text x="${coords[coords.length - 1][0]}" y="${H - 4}" text-anchor="end" class="run-axis">${pts[pts.length - 1].label}</text>`;
  const last = coords[coords.length - 1];
  svg.innerHTML = grid + `<path d="${area}" class="run-area"/><path d="${line}" class="run-line"/>` + dots + xLabels +
    `<text x="${last[0]}" y="${(last[1] - 12).toFixed(1)}" text-anchor="middle" class="run-callout">${pts[pts.length - 1].v}${suffix}</text>`;
}

export function drawHeatmap(wrap, year, runHistory) {
  const total = ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
  const jan1 = new Date(year, 0, 1);
  const today = new Date();
  const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  let cells = '';
  for (let i = 0; i < total; i++) {
    const d = new Date(jan1); d.setDate(d.getDate() + i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let cls = 'yh-cell';
    if (key > todayKey) cls += ' future';
    else if ((runHistory[key] || 0) > 0) cls += ' ran';
    else cls += ' missed';
    cells += `<div class="${cls}" title="${key}"></div>`;
  }
  wrap.innerHTML = cells;
}