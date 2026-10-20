// SVG charts for the workbench. Display only: values arrive already computed
// by the engine; these functions place them on screen and put the exact value,
// or the refusal behind a missing one, in each mark's tooltip.

export const PALETTE = ['#3b6fd8', '#e0861a', '#2a9d6f', '#c2417a', '#7a5bd1', '#1c94b0', '#8a9b2a', '#c4482f'];
export const colourFor = (i) => PALETTE[i % PALETTE.length];

const W = 560;
let uid = 0;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A round upper limit for an axis. */
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function axisLabel(v) {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v * 100) / 100);
}

function frame(steps, max, H, L, R, T, B) {
  const x = (t) => (steps <= 1 ? L + (W - L - R) / 2 : L + (t * (W - L - R)) / (steps - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let g = '';
  for (const f of [0, 0.5, 1]) {
    const yy = y(max * f);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/>`;
    g += `<text x="${L - 6}" y="${yy + 4}" text-anchor="end" class="tick">${axisLabel(max * f)}</text>`;
  }
  return { x, y, g };
}

/**
 * Lines over steps. series: [{ name, colour, dashed?, values: (number|null)[],
 * titles: string[], refused?: boolean[] }]. A refused value is a gap in its
 * line, marked with a cross on the axis.
 */
export function lineChart({ steps, series, height = 190, yMax, label = '' }) {
  const H = height, L = 46, R = 12, T = 12, B = 24;
  const finite = series.flatMap((s) => s.values.filter((v) => v !== null && Number.isFinite(v)));
  const max = yMax ?? niceMax(Math.max(0, ...finite));
  const { x, y, g } = frame(steps, max, H, L, R, T, B);
  let svg = g;
  for (let t = 0; t < steps; t++) svg += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle" class="tick">${t}</text>`;
  for (const s of series) {
    let d = '';
    let pen = false;
    s.values.forEach((v, t) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    if (d) svg += `<path d="${d}" fill="none" stroke="${s.colour}" stroke-width="2"${s.dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
    s.values.forEach((v, t) => {
      const title = `<title>${esc(`${s.name}, step ${t}: ${s.titles[t] ?? ''}`)}</title>`;
      if (v === null || !Number.isFinite(v)) {
        if (s.refused?.[t]) svg += `<g class="refused-mark" transform="translate(${x(t)} ${H - B})"><path d="M-4 -4 L4 4 M-4 4 L4 -4"/>${title}</g>`;
        return;
      }
      svg += `<circle cx="${x(t).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${s.dashed ? 2.5 : 3.5}" fill="${s.colour}">${title}</circle>`;
    });
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}

/**
 * Stacked bars over steps. stacks[t] = [{ key, colour, value: number|null,
 * title, refused? }], drawn bottom up; line: [{ value: number|null, title }]
 * drawn as a dashed marker across each bar (for example the total requirement).
 */
export function stackedBars({ steps, stacks, line, height = 210, yMax, label = '' }) {
  const H = height, L = 46, R = 12, T = 12, B = 24;
  const totals = stacks.map((s) => s.reduce((a, c) => a + (c.value ?? 0), 0));
  const lineMax = (line ?? []).map((l) => l.value ?? 0);
  const max = yMax ?? niceMax(Math.max(0, ...totals, ...lineMax));
  const band = (W - L - R) / Math.max(steps, 1);
  const bw = Math.min(38, band * 0.7);
  const xc = (t) => L + band * (t + 0.5);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const { g } = frame(steps, max, H, L, R, T, B);
  const hatch = `hatch${++uid}`;
  let svg = `<defs><pattern id="${hatch}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-line"/></pattern></defs>${g}`;
  for (let t = 0; t < steps; t++) {
    svg += `<text x="${xc(t)}" y="${H - 6}" text-anchor="middle" class="tick">${t}</text>`;
    let acc = 0;
    const stack = stacks[t] ?? [];
    const refused = stack.filter((c) => c.refused);
    if (refused.length > 0 && stack.every((c) => c.refused || c.value === null)) {
      svg += `<rect x="${xc(t) - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}" fill="url(#${hatch})"><title>${esc(`step ${t}: ${refused.map((c) => c.title).join('; ')}`)}</title></rect>`;
      continue;
    }
    for (const c of stack) {
      if (c.value === null || !(c.value > 0)) continue;
      const y0 = y(acc);
      const y1 = y(acc + c.value);
      svg += `<rect x="${(xc(t) - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}" fill="${c.colour}"><title>${esc(`step ${t}, ${c.key}: ${c.title}`)}</title></rect>`;
      acc += c.value;
    }
    if (refused.length > 0) {
      svg += `<rect x="${xc(t) - bw / 2}" y="${T}" width="${bw}" height="6" fill="url(#${hatch})"><title>${esc(`step ${t}: ${refused.map((c) => `${c.key}: ${c.title}`).join('; ')}`)}</title></rect>`;
    }
    const l = line?.[t];
    if (l && l.value !== null) {
      const yy = y(l.value);
      svg += `<line x1="${xc(t) - bw / 2 - 4}" x2="${xc(t) + bw / 2 + 4}" y1="${yy}" y2="${yy}" class="marker"><title>${esc(`step ${t}: ${l.title}`)}</title></line>`;
    } else if (l && l.refusedTitle) {
      svg += `<g class="refused-mark" transform="translate(${xc(t)} ${T + 4})"><path d="M-4 -4 L4 4 M-4 4 L4 -4"/><title>${esc(`step ${t}: ${l.refusedTitle}`)}</title></g>`;
    }
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}

/** The mapped system as layers: the top first, then the parts that feed it, and so on. */
export function systemDiagram({ layers, edges, top, labels, colours }) {
  const nodeW = 128, nodeH = 40, gapX = 18, gapY = 46, padX = 12, padY = 12;
  const widest = Math.max(1, ...layers.map((l) => l.length));
  const width = Math.max(W, padX * 2 + widest * nodeW + (widest - 1) * gapX);
  const height = padY * 2 + layers.length * nodeH + (layers.length - 1) * gapY;
  const pos = new Map();
  layers.forEach((row, li) => {
    const rowW = row.length * nodeW + (row.length - 1) * gapX;
    const x0 = (width - rowW) / 2;
    row.forEach((id, i) => pos.set(id, { x: x0 + i * (nodeW + gapX), y: padY + li * (nodeH + gapY) }));
  });
  let svg = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="arrowhead"/></marker></defs>';
  for (const e of edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    svg += `<line x1="${a.x + nodeW / 2}" y1="${a.y}" x2="${b.x + nodeW / 2}" y2="${b.y + nodeH}" class="edge" marker-end="url(#arrow)"><title>${esc(`${e.from} feeds ${e.to} (rank only)`)}</title></line>`;
  }
  for (const [id, p] of pos) {
    const isTop = id === top;
    svg += `<g><rect x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" rx="6" class="node${isTop ? ' top' : ''}" style="--c:${colours.get(id) ?? '#888'}"/>`;
    svg += `<rect x="${p.x}" y="${p.y}" width="5" height="${nodeH}" rx="2" fill="${colours.get(id) ?? '#888'}"/>`;
    const full = labels.get(id) ?? id;
    const short = full.length > 18 ? `${full.slice(0, 17)}…` : full;
    svg += `<text x="${p.x + 12}" y="${p.y + 17}" class="node-title">${esc(short)}</text>`;
    svg += `<text x="${p.x + 12}" y="${p.y + 32}" class="node-sub">${esc(isTop ? `${id} · top` : id)}</text><title>${esc(labels.get(id) ?? id)}</title></g>`;
  }
  return `<svg class="diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="mapped system">${svg}</svg>`;
}
