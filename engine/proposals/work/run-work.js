// P-WORK-01 and P-DEP-01 (contract revision 0.3; decisions of 2026-10-20):
// work computed from a finished base run. The base run is the core `run()`,
// unchanged; nothing here writes to its trace, and no work value reaches a
// governor, setting, mode, sensed level, requirement, access, receipt, rank,
// store, unit count or shortfall. Per part p, step t and recipe resource r:
//   available[r]          = the base trace's remainderForWork[p, r, t]
//   recipeLimit[r]        = available[r] / recipe amount[r]
//   resourceLimitedOutput = the least recipeLimit
//   preDependencyOutput   = the least of referenceOutput, capacity and
//                           yield x resourceLimitedOutput
//   actualOutput          = the least of preDependencyOutput and each enabled
//                           link's cap
//   workNotDone           = referenceOutput less actualOutput, never below 0
// An enabled link from A to B caps B at actualOutput[A] / ratio; nothing is
// deducted from A. Every term is 0 or more, so a known 0 settles a minimum or
// a product even where another term is refused (decision 5). An unsupported
// rule on a record's own work or its own incoming links is never settled that
// way: several works on the part, a same-step cycle through it, a lag above 0,
// or finite shared support.
import { canonicalJson } from "../../core/canonical-json.js";
import { ConfigurationError, ModelInvalidError } from "../../core/errors.js";
import * as Q from "../../core/rational.js";
import { attempt, mergeRefusals, need, ok, refused, refusalsOf } from "../../core/refusal.js";
import { evalPartRule } from "../../core/rules.js";
import { run } from "../../core/run.js";
import { isGap } from "../../core/schema/types.js";
import { validateModel, validateScenario } from "../../core/schema/validate.js";
import { seriesAt } from "../../core/series.js";
import { sha256OfString } from "../../core/sha256.js";
import { traceHash } from "../../core/trace.js";
import { SCHEMA_VERSION } from "../../core/version.js";
import { validateWorkAttachment } from "./attachment.js";
import { WORK_VERSION } from "./trace.js";
function byId(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function k2(a, b) {
    return `${a}|${b}`;
}
// ---------------------------------------------------------------- refusals (ids start work/: decision 9)
function workRefusal(category, subject, message, proposal, more = {}) {
    return { id: `work/${category} ${subject}`, category, message, proposal, path: more.path, canon: more.canon, question: more.question };
}
const gapIn = (path, note) => workRefusal('unknown-prerequisite', path, `unknown at ${path}: ${note}`, 'P-WORK-01', { path });
const severalWorks = (part, n) => workRefusal('unsupported-rule', `several works on ${part}`, `part '${part}' has ${n} works: how one recipe is shared between them is not given in this release (decision 8)`, 'P-WORK-01');
const sameStepCycle = (members) => workRefusal('unsupported-rule', `same-step cycle ${members.join(',')}`, `the enabled links among ${members.map((m) => `'${m}'`).join(', ')} form a same-step cycle: no order of evaluation is given, and none is chosen`, 'P-DEP-01');
const lagged = (l) => workRefusal('unsupported-rule', `lag ${l.part}->${l.feeds}`, `the link from '${l.part}' to '${l.feeds}' has a lag of ${l.lagSteps}: lagged links are not given in this release (D-3)`, 'P-DEP-01');
const exhaustible = (l) => workRefusal('unsupported-rule', `exhaustible support ${l.part}->${l.feeds}`, `the link from '${l.part}' to '${l.feeds}' is declared as finite shared support: how the upstream work is divided between its recipients is not given (D-4)`, 'P-DEP-01');
const negativeReference = (work) => workRefusal('unsupported-rule', `negative reference output ${work}`, `the reference output of '${work}' computes below 0, which no valid document gives (decision 6)`, 'P-WORK-01');
const separateCase = (part) => workRefusal('unsupported-rule', `separate case ${part}`, `part '${part}' sets its own access: a separate case, not computed in the base run, so it has no receipt or unit count to read`, 'P-WORK-01', { canon: 'CANON 3 (C3.5)', question: 'Q-014' });
/** Refusals a core helper raised while reading the attachment's own rules take the work/ prefix too. */
function own(v) {
    if (v.ok)
        return v;
    return refused(v.refusals.map((x) => (x.path?.startsWith('$.works') === true && !x.id.startsWith('work/')
        ? { ...x, id: `work/${x.id}`, proposal: x.proposal ?? 'P-WORK-01' } : x)));
}
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
    refusal(id) {
        return this.seen.get(id)?.refusal;
    }
}
// ---------------------------------------------------------------- arithmetic on terms that are 0 or more
/** The least of terms that are each 0 or more: a known 0 settles it (decision 5); otherwise any refused term refuses it. */
function least(terms) {
    if (terms.some((x) => x.ok && Q.isZero(x.v)))
        return ok(Q.ZERO);
    const bad = refusalsOf(...terms);
    if (bad.length > 0)
        return refused(bad);
    return ok(terms.map((x) => x.v).reduce((a, b) => Q.min(a, b)));
}
/** A product of terms that are each 0 or more: a known 0 factor settles it (decision 5). */
function times(a, b) {
    if ((a.ok && Q.isZero(a.v)) || (b.ok && Q.isZero(b.v)))
        return ok(Q.ZERO);
    if (!a.ok || !b.ok)
        return refused(refusalsOf(a, b));
    return ok(Q.mul(a.v, b.v));
}
/** Division by a positive constant keeps a 0 and keeps a refusal. */
function over(a, d) {
    return a.ok ? ok(Q.div(a.v, d)) : a;
}
// ---------------------------------------------------------------- order of evaluation
/**
 * The members of each same-step cycle among the links, and an order in which
 * every part comes after its upstream parts outside its own cycle (ties by id).
 */
function evaluationOrder(parts, links) {
    const next = new Map(parts.map((p) => [p, []]));
    for (const l of links)
        next.get(l.part)?.push(l.feeds);
    const reach = (from) => {
        const seen = new Set();
        const stack = [...(next.get(from) ?? [])];
        while (stack.length > 0) {
            const p = stack.pop();
            if (seen.has(p))
                continue;
            seen.add(p);
            stack.push(...(next.get(p) ?? []));
        }
        return seen;
    };
    const reaches = new Map(parts.map((p) => [p, reach(p)]));
    const cycleOf = new Map();
    for (const p of parts) {
        const from = reaches.get(p);
        if (cycleOf.has(p) || !from.has(p))
            continue;
        const members = parts.filter((q) => from.has(q) && reaches.get(q).has(p)).sort(byId);
        const r = sameStepCycle(members);
        for (const m of members)
            cycleOf.set(m, r);
    }
    // Without the links inside a cycle the graph has no cycle.
    const edges = links.filter((l) => !(cycleOf.has(l.part) && cycleOf.get(l.part) === cycleOf.get(l.feeds)));
    const waiting = new Map(parts.map((p) => [p, 0]));
    for (const l of edges)
        waiting.set(l.feeds, waiting.get(l.feeds) + 1);
    const ready = parts.filter((p) => waiting.get(p) === 0);
    const order = [];
    while (ready.length > 0) {
        ready.sort(byId);
        const p = ready.shift();
        order.push(p);
        for (const l of edges) {
            if (l.part !== p)
                continue;
            const n = waiting.get(l.feeds) - 1;
            waiting.set(l.feeds, n);
            if (n === 0)
                ready.push(l.feeds);
        }
    }
    if (order.length !== parts.length)
        throw new Error('work: the evaluation order left a part out (a defect)');
    return { order, cycleOf };
}
export function startWork(model, scenario, attachment, attachmentSha256, sources) {
    const notes = new Notes();
    const fromBase = (x) => {
        if (!('refused' in x))
            return ok(Q.parseRational(x.v));
        return refused(x.refused.map((id) => {
            const r = sources.describe(id);
            if (!r)
                throw new ConfigurationError(`the base trace refuses a value for '${id}' and does not describe it`);
            return r;
        }));
    };
    const tv = (tag, v, t) => (v.ok ? { t: tag, v: Q.toCanonical(v.v) } : { t: tag, refused: notes.note(v.refusals, t) });
    const partById = new Map(model.parts.map((p) => [p.id, p]));
    const worksOf = new Map();
    for (const w of attachment.works.slice().sort((a, b) => byId(a.part, b.part) || byId(a.work, b.work))) {
        worksOf.set(w.part, [...(worksOf.get(w.part) ?? []), w]);
    }
    const parts = [...worksOf.keys()].sort(byId);
    const links = attachment.links.slice().sort((a, b) => byId(a.part, b.part) || byId(a.feeds, b.feeds));
    const into = new Map();
    for (const l of links)
        into.set(l.feeds, [...(into.get(l.feeds) ?? []), l]);
    const { order, cycleOf } = evaluationOrder(parts, links);
    const seriesOf = (part, load) => scenario.loads.find((x) => x.part === part && x.load === load)?.entries ?? [];
    const loadAt = (part, load, t) => sources.load?.(part, load, t) ?? seriesAt(seriesOf(part, load), t, `$.loads.${part}.${load}`);
    const referenceOutput = (w, t) => {
        const rule = w.referenceOutputRule;
        const path = `$.works.${w.work}.referenceOutputRule`;
        if (isGap(rule))
            return refused([gapIn(path, rule.note)]);
        const v = own(attempt(() => evalPartRule(rule, path, (load) => need(loadAt(w.part, load, t)), () => {
            throw new Error('work: a reference-output rule never reads units (a defect)');
        })));
        return v.ok && Q.isNegative(v.v) ? refused([negativeReference(w.work)]) : v;
    };
    const capacityOf = (w, part, unit) => {
        const c = w.capacity;
        if (isGap(c))
            return refused([gapIn(`$.works.${w.work}.capacity`, c.note)]);
        if (c.kind === 'constant')
            return ok(c.value);
        if (part.setsOwnAccess)
            return refused([separateCase(part.id)]);
        if (!unit)
            throw new ConfigurationError(`the base trace has no unit count for '${part.id}'`);
        // Decision 3: the units at the start of the step, as the base trace records them.
        return times(ok(c.perUnit), fromBase(unit.units));
    };
    const availableOf = (part, resource, records) => {
        if (part.setsOwnAccess)
            return { tag: 'computed', v: refused([separateCase(part.id)]) };
        const left = records.get(k2(part.id, resource))?.remainderForWork;
        if (!left)
            throw new ConfigurationError(`the base trace has no remainder for work for '${part.id}' and '${resource}'`);
        return { tag: left.t, v: fromBase(left) };
    };
    const steps = [];
    const stepOf = (step) => {
        const t = step.step;
        if (t !== steps.length || t >= scenario.steps)
            throw new Error(`work: step ${t} taken out of order (expected ${steps.length} of ${scenario.steps}; a defect)`);
        const records = new Map(step.parts.map((p) => [k2(p.part, p.resource), p]));
        const units = new Map(step.units.map((u) => [u.part, u]));
        const output = new Map();
        const capOf = new Map();
        const workRecords = [];
        for (const p of order) {
            const part = partById.get(p);
            const ws = worksOf.get(p);
            const several = ws.length > 1 ? [severalWorks(p, ws.length)] : [];
            const cycle = cycleOf.get(p);
            const linkRefusals = [];
            const caps = (into.get(p) ?? []).map((l) => {
                let cap;
                if (l.lagSteps > 0) {
                    const x = lagged(l);
                    linkRefusals.push(x);
                    cap = refused([x]);
                }
                else if (l.semantics === 'exhaustible-support') {
                    const x = exhaustible(l);
                    linkRefusals.push(x);
                    cap = refused([x]);
                }
                else if (cycle !== undefined && cycleOf.get(l.part) === cycle) {
                    cap = refused([cycle]);
                }
                else {
                    cap = over(output.get(l.part), l.ratio);
                }
                capOf.set(k2(l.part, l.feeds), cap);
                return { from: l.part, cap };
            });
            // Unsupported rules on this part's own work or links: never settled by a known 0.
            const unsupported = mergeRefusals(several, cycle ? [cycle] : [], linkRefusals);
            let single;
            for (const w of ws) {
                const ref = referenceOutput(w, t);
                const capacity = capacityOf(w, part, units.get(p));
                const y = isGap(w.yield) ? refused([gapIn(`$.works.${w.work}.yield`, w.yield.note)]) : ok(w.yield);
                const resources = w.recipe.slice().sort((a, b) => byId(a.resource, b.resource)).map((e) => {
                    const available = availableOf(part, e.resource, records);
                    const limit = several.length > 0 ? refused(several) : over(available.v, e.perWorkUnit);
                    return { resource: e.resource, available, limit };
                });
                const limited = several.length > 0 ? refused(several) : least(resources.map((r) => r.limit));
                const yielded = several.length > 0 ? refused(several) : times(y, limited);
                const pre = several.length > 0 ? refused(several) : least([ref, capacity, yielded]);
                const capValues = caps.map((c) => c.cap);
                const actual = unsupported.length > 0
                    ? refused(mergeRefusals(unsupported, refusalsOf(pre, ...capValues)))
                    : least([pre, ...capValues]);
                const notDone = ref.ok && actual.ok ? ok(Q.positivePart(Q.sub(ref.v, actual.v))) : refused(refusalsOf(ref, actual));
                const actualTV = tv('computed', actual, t);
                const terms = [
                    ['reference-output', ref], ['capacity', capacity], ['yielded-resource-output', yielded],
                    ...caps.map((c) => [`dependency:${c.from}`, c.cap]),
                ];
                const binding = 'refused' in actualTV ? { refused: actualTV.refused } : {
                    known: terms.filter(([, v]) => v.ok && actual.ok && Q.eq(v.v, actual.v)).map(([label]) => label),
                    unresolved: terms.filter(([, v]) => !v.ok).map(([label]) => label),
                };
                const rule = w.referenceOutputRule;
                workRecords.push({
                    part: p,
                    work: w.work,
                    workUnit: w.workUnit,
                    referenceOutput: tv(isGap(rule) || rule.kind === 'constant' ? 'input' : 'computed', ref, t),
                    capacity: tv(isGap(w.capacity) || w.capacity.kind === 'constant' ? 'input' : 'computed', capacity, t),
                    yield: tv('input', y, t),
                    resources: resources.map((r) => ({ resource: r.resource, available: tv(r.available.tag, r.available.v, t), recipeLimit: tv('computed', r.limit, t) })),
                    resourceLimitedOutput: tv('computed', limited, t),
                    yieldedResourceOutput: tv('computed', yielded, t),
                    preDependencyOutput: tv('computed', pre, t),
                    dependencyCaps: caps.map((c) => ({ from: c.from, cap: tv('computed', c.cap, t) })),
                    actualOutput: actualTV,
                    workNotDone: tv('computed', notDone, t),
                    binding,
                });
                single = actual;
            }
            output.set(p, several.length > 0 ? refused(several) : single);
        }
        const linkRecords = links.map((l) => ({
            part: l.part,
            feeds: l.feeds,
            workUnits: { part: l.workUnits.part, feeds: l.workUnits.feeds },
            ratio: Q.toCanonical(l.ratio),
            lagSteps: l.lagSteps,
            semantics: l.semantics,
            cap: tv('computed', capOf.get(k2(l.part, l.feeds)), t),
        }));
        workRecords.sort((a, b) => byId(a.part, b.part) || byId(a.work, b.work));
        const record = { step: t, mode: step.mode, works: workRecords, links: linkRecords };
        steps.push(record);
        return record;
    };
    const finish = (base) => {
        if (steps.length !== scenario.steps)
            throw new Error(`work: finished after ${steps.length} of ${scenario.steps} steps (a defect)`);
        const s = base.stamp;
        return {
            stamp: {
                workVersion: WORK_VERSION,
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
                attachment: { id: attachment.id, version: attachment.attachmentVersion, sha256: attachmentSha256 },
                proposals: attachment.proposals.map((p) => ({ id: p.id, version: p.version })).sort((a, b) => byId(a.id, b.id)),
            },
            steps,
            refusals: notes.summary(),
            questions: notes.questions(),
        };
    };
    return { step: stepOf, describe: (id) => notes.refusal(id), finish };
}
/**
 * The work trace for a base trace, from the model and scenario the base run
 * read and a validated attachment. Pure: it reads the base trace and writes
 * nothing to it.
 */
export function workFromTrace(model, scenario, base, attachment, attachmentSha256) {
    const s = base.stamp;
    if (s.schemaVersion !== SCHEMA_VERSION || s.mapping.id !== model.id || attachment.model !== model.id ||
        s.mapping.sha256 !== attachment.modelSha256 || s.scenario.id !== scenario.id || base.steps.length !== scenario.steps) {
        throw new ConfigurationError('the base trace, its model and scenario, and the work attachment do not belong together (decision 10)');
    }
    const described = new Map(base.refusals.map((x) => [x.id, {
            id: x.id, category: x.category, message: x.message, canon: x.canon, question: x.question, proposal: x.proposal, path: x.path,
        }]));
    const cursor = startWork(model, scenario, attachment, attachmentSha256, { describe: (id) => described.get(id) });
    for (const step of base.steps)
        cursor.step(step);
    return cursor.finish(base);
}
/**
 * Validate the attachment against the model and its digest, run the unchanged
 * base engine once, and compute the work from that trace alone. Throws only
 * where the run cannot be initialised (ModelInvalidError, ConfigurationError);
 * every work value it cannot compute is refused in the result.
 */
export function runWork(modelDoc, scenarioDoc, attachmentDoc, options = {}) {
    const mv = validateModel(modelDoc);
    if (!mv.ok || !mv.model)
        throw new ModelInvalidError('model', mv.issues);
    const sv = validateScenario(scenarioDoc, mv.model);
    if (!sv.ok || !sv.scenario)
        throw new ModelInvalidError('scenario', sv.issues);
    const av = validateWorkAttachment(attachmentDoc, mv.model, sha256OfString(canonicalJson(modelDoc)));
    if (!av.ok || !av.attachment)
        throw new ModelInvalidError('work attachment', av.issues);
    const base = run(modelDoc, scenarioDoc, options);
    return { base, work: workFromTrace(mv.model, sv.scenario, base, av.attachment, sha256OfString(canonicalJson(attachmentDoc))) };
}
