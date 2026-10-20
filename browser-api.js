// The engine in the page, for the published workbench (GitHub Pages): it
// answers the same three requests the local server answers
// (src/adapters/node/workbench.ts), with the engine compiled to JavaScript
// (engine/, built by scripts/build-site.ts) running in this browser. The model
// and any work or backlog attachment are the example's own fixtures; only the
// scenario comes from the page.

import { CANON_FINGERPRINT, ConfigurationError, ENGINE_VERSION, ModelInvalidError, run, SCHEMA_VERSION, traceHash } from './engine/index.js';
import { BACKLOG_VERSION, backlogTraceHash, gradedAllocation, PROPOSALS, runBacklog, runWork, WORK_VERSION, workTraceHash } from './engine/proposals/index.js';

const docs = new Map();

async function readDoc(path) {
  if (!docs.has(path)) {
    docs.set(path, fetch(`./${path}`).then((r) => {
      if (!r.ok) throw new Error(`could not read ${path}`);
      return r.json();
    }));
  }
  return structuredClone(await docs.get(path));
}

async function examples() {
  return (await readDoc('examples.json')).examples;
}

async function bundle(e) {
  const scenarios = {};
  for (const p of e.scenarios) {
    const doc = await readDoc(p);
    scenarios[doc.id] = doc;
  }
  return {
    id: e.id,
    label: e.label,
    model: await readDoc(e.model),
    scenarios,
    work: e.work ? await readDoc(e.work) : null,
    backlog: e.backlog ? await readDoc(e.backlog) : null,
    baseline: e.baseline,
    intervention: e.intervention,
    versions: { engine: ENGINE_VERSION, schema: SCHEMA_VERSION, work: WORK_VERSION, backlog: BACKLOG_VERSION, canon: CANON_FINGERPRINT.canon.sha256 },
    proposals: PROPOSALS,
    allocationPolicy: gradedAllocation.proposalId,
  };
}

async function compute(e, scenarioDoc) {
  const model = await readDoc(e.model);
  const options = { drawPolicy: gradedAllocation };
  try {
    if (e.work && e.backlog) {
      const r = runBacklog(model, scenarioDoc, await readDoc(e.work), await readDoc(e.backlog), options);
      return { ok: true, base: r.base, work: r.work, backlog: r.backlog, hashes: { base: traceHash(r.base), work: workTraceHash(r.work), backlog: backlogTraceHash(r.backlog) } };
    }
    if (e.work) {
      const r = runWork(model, scenarioDoc, await readDoc(e.work), options);
      return { ok: true, base: r.base, work: r.work, backlog: null, hashes: { base: traceHash(r.base), work: workTraceHash(r.work), backlog: null } };
    }
    const base = run(model, scenarioDoc, options);
    return { ok: true, base, work: null, backlog: null, hashes: { base: traceHash(base), work: null, backlog: null } };
  } catch (err) {
    if (err instanceof ModelInvalidError) return { ok: false, kind: 'invalid', message: err.message, issues: err.issues };
    if (err instanceof ConfigurationError) return { ok: false, kind: 'configuration', message: err.message, issues: [] };
    return { ok: false, kind: 'engine', message: err.message, issues: [] };
  }
}

/** The local server's API, answered in the page. */
export async function browserApi(path, body) {
  if (path === '/api/examples') return (await examples()).map((e) => ({ id: e.id, label: e.label, work: Boolean(e.work), backlog: Boolean(e.backlog) }));
  const match = /^\/api\/examples\/([A-Za-z0-9_.-]+)$/.exec(path);
  if (match) {
    const e = (await examples()).find((x) => x.id === match[1]);
    return e ? bundle(e) : { ok: false, message: `no example '${match[1]}'` };
  }
  if (path === '/api/run') {
    const e = (await examples()).find((x) => x.id === body?.example);
    if (!e) return { ok: false, kind: 'request', message: `no example '${String(body?.example)}'`, issues: [] };
    // Hand the engine a copy: it never writes to its inputs, and the page keeps editing its own.
    return compute(e, structuredClone(body.scenario));
  }
  return { ok: false, message: `no route ${path}` };
}
