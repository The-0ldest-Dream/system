// Procedural growth tree: SVG generated from stats + streak + level.
// Branches grow with stat values, leaves appear with streak, fruit with rank.

export function drawTree(svg, state) {
  const W = 400, H = 225;
  const statSum = state.stats.reduce((a, s) => a + s.value, 0);
  const growth = Math.min(1, statSum / 500); // 0..1
  const trunkH = 40 + growth * 90;
  const cx = W / 2, baseY = H - 20;
  const topY = baseY - trunkH;
  const branchScale = 0.4 + growth * 0.6;
  const leafCount = Math.min(60, Math.floor(state.streak * 1.5));
  const fruitCount = Math.min(9, state.rank);

  let svgContent = '';
  // glow
  svgContent += `<defs>
    <radialGradient id="treeGlow"><stop offset="0" stop-color="#00ff9c" stop-opacity=".35"/><stop offset="1" stop-color="#00ff9c" stop-opacity="0"/></radialGradient>
    <linearGradient id="trunkGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1a3a2a"/><stop offset="1" stop-color="#4a7a5a"/></linearGradient>
  </defs>`;
  svgContent += `<ellipse cx="${cx}" cy="${topY - 10}" rx="${80 * branchScale}" ry="${50 * branchScale}" fill="url(#treeGlow)"/>`;
  // trunk
  svgContent += `<path d="M${cx - 6},${baseY} Q${cx - 4},${baseY - trunkH * 0.5} ${cx - 2},${topY} L${cx + 2},${topY} Q${cx + 4},${baseY - trunkH * 0.5} ${cx + 6},${baseY} Z" fill="url(#trunkGrad)"/>`;
  // roots
  svgContent += `<path d="M${cx - 6},${baseY} Q${cx - 30},${baseY + 6} ${cx - 40},${baseY + 14} M${cx + 6},${baseY} Q${cx + 30},${baseY + 6} ${cx + 40},${baseY + 14}" stroke="#4a7a5a" stroke-width="2" fill="none"/>`;
  // branches: 5 main branches, one per stat
  const statNames = state.stats.map(s => s.axis);
  state.stats.forEach((s, i) => {
    const angle = (-90 + (i - 2) * 30) * Math.PI / 180;
    const len = (30 + s.value * 0.5) * branchScale;
    const bx = cx + Math.cos(angle) * len;
    const by = topY + Math.sin(angle) * len * 0.6;
    svgContent += `<line x1="${cx}" y1="${topY}" x2="${bx}" y2="${by}" stroke="#5a9a6a" stroke-width="${1 + s.value / 40}" stroke-linecap="round"/>`;
    // sub-branches
    for (let j = 0; j < 2; j++) {
      const a2 = angle + (j ? 0.4 : -0.4);
      const l2 = len * 0.5;
      const ex = bx + Math.cos(a2) * l2, ey = by + Math.sin(a2) * l2 * 0.6;
      svgContent += `<line x1="${bx}" y1="${by}" x2="${ex}" y2="${ey}" stroke="#5a9a6a" stroke-width="1" stroke-linecap="round"/>`;
    }
  });
  // leaves
  for (let i = 0; i < leafCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 60 * branchScale + 20;
    const lx = cx + Math.cos(a) * r;
    const ly = topY + Math.sin(a) * r * 0.6 - 10;
    const col = ['#00ff9c', '#7dffce', '#1fdc7a', '#b98cf0'][i % 4];
    svgContent += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${(1 + Math.random() * 1.5).toFixed(1)}" fill="${col}" opacity="${(0.4 + Math.random() * 0.4).toFixed(2)}"/>`;
  }
  // fruit
  for (let i = 0; i < fruitCount; i++) {
    const a = (i / fruitCount) * Math.PI * 2;
    const r = 40 * branchScale + 15;
    const fx = cx + Math.cos(a) * r;
    const fy = topY + Math.sin(a) * r * 0.6 - 8;
    svgContent += `<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="3" fill="#ffd76a" opacity="0.85" filter="drop-shadow(0 0 3px #ffd76a)"/>`;
  }
  svg.innerHTML = svgContent;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
}