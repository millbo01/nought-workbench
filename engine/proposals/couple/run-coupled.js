// P-COUPLE-01 0.1 (the v0.3 design resolutions; implementation authorised
// 2026-10-20): the coupled run. For each step t in order, and each binding of
// an account to a load on the account's own part:
//   1. G_t = D_t = B_t + N_t, the account's eligible obligations before the
//      step, from the ledger's carried balance and the admissions series
//      (G_0 = B_0 + N_0: F.3);
//   2. one PAM step with G_t given for the bound load: the existing
//      requirement, sensing, access, draw, P-LOAD-01 and reconciliation rules
//      apply unchanged, and a level's reading of G_t is tagged computed;
//   3. one P-WORK-01 step on that step's state, reading G_t for the load;
//   4. one P-LOAD-02 closure, with its guards: C_t, and B_{t+1} = D_t - C_t.
// C_t never changes step t; it reaches the next step's G only. A refused
// generated load refuses what the mapped rules make depend on it, and nothing
// else; a refused closing balance refuses every later G of its binding, with
// no restart (CF-D06). Nothing here adds a rule: the base, work and ledger
// steps are the existing ones, taken in this order.
import { canonicalJson } from "../../core/canonical-json.js";
import { ConfigurationError, ModelInvalidError } from "../../core/errors.js";
import * as Q from "../../core/rational.js";
import { checkDrawPolicy, startRun } from "../../core/run.js";
import { validateCoupledScenario, validateModel } from "../../core/schema/validate.js";
import { sha256OfString } from "../../core/sha256.js";
import { traceHash } from "../../core/trace.js";
import { validateBacklogAttachment } from "../backlog/attachment.js";
import { startBacklog } from "../backlog/ledger.js";
import { backlogTraceHash } from "../backlog/trace.js";
import { validateWorkAttachment } from "../work/attachment.js";
import { startWork } from "../work/run-work.js";
import { workTraceHash } from "../work/trace.js";
import { conditionsOf, COUPLING_PROPOSAL, couplingImpact, staticGuard, validateCouplingAttachment } from "./attachment.js";
import { COUPLE_VERSION } from "./trace.js";
function byId(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function k2(a, b) {
    return `${a}|${b}`;
}
const sha = (doc) => sha256OfString(canonicalJson(doc));
/** Collects every refusal with the steps it applies to. */
class Notes {
    seen = new Map();
    note(refusals, step) {
        for (const r of refusals) {
            const s = this.seen.get(r.id);
            if (s) {
                s.last = Math.max(s.last, step);
                s.values += 1;
            }
            else
                this.seen.set(r.id, { refusal: r, first: step, last: step, values: 1 });
        }
        return refusals.map((r) => r.id);
    }
    summary() {
        return [...this.seen.keys()].sort(byId).map((id) => {
            const s = this.seen.get(id);
            const r = s.refusal;
            return {
                id, category: r.category, message: r.message, canon: r.canon, question: r.question, proposal: r.proposal,
                path: r.path, firstStep: s.first, lastStep: s.last, values: s.values,
            };
        });
    }
    questions() {
        const qs = new Set();
        for (const s of this.seen.values())
            if (s.refusal.question)
                qs.add(s.refusal.question);
        return [...qs].sort(byId);
    }
}
function replayDoc(scenarioDoc, coupling, steps) {
    const s = scenarioDoc;
    const id = s['id'];
    const generated = (steps[0]?.bindings ?? []).map((b, i) => ({
        part: b.part,
        load: b.load,
        entries: steps.map((st) => {
            const g = st.bindings[i].generated;
            return { step: st.step, value: 'refused' in g ? { gap: `the generated load was refused in the coupled run (${g.refused.join('; ')})` } : g.v };
        }),
    }));
    return {
        ...s,
        id: `${id}.replay`,
        label: `Replay of '${id}' with its generated loads stated (derived)`,
        rationale: `Derived by ${COUPLING_PROPOSAL.id} ${COUPLING_PROPOSAL.version} from the coupled run of scenario '${id}' (sha256 ${sha(scenarioDoc)}) under coupling attachment '${coupling.id}' (sha256 ${coupling.sha256}): each generated load is stated as a series, one entry per step. It is derived from that run, not an external input (CF-D05).`,
        loads: [...s['loads'], ...generated],
    };
}
/**
 * The effective scenario of a coupled run (CF-D05): its scenario with each
 * generated load stated as a series, one entry per step, a refused value as
 * an information gap. The unchanged runners, given it, compute the coupled
 * run's known figures and refuse the same fields; the stamps, tags, hashes
 * and some refusal ids differ by design. Its id ends '.replay' and its digest
 * is the coupling stamp's replayScenario, labelled derived there.
 */
export function couplingReplayScenario(scenarioDoc, coupling) {
    if (sha(scenarioDoc) !== coupling.stamp.base.scenario.sha256)
        throw new ConfigurationError('P-COUPLE-01: this is not the scenario the coupled run read');
    return replayDoc(scenarioDoc, coupling.stamp.attachment, coupling.steps);
}
// ---------------------------------------------------------------- refusal paths (CF-D06)
const RECORD_IDS = ['binding', 'account', 'part', 'work', 'resource', 'level', 'store', 'indicator', 'feeds', 'from'];
/** Calls `visit` for each refusal id in the step records, with the field it refuses. */
function refusedFields(steps, visit) {
    const walk = (x, path, step) => {
        if (Array.isArray(x)) {
            x.forEach((e, i) => {
                const o = typeof e === 'object' && e !== null ? e : {};
                const label = RECORD_IDS.filter((k) => typeof o[k] === 'string').map((k) => o[k]).join('/');
                walk(e, `${path}[${label === '' ? i : label}]`, step);
            });
            return;
        }
        if (typeof x !== 'object' || x === null)
            return;
        const o = x;
        if (Array.isArray(o['refused']))
            for (const id of o['refused'])
                visit(id, path, step);
        for (const [k, v] of Object.entries(o))
            if (k !== 'refused')
                walk(v, path === '' ? k : `${path}.${k}`, step);
    };
    steps.forEach((s) => walk(s, '', s.step));
}
function refusalPaths(ids, traces) {
    const wanted = new Set(ids);
    const found = new Map();
    traces.forEach(([trace, steps], order) => refusedFields(steps, (id, field, step) => {
        if (!wanted.has(id))
            return;
        const byField = found.get(id) ?? new Map();
        found.set(id, byField);
        const key = `${trace}|${field}`;
        const e = byField.get(key) ?? { trace, field, steps: new Set(), order };
        e.steps.add(step);
        byField.set(key, e);
    }));
    return [...wanted].sort(byId).map((refusal) => ({
        refusal,
        reaches: [...(found.get(refusal)?.values() ?? [])]
            .map((e) => ({ ...e, steps: [...e.steps].sort((a, b) => a - b) }))
            .sort((a, b) => a.steps[0] - b.steps[0] || a.order - b.order || byId(a.field, b.field))
            .map((e) => ({ trace: e.trace, field: e.field, steps: e.steps })),
    }));
}
// ---------------------------------------------------------------- the coupled run
function coupled(model, scenario, scenarioDoc, options, hashes, work, backlog, coupling) {
    const bindings = coupling.attachment.bindings.slice().sort((a, b) => byId(a.binding, b.binding));
    const notes = new Notes();
    const tv = (tag, v, t) => (v.ok ? { t: tag, v: Q.toCanonical(v.v) } : { t: tag, refused: notes.note(v.refusals, t) });
    const baseCursor = startRun(model, scenario, options, hashes);
    let generated = new Map();
    const workCursor = startWork(model, scenario, work.attachment, work.sha256, {
        describe: (id) => baseCursor.describe(id),
        load: (part, load) => generated.get(k2(part, load)),
    });
    const ledger = startBacklog(backlog.attachment, backlog.sha256, scenario.steps, { describe: (id) => workCursor.describe(id) });
    const steps = [];
    for (let t = 0; t < scenario.steps; t++) {
        generated = new Map(bindings.map((b) => [k2(b.part, b.load), ledger.eligible(b.account)]));
        const baseStep = baseCursor.step(t, { loads: generated });
        ledger.step(workCursor.step(baseStep));
        steps.push({
            step: t,
            bindings: bindings.map((b) => ({
                binding: b.binding, account: b.account, part: b.part, load: b.load,
                generated: tv('computed', generated.get(k2(b.part, b.load)), t),
            })),
        });
    }
    const base = baseCursor.finish({ proposals: [COUPLING_PROPOSAL.id] });
    const workTrace = workCursor.finish(base);
    const backlogTrace = ledger.finish(base, workTrace);
    const stampOf = (b) => {
        const acc = backlog.attachment.accounts.find((x) => x.account === b.account);
        const w = acc && work.attachment.works.find((x) => x.part === acc.part && x.work === acc.work);
        if (!acc || !w)
            throw new Error(`couple: binding '${b.binding}' has no account or work after validation (a defect)`);
        const ev = b.activeWorkload.evidence;
        return {
            binding: b.binding, account: b.account, part: b.part, load: b.load, unit: acc.obligationUnit,
            activeWorkload: { statement: b.activeWorkload.statement, status: ev.status, source: ev.source },
            conditionalOn: conditionsOf(b, acc),
            guard: staticGuard(w.referenceOutputRule, b.load),
            impact: couplingImpact(model, work.attachment, b.part, b.load),
        };
    };
    const bindingStamps = bindings.map(stampOf);
    const s = base.stamp;
    const refusals = notes.summary();
    const trace = {
        stamp: {
            coupleVersion: COUPLE_VERSION,
            proposal: { id: COUPLING_PROPOSAL.id, version: COUPLING_PROPOSAL.version },
            conditional: bindingStamps.some((b) => b.conditionalOn.length > 0),
            base: {
                engineVersion: s.engineVersion,
                schemaVersion: s.schemaVersion,
                canonFingerprint: { canon: s.canonFingerprint.canon, application: s.canonFingerprint.application },
                traceSha256: traceHash(base),
                mapping: { id: s.mapping.id, sha256: s.mapping.sha256 },
                scenario: { id: s.scenario.id, sha256: s.scenario.sha256 },
                steps: s.steps,
                allocationPolicy: s.allocationPolicy,
                proposals: [...s.proposals],
            },
            work: { workVersion: workTrace.stamp.workVersion, traceSha256: workTraceHash(workTrace), attachment: { ...workTrace.stamp.attachment } },
            backlog: { backlogVersion: backlogTrace.stamp.backlogVersion, traceSha256: backlogTraceHash(backlogTrace), attachment: { ...backlogTrace.stamp.attachment } },
            attachment: { id: coupling.attachment.id, version: coupling.attachment.attachmentVersion, sha256: coupling.sha256 },
            replayScenario: {
                id: `${scenario.id}.replay`,
                sha256: sha(replayDoc(scenarioDoc, { id: coupling.attachment.id, sha256: coupling.sha256 }, steps)),
                derived: true,
            },
            bindings: bindingStamps,
        },
        steps,
        refusals,
        refusalPaths: refusalPaths(refusals.map((r) => r.id), [['coupling', steps], ['base', base.steps], ['work', workTrace.steps], ['backlog', backlogTrace.steps]]),
        questions: notes.questions(),
    };
    return { base, work: workTrace, backlog: backlogTrace, coupling: trace };
}
/**
 * Validate the model, the work, backlog and coupling attachments and the
 * scenario, and run them coupled: the base, work and backlog traces, the base
 * stamp naming P-COUPLE-01, and the coupling trace, always together. Throws
 * where the coupled run is not valid (ModelInvalidError: among others a
 * binding whose active-workload claim is unknown, or a scenario that also
 * gives a bound load a series, with no fallback to the scenario's loads) or
 * cannot be configured (ConfigurationError); every value it cannot compute is
 * refused in the result.
 */
export function runCoupled(modelDoc, scenarioDoc, workAttachmentDoc, backlogAttachmentDoc, couplingAttachmentDoc, options = {}) {
    const mv = validateModel(modelDoc);
    if (!mv.ok || !mv.model)
        throw new ModelInvalidError('model', mv.issues);
    const model = mv.model;
    const modelSha256 = sha(modelDoc);
    const wv = validateWorkAttachment(workAttachmentDoc, model, modelSha256);
    if (!wv.ok || !wv.attachment)
        throw new ModelInvalidError('work attachment', wv.issues);
    const workSha256 = sha(workAttachmentDoc);
    const bv = validateBacklogAttachment(backlogAttachmentDoc, model, modelSha256, wv.attachment, workSha256);
    if (!bv.ok || !bv.attachment)
        throw new ModelInvalidError('backlog attachment', bv.issues);
    const backlogSha256 = sha(backlogAttachmentDoc);
    const cv = validateCouplingAttachment(couplingAttachmentDoc, model, modelSha256, bv.attachment, backlogSha256, wv.attachment);
    if (!cv.ok || !cv.attachment)
        throw new ModelInvalidError('coupling attachment', cv.issues);
    const sv = validateCoupledScenario(scenarioDoc, model, new Set(cv.attachment.bindings.map((b) => k2(b.part, b.load))));
    if (!sv.ok || !sv.scenario)
        throw new ModelInvalidError('scenario', sv.issues);
    checkDrawPolicy(options);
    return coupled(model, sv.scenario, scenarioDoc, options, { model: modelSha256, scenario: sha(scenarioDoc) }, { attachment: wv.attachment, sha256: workSha256 }, { attachment: bv.attachment, sha256: backlogSha256 }, { attachment: cv.attachment, sha256: sha(couplingAttachmentDoc) });
}
