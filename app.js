// N-ought Analyst Workbench, browser side. It edits scenario values and draws
// what the engine computed; it calculates nothing itself. Values arrive as exact
// rationals (strings such as "336/5"); the screen rounds them for reading, and
// every tooltip shows the exact value, or the refusal behind a missing one.

import { colourFor, esc, lineChart, niceMax, stackedBars, systemDiagram } from './charts.js';

const state = {
  examples: [],
  bundle: null,
  baselineId: null,
  sourceId: null,
  intervention: null,
  results: { baseline: null, intervention: null },
  running: false,
};

const $ = (sel) => document.querySelector(sel);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- values

function ratio(s) {
  const t = String(s);
  const i = t.indexOf('/');
  return i < 0 ? Number(t) : Number(t.slice(0, i)) / Number(t.slice(i + 1));
}
const num = (tv) => (tv && 'v' in tv ? ratio(tv.v) : null);
const refused = (tv) => Boolean(tv && 'refused' in tv);

function fmt(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '-';
  const r = Math.round(x * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

function refusalText(trace, id) {
  const r = trace?.refusals?.find((x) => x.id === id);
  return r ? `${r.category}: ${r.message}` : id;
}

/** The exact value or the refusal, for a tooltip. */
function exact(tv, trace) {
  if (!tv) return 'not computed';
  if ('v' in tv) return `${tv.v} (${tv.t})`;
  return `refused. ${tv.refused.map((id) => refusalText(trace, id)).join(' | ')}`;
}

// ---------------------------------------------------------------- scenario series (the engine's rule: an entry holds until the next)

function expand(entries, steps) {
  const sorted = [...entries].sort((a, b) => a.step - b.step);
  const out = [];
  let cur = null;
  let k = 0;
  for (let t = 0; t < steps; t++) {
    while (k < sorted.length && sorted[k].step <= t) cur = sorted[k++].value;
    out.push(cur);
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function compress(values) {
  const out = [];
  values.forEach((v, t) => {
    if (t === 0 || !same(v, values[t - 1])) out.push({ step: t, value: v });
  });
  return out;
}

const cellText = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? '' : String(v));
const GAP = { gap: 'left blank in the workbench' };

/** Every series of a scenario, as rows the editor shows. */
function seriesOf(model, sc) {
  const rows = [];
  const unitOf = (id) => model.resources.find((r) => r.id === id)?.unit ?? '';
  for (const s of sc.inflow ?? []) rows.push({ key: `inflow|${s.resource}`, label: `Inflow: ${s.resource}`, unit: unitOf(s.resource), entries: s.entries });
  for (const s of sc.outsideInput ?? []) rows.push({ key: `outside|${s.input}`, label: `Outside input: ${s.input}`, unit: '', entries: s.entries });
  for (const s of sc.loads ?? []) {
    const decl = model.parts.find((p) => p.id === s.part)?.loads?.find((l) => l.id === s.load);
    rows.push({ key: `load|${s.part}|${s.load}`, label: `Load: ${s.part} / ${s.load}`, unit: decl?.unit ?? '', entries: s.entries });
  }
  return rows;
}

function setSeries(sc, key, entries) {
  const [kind, a, b] = key.split('|');
  const list = kind === 'inflow' ? sc.inflow : kind === 'outside' ? sc.outsideInput : sc.loads;
  const s = list.find((x) => (kind === 'inflow' ? x.resource === a : kind === 'outside' ? x.input === a : x.part === a && x.load === b));
  s.entries = entries;
}

function describeEvent(e) {
  if (e.kind === 'damage') return `damage to ${e.part}`;
  if (e.kind === 'signal') return `level ${e.level}: ${e.condition}`;
  const parts = [];
  if (e.setMode) parts.push(`switch to arrangement '${e.setMode}'`);
  if (e.replaceSettings) parts.push(`replace settings ${e.replaceSettings.join(', ')}`);
  if (e.setHeld) parts.push(`hold levels ${e.setHeld.join(', ') || '(none)'}`);
  if (e.setBand) parts.push(`band on ${e.setBand.level}: ${JSON.stringify(e.setBand.lower)} to ${JSON.stringify(e.setBand.upper)}`);
  return `intervention: ${parts.join('; ')}`;
}

// ---------------------------------------------------------------- loading and running

// The published build (GitHub Pages) runs the engine in the page; locally, the workbench server runs it.
const IN_BROWSER = document.documentElement.dataset.engine === 'browser';

async function api(path, body) {
  if (IN_BROWSER) {
    const { browserApi } = await import('./browser-api.js');
    return browserApi(path, body);
  }
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  return res.json();
}

async function loadExample(id) {
  state.bundle = await api(`/api/examples/${id}`);
  state.baselineId = state.bundle.baseline;
  resetIntervention(state.bundle.intervention);
  $('#versions').textContent = `engine ${state.bundle.versions.engine} · schema ${state.bundle.versions.schema} · policy ${state.bundle.allocationPolicy}`;
  renderScenario();
  await runBoth();
}

function resetIntervention(sourceId) {
  state.sourceId = sourceId;
  const doc = clone(state.bundle.scenarios[sourceId]);
  doc.id = `${sourceId}-intervention`;
  doc.label = `Workbench intervention, from ${sourceId}`;
  state.intervention = doc;
}

async function runBoth() {
  if (state.running) return;
  state.running = true;
  setStatus('Running the engine…', 'busy');
  const example = state.bundle.id;
  try {
    const [b, i] = await Promise.all([
      api('/api/run', { example, scenario: state.bundle.scenarios[state.baselineId] }),
      api('/api/run', { example, scenario: state.intervention }),
    ]);
    state.results = { baseline: b, intervention: i };
    const problems = [b, i].filter((r) => !r.ok).length;
    setStatus(problems ? 'The engine could not run one scenario: see below' : `Computed at ${new Date().toLocaleTimeString()}`, problems ? 'warn' : 'ok');
  } catch (err) {
    setStatus(`Request failed: ${err.message}`, 'warn');
  } finally {
    state.running = false;
  }
  renderSystem();
  renderResults();
}

function setStatus(text, kind) {
  const s = $('#status');
  s.textContent = text;
  s.dataset.kind = kind;
}

// ---------------------------------------------------------------- the mapped system

function ruleText(rule) {
  if (!rule) return '-';
  if (rule.gap !== undefined) return `gap (${rule.gap})`;
  switch (rule.kind) {
    case 'constant': return String(rule.value);
    case 'linear':
      if (rule.reads) return `piecewise-linear on level ${rule.reads}`;
      return [String(rule.base), ...rule.terms.map((t) => `${t.per} × ${t.load}`)].join(' + ');
    case 'table': return `table on ${rule.load}`;
    case 'per-unit': return `${rule.per} per unit`;
    case 'step': return `steps on level ${rule.reads}`;
    default: return rule.kind;
  }
}

function layersFrom(model, base) {
  const order = base?.steps?.[0]?.order;
  if (order && order.entries) {
    const byLayer = new Map();
    for (const e of order.entries) {
      const row = byLayer.get(e.layer) ?? [];
      row.push(e);
      byLayer.set(e.layer, row);
    }
    return [...byLayer.keys()].sort((a, b) => a - b).map((k) => byLayer.get(k).sort((a, b) => a.position - b.position).map((e) => e.part));
  }
  return [model.parts.map((p) => p.id)];
}

function renderSystem() {
  const { model, work, backlog } = state.bundle;
  const base = state.results.baseline?.ok ? state.results.baseline.base : null;
  const ids = model.parts.map((p) => p.id).sort();
  const colours = new Map(ids.map((id, i) => [id, colourFor(i)]));
  const labels = new Map(model.parts.map((p) => [p.id, p.label ?? p.id]));
  const diagram = systemDiagram({
    layers: layersFrom(model, base),
    edges: model.dependencies.map((d) => ({ from: d.part, to: d.feeds })),
    top: model.boundary.top,
    labels,
    colours,
  });
  const resources = model.resources.map((r) => `<li><strong>${esc(r.id)}</strong> <span class="muted">${esc(r.unit)}${r.storable ? ', storable' : ', not storable'}</span></li>`).join('');
  const parts = model.parts.map((p) => {
    const req = p.requirement.map((q) => `${esc(q.resource)}: ${esc(ruleText(q.rule))}`).join('<br>');
    const upk = p.upkeep.map((q) => `${esc(q.resource)}: ${esc(ruleText(q.rule))}`).join('<br>') || '-';
    const units = typeof p.units === 'object' ? 'gap' : p.units;
    return `<tr><td><span class="swatch" style="background:${colours.get(p.id)}"></span>${esc(p.label ?? p.id)}<div class="muted">${esc(p.id)}${p.setsOwnAccess ? ' · separate case' : ''}</div></td><td>${esc(units)}</td><td>${req}</td><td>${upk}</td></tr>`;
  }).join('');
  const bands = model.governor.bands.map((b) => `<li>${esc(b.level)}: ${esc(JSON.stringify(b.lower))} to ${esc(JSON.stringify(b.upper))}${b.held !== undefined ? `, held at ${esc(JSON.stringify(b.held))}` : ''}</li>`).join('') || '<li class="muted">none</li>';
  const modes = model.modes.map((m) => `<li><strong>${esc(m.id)}</strong>${m.label ? ` <span class="muted">${esc(m.label)}</span>` : ''}<div class="muted">holds ${esc(m.held.join(', ') || 'no level')}; ${m.settings.length} settings</div></li>`).join('');
  const switches = model.thresholdSwitches.map((s) => `<li>${esc(s.id)}: ${esc(s.level)} ${esc(s.direction)} through ${esc(s.threshold)} → ${esc(s.toMode)}${s.fromMode ? ` (from ${esc(s.fromMode)})` : ''}</li>`).join('') || '<li class="muted">none</li>';
  const levels = model.levels.map((l) => `<li>${esc(l.id)} <span class="muted">measures ${esc(l.measures?.of ?? 'gap')}, produced by ${esc(typeof l.producedBy === 'string' ? l.producedBy : 'gap')}; silence read as ${esc(typeof l.missingSignal === 'string' ? l.missingSignal : 'gap')}</span></li>`).join('') || '<li class="muted">none</li>';
  const stores = model.stores.map((s) => `<li>${esc(s.id)} <span class="muted">${esc(s.resource)}, capacity ${esc(JSON.stringify(s.capacity))}</span></li>`).join('') || '<li class="muted">none</li>';
  const works = work ? work.works.map((w) => `<tr><td>${esc(w.part)}</td><td>${esc(w.work)}<div class="muted">${esc(w.workUnit)}</div></td><td>${esc(ruleText(w.referenceOutputRule))}</td><td>${esc(w.capacity.gap !== undefined ? 'gap' : w.capacity.kind === 'constant' ? w.capacity.value : `${w.capacity.perUnit} per unit`)}</td><td>${esc(typeof w.yield === 'object' ? 'gap' : w.yield)}</td></tr>`).join('') : '';
  const links = work?.links?.length ? work.links.map((l) => `<li>${esc(l.part)} → ${esc(l.feeds)}: ${esc(l.semantics)}, ratio ${esc(l.ratio)}${l.lagSteps ? `, lag ${l.lagSteps}` : ''}</li>`).join('') : '<li class="muted">none</li>';
  const accounts = backlog ? backlog.accounts.map((a) => `<li><strong>${esc(a.account)}</strong> <span class="muted">${esc(a.part)} / ${esc(a.work)} in ${esc(a.obligationUnit)}, ${esc(a.divisibility)}; claims ${esc([...new Set([a.eligibility, a.closure, a.withdrawals, a.openingBalance, a.admissions].map((c) => c.evidence.status))].join(', '))}</span></li>`).join('') : '';
  $('#system').innerHTML = `
    <h2>Mapped system</h2>
    <p class="note">${esc(model.label ?? model.id)}</p>
    ${model.rationale ? `<p class="assumption">${esc(model.rationale)}</p>` : ''}
    <div class="diagram-wrap">${diagram}</div>
    <p class="muted small">Layers as the engine derived them at step 0 (CANON 4): the top first, then the parts whose work feeds it. Arrows are dependencies, which set rank only.</p>
    <h3>Parts</h3>
    <table class="compact"><thead><tr><th>Part</th><th>Units</th><th>Requirement</th><th>Upkeep</th></tr></thead><tbody>${parts}</tbody></table>
    <h3>Resources</h3><ul class="plain">${resources}</ul>
    <h3>Governor</h3>
    <div class="cols"><div><h4>Bands</h4><ul class="plain">${bands}</ul></div><div><h4>Declared arrangements</h4><ul class="plain">${modes}</ul></div></div>
    <h4>Threshold switches</h4><ul class="plain">${switches}</ul>
    <h4>Levels</h4><ul class="plain">${levels}</ul>
    <h4>Stores</h4><ul class="plain">${stores}</ul>
    ${work ? `<h3>Work (P-WORK-01, P-DEP-01)</h3><p class="assumption">${esc(work.rationale ?? '')}</p>
      <table class="compact"><thead><tr><th>Part</th><th>Work</th><th>Reference output</th><th>Capacity</th><th>Yield</th></tr></thead><tbody>${works}</tbody></table>
      <h4>Functional links</h4><ul class="plain">${links}</ul>` : ''}
    ${backlog ? `<h3>Backlog accounts (P-LOAD-02, tracking only)</h3><p class="assumption">${esc(backlog.rationale ?? '')}</p><ul class="plain">${accounts}</ul>` : ''}
  `;
}

// ---------------------------------------------------------------- the scenario editor

function renderScenario() {
  const { model, scenarios } = state.bundle;
  const base = scenarios[state.baselineId];
  const iv = state.intervention;
  const options = (sel) => Object.keys(scenarios).map((id) => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(scenarios[id].label ?? id)}</option>`).join('');
  const steps = Math.max(base.steps, iv.steps);
  const heads = Array.from({ length: steps }, (_, t) => `<th>${t}</th>`).join('');
  const baseRows = new Map(seriesOf(model, base).map((r) => [r.key, r]));
  const rows = seriesOf(model, iv).map((r) => {
    const b = baseRows.get(r.key);
    const bv = b ? expand(b.entries, base.steps) : [];
    const iv2 = expand(r.entries, iv.steps);
    const bCells = Array.from({ length: steps }, (_, t) => `<td class="ro">${t < base.steps ? esc(cellText(bv[t])) || '<span class="gap">gap</span>' : ''}</td>`).join('');
    const iCells = Array.from({ length: steps }, (_, t) => {
      if (t >= iv.steps) return '<td></td>';
      const changed = !same(iv2[t], bv[t]);
      return `<td><input data-series="${esc(r.key)}" data-step="${t}" value="${esc(cellText(iv2[t]))}" placeholder="gap" class="${changed ? 'changed' : ''}" inputmode="decimal" aria-label="${esc(`${r.label} at step ${t}`)}"></td>`;
    }).join('');
    return `<tr class="series-head"><th colspan="${steps + 1}">${esc(r.label)} <span class="muted">${esc(r.unit)}</span></th></tr>
      <tr><td class="who">baseline</td>${bCells}</tr><tr><td class="who">intervention</td>${iCells}</tr>`;
  }).join('');
  const stores = (iv.initial?.stores ?? []).map((s) => {
    const b = base.initial?.stores?.find((x) => x.store === s.store);
    return `<label class="inline">Store <strong>${esc(s.store)}</strong> starts with <span class="muted">(baseline ${esc(cellText(b?.content))})</span> <input data-store="${esc(s.store)}" value="${esc(cellText(s.content))}" class="${same(s.content, b?.content) ? '' : 'changed'}" size="6"></label>`;
  }).join('');
  const hasDials = model.parts.some((p) => p.loadDials);
  const events = (iv.events ?? []).map((e, i) => `<li><input data-event="${i}" type="number" min="0" value="${e.step}" class="step-input" aria-label="step"> ${esc(describeEvent(e))}${e.note ? ` <span class="muted">${esc(e.note)}</span>` : ''} <button data-remove-event="${i}" class="link">remove</button></li>`).join('') || '<li class="muted">no events</li>';
  const baseEvents = (base.events ?? []).map((e) => `<li>step ${e.step}: ${esc(describeEvent(e))}</li>`).join('') || '<li class="muted">no events</li>';
  const modeOptions = model.modes.map((m) => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('');
  $('#scenario').innerHTML = `
    <h2>Scenario: baseline and intervention</h2>
    <div class="row">
      <label>Baseline <select id="baseline-select">${options(state.baselineId)}</select></label>
      <label>Intervention starts from <select id="source-select">${options(state.sourceId)}</select></label>
      <button id="reset" class="secondary">Reset intervention</button>
      <label class="inline">Steps <input id="steps" type="number" min="1" max="60" value="${iv.steps}" class="step-input"></label>
      ${hasDials ? `<label class="inline"><input id="pload" type="checkbox"${(iv.enable ?? []).includes('P-LOAD-01') ? ' checked' : ''}> P-LOAD-01 unit loss and rebuilding</label>` : ''}
    </div>
    <p class="small"><strong>The intervention starts as a copy of the scenario you choose.</strong> Edit its cells, its store contents or its events, then press Run comparison.</p>
    <p class="muted small">Values per step. An entry holds until the next, as in the engine. Leave a cell blank to state an explicit gap: the engine then refuses what depends on it, never reading it as 0. Changed cells are highlighted.</p>
    <div class="table-scroll"><table class="series"><thead><tr><th></th>${heads}</tr></thead><tbody>${rows}</tbody></table></div>
    ${stores ? `<div class="row">${stores}</div>` : ''}
    <div class="cols">
      <div><h4>Baseline events</h4><ul class="plain">${baseEvents}</ul></div>
      <div><h4>Intervention events</h4><ul class="plain">${events}</ul>
        <div class="row small"><label class="inline">At step <input id="new-event-step" type="number" min="0" value="1" class="step-input"></label>
        <label class="inline">switch to <select id="new-event-mode">${modeOptions}</select></label><button id="add-event" class="secondary">Add intervention</button></div>
      </div>
    </div>
  `;
  bindScenario();
}

function bindScenario() {
  $('#baseline-select').onchange = (e) => { state.baselineId = e.target.value; renderScenario(); runBoth(); };
  $('#source-select').onchange = (e) => { resetIntervention(e.target.value); renderScenario(); runBoth(); };
  $('#reset').onclick = () => { resetIntervention(state.sourceId); renderScenario(); runBoth(); };
  $('#steps').onchange = (e) => {
    const n = Math.max(1, Math.min(60, Number(e.target.value) || 1));
    state.intervention.steps = n;
    renderScenario();
  };
  const pl = $('#pload');
  if (pl) pl.onchange = (e) => {
    const en = new Set(state.intervention.enable ?? []);
    if (e.target.checked) en.add('P-LOAD-01');
    else en.delete('P-LOAD-01');
    state.intervention.enable = [...en];
  };
  for (const input of document.querySelectorAll('input[data-series]')) {
    input.onchange = (e) => {
      const key = e.target.dataset.series;
      const t = Number(e.target.dataset.step);
      const row = seriesOf(state.bundle.model, state.intervention).find((r) => r.key === key);
      const values = expand(row.entries, state.intervention.steps);
      const text = e.target.value.trim();
      values[t] = text === '' ? GAP : text;
      setSeries(state.intervention, key, compress(values));
      renderScenario();
    };
  }
  for (const input of document.querySelectorAll('input[data-store]')) {
    input.onchange = (e) => {
      const s = state.intervention.initial.stores.find((x) => x.store === e.target.dataset.store);
      const text = e.target.value.trim();
      s.content = text === '' ? GAP : text;
      renderScenario();
    };
  }
  for (const input of document.querySelectorAll('input[data-event]')) {
    input.onchange = (e) => {
      state.intervention.events[Number(e.target.dataset.event)].step = Math.max(0, Number(e.target.value) || 0);
      state.intervention.events.sort((a, b) => a.step - b.step);
      renderScenario();
    };
  }
  for (const b of document.querySelectorAll('button[data-remove-event]')) {
    b.onclick = () => { state.intervention.events.splice(Number(b.dataset.removeEvent), 1); renderScenario(); };
  }
  $('#add-event').onclick = () => {
    const step = Math.max(0, Number($('#new-event-step').value) || 0);
    state.intervention.events = [...(state.intervention.events ?? []), { step, kind: 'intervention', setMode: $('#new-event-mode').value, note: 'added in the workbench' }].sort((a, b) => a.step - b.step);
    renderScenario();
  };
}

// ---------------------------------------------------------------- results

const RUNS = [['baseline', 'Baseline'], ['intervention', 'Intervention']];

function partColours() {
  const ids = state.bundle.model.parts.map((p) => p.id).sort();
  return new Map(ids.map((id, i) => [id, colourFor(i)]));
}

function sumTV(tvs) {
  let total = 0;
  for (const tv of tvs) {
    if (refused(tv)) return null;
    total += num(tv) ?? 0;
  }
  return total;
}

function renderSummary(results) {
  const { model } = state.bundle;
  const card = (key, label) => {
    const r = results[key];
    if (!r?.ok) return `<div class="card bad"><h4>${label}</h4><p>Not computed.</p></div>`;
    const rows = model.resources.map((res) => {
      const s = sumTV(r.base.steps.map((st) => st.resources.find((x) => x.resource === res.id)?.totalShortfall));
      return `<li>Shortfall of ${esc(res.id)}, all steps: <strong>${s === null ? 'refused at some step' : fmt(s)}</strong> <span class="muted">${esc(res.unit)}</span></li>`;
    }).join('');
    const pf = sumTV(r.base.steps.map((st) => st.protectedFlow.shortfall));
    const backlogEnd = r.backlog ? r.backlog.stamp.accounts.map((a) => {
      const last = r.backlog.steps[r.backlog.steps.length - 1]?.accounts.find((x) => x.account === a.account);
      return `<li>Backlog ${esc(a.account)} at the end: <strong>${refused(last?.closingBalance) ? 'refused' : fmt(num(last?.closingBalance))}</strong> <span class="muted">${esc(a.obligationUnit)}</span></li>`;
    }).join('') : '';
    const refusalCount = r.base.refusals.length + (r.work?.refusals.length ?? 0) + (r.backlog?.refusals.length ?? 0);
    return `<div class="card"><h4>${label} <span class="muted">${esc(r.base.stamp.scenario.id)}, ${r.base.steps.length} steps</span></h4><ul class="plain">${rows}
      <li>Top's protected-flow shortfall, all steps: <strong>${pf === null ? 'refused at some step' : fmt(pf)}</strong></li>${backlogEnd}
      <li>Snapshots: ${r.base.snapshots.length}; refusals: ${refusalCount}</li></ul></div>`;
  };
  return `<div class="cards">${card('baseline', 'Baseline')}${card('intervention', 'Intervention')}</div>`;
}

function renderErrors(results) {
  return RUNS.filter(([k]) => results[k] && !results[k].ok).map(([k, label]) => {
    const r = results[k];
    const issues = (r.issues ?? []).filter((i) => i.severity === 'error').map((i) => `<li><code>${esc(i.path)}</code> [${esc(i.code)}] ${esc(i.message)}</li>`).join('');
    return `<div class="error"><h4>${label}: the engine did not run</h4><p>${esc(r.message ?? '')}</p>${issues ? `<ul>${issues}</ul>` : ''}</div>`;
  }).join('');
}

function legend(items) {
  return `<div class="legend">${items.map(([label, colour, dashed]) => `<span><i style="background:${colour}"${dashed ? ' class="dashed"' : ''}></i>${esc(label)}</span>`).join('')}</div>`;
}

function renderAllocation(results) {
  const { model } = state.bundle;
  const colours = partColours();
  const ok = RUNS.filter(([k]) => results[k]?.ok);
  return model.resources.map((res) => {
    const extra = [['stored', '#9aa5b1'], ['rebuilding', '#6b7785'], ['unused', '#d5dbe1']];
    const build = (r) => r.base.steps.map((st) => {
      const rec = st.resources.find((x) => x.resource === res.id);
      const stack = rec.receipts.map((x) => ({ key: x.part, colour: colours.get(x.part), value: num(x.amount), refused: refused(x.amount), title: exact(x.amount, r.base) }));
      stack.push({ key: 'stored', colour: extra[0][1], value: num(rec.storeFill), refused: refused(rec.storeFill), title: exact(rec.storeFill, r.base) });
      stack.push({ key: 'rebuilding', colour: extra[1][1], value: num(rec.rebuilding), refused: refused(rec.rebuilding), title: exact(rec.rebuilding, r.base) });
      stack.push({ key: 'unused', colour: extra[2][1], value: num(rec.unused), refused: refused(rec.unused), title: exact(rec.unused, r.base) });
      return stack;
    });
    const lineOf = (r) => r.base.steps.map((st) => {
      const rec = st.resources.find((x) => x.resource === res.id);
      return refused(rec.totalRequirement) ? { value: null, refusedTitle: exact(rec.totalRequirement, r.base) } : { value: num(rec.totalRequirement), title: `total requirement ${exact(rec.totalRequirement, r.base)}` };
    });
    const maxOf = (r) => Math.max(...r.base.steps.map((st) => {
      const rec = st.resources.find((x) => x.resource === res.id);
      return Math.max(num(rec.entering) ?? 0, num(rec.totalRequirement) ?? 0);
    }));
    const yMax = niceMax(Math.max(0, ...ok.map(([k]) => maxOf(results[k]))));
    const charts = ok.map(([k, label]) => {
      const r = results[k];
      return `<figure><figcaption>${label}</figcaption>${stackedBars({ steps: r.base.steps.length, stacks: build(r), line: lineOf(r), yMax, label: `${label} allocation of ${res.id}` })}</figure>`;
    }).join('');
    const parts = [...colours].filter(([id]) => model.parts.find((p) => p.id === id)?.requirement.some((q) => q.resource === res.id));
    return `<div class="block"><h3>Allocation of ${esc(res.id)} <span class="muted">${esc(res.unit)} per step</span></h3>
      ${legend([...parts.map(([id, c]) => [model.parts.find((p) => p.id === id)?.label ?? id, c]), ...extra.map(([l, c]) => [l, c]), ['total requirement', 'var(--ink)', true]])}
      <div class="pair">${charts}</div>
      <p class="muted small">Each bar is what entered the shared flow in the step, by where it went: received by each part, stored, spent rebuilding, or unused. The dashed marker is the total requirement; hatching is a refused value.</p></div>`;
  }).join('');
}

function heatTable(r, res, other) {
  const parts = r.base.steps[0].parts.filter((p) => p.resource === res).map((p) => p.part);
  const steps = r.base.steps.length;
  const maxV = Math.max(1, ...r.base.steps.flatMap((st) => st.parts.filter((p) => p.resource === res).map((p) => num(p.shortfall) ?? 0)));
  const rows = parts.map((id) => {
    const cells = r.base.steps.map((st, t) => {
      const p = st.parts.find((x) => x.part === id && x.resource === res);
      if (refused(p.shortfall)) return `<td class="refused" title="${esc(exact(p.shortfall, r.base))}">refused</td>`;
      const v = num(p.shortfall);
      const o = other?.base.steps[t]?.parts.find((x) => x.part === id && x.resource === res);
      const d = o && !refused(o.shortfall) ? v - num(o.shortfall) : null;
      const delta = other && d !== null && Math.abs(d) > 1e-9 ? `<small class="${d > 0 ? 'worse' : 'better'}">${d > 0 ? '+' : ''}${fmt(d)}</small>` : '';
      return `<td style="--heat:${(v / maxV).toFixed(3)}" title="${esc(`requirement ${exact(p.requirement, r.base)}; received ${exact(p.received, r.base)}; shortfall ${exact(p.shortfall, r.base)}`)}">${fmt(v)}${delta}</td>`;
    }).join('');
    return `<tr><th>${esc(id)}</th>${cells}</tr>`;
  }).join('');
  return `<table class="heat"><thead><tr><th></th>${Array.from({ length: steps }, (_, t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderShortfall(results) {
  const { model } = state.bundle;
  return model.resources.map((res) => {
    const blocks = RUNS.filter(([k]) => results[k]?.ok).map(([k, label]) => {
      const other = k === 'intervention' && results.baseline?.ok ? results.baseline : null;
      return `<figure><figcaption>${label}${other ? ' <span class="muted">(small figures: change from baseline)</span>' : ''}</figcaption><div class="table-scroll">${heatTable(results[k], res.id, other)}</div></figure>`;
    }).join('');
    return `<div class="block"><h3>Shortfall of ${esc(res.id)} <span class="muted">${esc(res.unit)}, by part and step</span></h3><div class="pair">${blocks}</div></div>`;
  }).join('');
}

function renderOutput(results) {
  const work = state.bundle.work;
  if (!work) return '<p class="muted">This example maps no work (P-WORK-01).</p>';
  const ok = RUNS.filter(([k]) => results[k]?.ok && results[k].work);
  const tones = { baseline: '#8792a2', intervention: '#3b6fd8' };
  return work.works.map((w) => {
    const series = [];
    let steps = 0;
    for (const [k, label] of ok) {
      const r = results[k];
      steps = Math.max(steps, r.work.steps.length);
      const recs = r.work.steps.map((st) => st.works.find((x) => x.part === w.part && x.work === w.work));
      series.push({ name: `${label} actual output`, colour: tones[k], values: recs.map((x) => num(x?.actualOutput)), refused: recs.map((x) => refused(x?.actualOutput)), titles: recs.map((x) => `${exact(x?.actualOutput, r.work)}; binding ${JSON.stringify(x?.binding)}`) });
      series.push({ name: `${label} reference output`, colour: tones[k], dashed: true, values: recs.map((x) => num(x?.referenceOutput)), refused: recs.map((x) => refused(x?.referenceOutput)), titles: recs.map((x) => exact(x?.referenceOutput, r.work)) });
    }
    const notDone = ok.map(([k, label]) => {
      const r = results[k];
      return `<tr><th>${label}</th>${r.work.steps.map((st) => {
        const x = st.works.find((y) => y.part === w.part && y.work === w.work);
        return refused(x?.workNotDone) ? `<td class="refused" title="${esc(exact(x.workNotDone, r.work))}">refused</td>` : `<td title="${esc(exact(x?.workNotDone, r.work))}">${fmt(num(x?.workNotDone))}</td>`;
      }).join('')}</tr>`;
    }).join('');
    return `<div class="block"><h3>${esc(w.work)} <span class="muted">${esc(w.part)}, in ${esc(w.workUnit)}</span></h3>
      <p class="muted small">${esc(w.definition)}</p>
      ${legend([['baseline actual', tones.baseline], ['intervention actual', tones.intervention], ['reference output (dashed)', 'var(--ink)', true]])}
      ${lineChart({ steps, series, label: `${w.work} output` })}
      <div class="table-scroll"><table class="compact"><thead><tr><th>Work not done</th>${Array.from({ length: steps }, (_, t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${notDone}</tbody></table></div></div>`;
  }).join('');
}

function renderBacklog(results) {
  const backlog = state.bundle.backlog;
  if (!backlog) return '<p class="muted">This example maps no backlog account (P-LOAD-02).</p>';
  const ok = RUNS.filter(([k]) => results[k]?.ok && results[k].backlog);
  const tones = { baseline: '#8792a2', intervention: '#c2417a' };
  return backlog.accounts.map((a) => {
    const series = [];
    let steps = 0;
    let conditional = [];
    for (const [k, label] of ok) {
      const r = results[k];
      steps = Math.max(steps, r.backlog.steps.length);
      const recs = r.backlog.steps.map((st) => st.accounts.find((x) => x.account === a.account));
      conditional = recs[0]?.conditionalOn ?? conditional;
      series.push({ name: `${label} closing balance`, colour: tones[k], values: recs.map((x) => num(x?.closingBalance)), refused: recs.map((x) => refused(x?.closingBalance)),
        titles: recs.map((x) => `opening ${exact(x?.openingBalance, r.backlog)}; admitted ${exact(x?.admissions, r.backlog)}; completed ${exact(x?.completions, r.backlog)}; closing ${exact(x?.closingBalance, r.backlog)}; ${x?.diagnostics?.join(', ')}`) });
    }
    return `<div class="block"><h3>${esc(a.account)} <span class="muted">${esc(a.part)} / ${esc(a.work)}, in ${esc(a.obligationUnit)}, ${esc(a.divisibility)}</span></h3>
      ${conditional.length ? `<p class="assumption">Conditional result: it rests on ${esc(conditional.join('; '))}.</p>` : ''}
      ${legend([['baseline', tones.baseline], ['intervention', tones.intervention]])}
      ${lineChart({ steps, series, label: `${a.account} backlog` })}
      <p class="muted small">Closing balance of eligible obligations after each step: modelled from the declared admissions and the work's actual output, never an observed count. A cross on the axis is a refused balance; once refused, a balance stays refused (no restart).</p></div>`;
  }).join('');
}

function refusalRows(trace, source) {
  return (trace?.refusals ?? []).map((r) => `<tr><td><code>${esc(r.id)}</code></td><td>${esc(source)}</td><td>${esc(r.category)}</td><td>${r.firstStep}${r.lastStep !== r.firstStep ? `–${r.lastStep}` : ''}</td><td>${esc(r.question ?? '')} ${esc(r.proposal ?? '')}</td><td>${esc(r.message)}</td></tr>`).join('');
}

function renderAssumptions(results) {
  const reg = new Map(state.bundle.proposals.map((p) => [p.id, p]));
  return RUNS.filter(([k]) => results[k]?.ok).map(([k, label]) => {
    const r = results[k];
    const proposals = [...r.base.stamp.proposals, ...(r.work ? r.work.stamp.proposals.map((p) => p.id) : []), ...(r.backlog ? [r.backlog.stamp.proposal.id] : [])];
    const chips = [...new Set(proposals)].map((id) => `<span class="chip" title="${esc(reg.get(id)?.title ?? '')}">${esc(id)}</span>`).join('');
    const flags = new Map();
    for (const st of r.base.steps) for (const f of st.flags) {
      const e = flags.get(f.code) ?? { steps: [], detail: f.detail, subjects: new Set() };
      e.steps.push(st.step);
      e.subjects.add(f.subject);
      flags.set(f.code, e);
    }
    const flagRows = [...flags].map(([code, e]) => `<tr><td><code>${esc(code)}</code></td><td>${esc([...e.subjects].join(', '))}</td><td>${esc([...new Set(e.steps)].join(', '))}</td><td>${esc(e.detail)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">none</td></tr>';
    const refusals = refusalRows(r.base, 'base') + refusalRows(r.work, 'work') + refusalRows(r.backlog, 'backlog');
    return `<div class="block"><h3>${label}</h3>
      <p>Proposals in force (not CANON; hover for what each does): ${chips}</p>
      <p class="muted small">The allocation policy ${esc(r.base.stamp.allocationPolicy ?? 'none')} decides who takes what when access exceeds what arrives (Q-001).</p>
      <h4>Flags</h4><div class="table-scroll"><table class="compact"><thead><tr><th>Flag</th><th>Subject</th><th>Steps</th><th>Detail</th></tr></thead><tbody>${flagRows}</tbody></table></div>
      <h4>Refusals</h4><div class="table-scroll"><table class="compact"><thead><tr><th>Id</th><th>Trace</th><th>Category</th><th>Steps</th><th>Question, proposal</th><th>Why</th></tr></thead><tbody>${refusals || '<tr><td colspan="6" class="muted">none: every value was computed</td></tr>'}</tbody></table></div></div>`;
  }).join('');
}

function renderProvenance(results) {
  return RUNS.filter(([k]) => results[k]?.ok).map(([k, label]) => {
    const r = results[k];
    const s = r.base.stamp;
    const snaps = r.base.snapshots.map((x) => `<li>steps ${x.fromStep}–${x.toStep}: <strong>${esc(x.mode ?? 'unknown')}</strong> <span class="muted">(${esc(x.change)}, by ${esc(x.startedBy)})</span></li>`).join('');
    return `<div class="block"><h3>${label}</h3><ul class="plain mono">
      <li>engine ${esc(s.engineVersion)}, schema ${esc(s.schemaVersion)}; CANON ${esc(s.canonFingerprint.canon.slice(0, 16))}…</li>
      <li>model ${esc(s.mapping.id)} ${esc(s.mapping.sha256.slice(0, 16))}…; scenario ${esc(s.scenario.id)} ${esc(s.scenario.sha256.slice(0, 16))}…</li>
      <li>base trace ${esc(r.hashes.base)}</li>
      ${r.hashes.work ? `<li>work trace ${esc(r.hashes.work)}</li>` : ''}
      ${r.hashes.backlog ? `<li>backlog trace ${esc(r.hashes.backlog)}</li>` : ''}</ul>
      <h4>Snapshots (derived by the engine)</h4><ul class="plain">${snaps}</ul></div>`;
  }).join('');
}

function renderResults() {
  const results = state.results;
  const tab = state.tab ?? 'allocation';
  const tabs = [['allocation', 'Allocation'], ['shortfall', 'Shortfall'], ['output', 'Functional output'], ['backlog', 'Backlog'], ['assumptions', 'Refusals and assumptions'], ['provenance', 'Provenance']];
  const body = { allocation: renderAllocation, shortfall: renderShortfall, output: renderOutput, backlog: renderBacklog, assumptions: renderAssumptions, provenance: renderProvenance }[tab](results);
  $('#results').innerHTML = `${renderErrors(results)}${renderSummary(results)}
    <nav class="tabs">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${id === tab ? 'active' : ''}">${label}</button>`).join('')}</nav>
    <div class="tab-body">${body}</div>`;
  for (const b of document.querySelectorAll('button[data-tab]')) b.onclick = () => { state.tab = b.dataset.tab; renderResults(); };
}

// ---------------------------------------------------------------- start

async function start() {
  if (IN_BROWSER) {
    const build = await fetch('./build.json').then((r) => r.json()).catch(() => null);
    $('#banner').textContent = `Every number here is computed exactly by the N-ought engine running in this browser${build ? ` (the published build of commit ${build.commit.slice(0, 7)}, ${build.built})` : ''}, from the mapped model and the scenario values shown. Nothing is estimated by AI, and nothing you enter leaves this page. Hover any mark or cell for the exact value or the reason it was refused.`;
  }
  if (IN_BROWSER) {
    const footer = $('#footer');
    footer.innerHTML = 'For reviewers: <a href="./handover-for-gpt.md">the engine as built (handover-for-gpt.md)</a> · <a href="./workbench.md">how to use the workbench</a> · <a href="./build.json">this build</a>';
    footer.hidden = false;
  }
  state.examples = await api('/api/examples');
  const sel = $('#example');
  sel.innerHTML = state.examples.map((e) => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join('');
  sel.onchange = () => loadExample(sel.value);
  $('#run').onclick = () => runBoth();
  await loadExample(state.examples[0].id);
}

start().catch((err) => setStatus(`Could not start: ${err.message}`, 'warn'));
