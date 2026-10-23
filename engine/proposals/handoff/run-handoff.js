// P-HANDOFF-01 (approved in principle 2026-10-21; first release authorised):
// the handover run, by composition of the unchanged runners. Each handover
// gives its downstream account, as admissions, k times its upstream account's
// completions, in the same step or the next (as declared). Everything else is
// computed by runCoupled (or runBacklog, where nothing is coupled), unchanged:
// P-LOAD-02's ledger, its guards and its conservation, P-COUPLE-01's
// generated loads, P-WORK-01 and P-DEP-01.
//
// The runs are passes over derived documents. The backlog attachment is the
// mapped one with each downstream account's admissions series replaced by its
// own series plus what is handed over; a coupling attachment, where there is
// one, is re-bound to it. Pass 0 gives every handover an explicit gap (never
// an assumed 0); pass p gives each handover what its upstream completed in
// pass p - 1. The number of passes is fixed before any is run: one, plus the
// longest chain of dependence between forward-only handovers, which the
// analysis orders (handoffAnalysis). Nothing is repeated to converge. A
// handover that is not forward-only is refused in every pass, so it never
// varies. The last pass is the result. Two defect checks follow: every
// upstream account and part has the same figures in the last two passes (the
// upstream invariance the forward-only analysis promises), and each
// handover's conservation holds. Either failing throws: nothing that rests on
// a broken promise is returned.
import { canonicalJson } from "../../core/canonical-json.js";
import { AccountingError, ModelInvalidError } from "../../core/errors.js";
import * as Q from "../../core/rational.js";
import { ok, refused } from "../../core/refusal.js";
import { checkDrawPolicy } from "../../core/run.js";
import { resolveMultiwork } from "../work/run-work.js";
import { checkMultiworkAccounts } from "../multiwork/attachment.js";
import { isGap } from "../../core/schema/types.js";
import { validateModel } from "../../core/schema/validate.js";
import { seriesAt } from "../../core/series.js";
import { sha256OfString } from "../../core/sha256.js";
import { traceHash } from "../../core/trace.js";
import { validateBacklogAttachment } from "../backlog/attachment.js";
import { runBacklog } from "../backlog/ledger.js";
import { backlogTraceHash } from "../backlog/trace.js";
import { validateCouplingAttachment } from "../couple/attachment.js";
import { runCoupled } from "../couple/run-coupled.js";
import { couplingTraceHash } from "../couple/trace.js";
import { validateWorkAttachment } from "../work/attachment.js";
import { workTraceHash } from "../work/trace.js";
import { HANDOFF_PROPOSAL, handoffAnalysis, handoverClaims, handoverConditions, validateHandoffAttachment } from "./attachment.js";
import { HANDOFF_VERSION } from "./trace.js";
function byId(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
const sha = (doc) => sha256OfString(canonicalJson(doc));
const clone = (doc) => JSON.parse(JSON.stringify(doc));
const P = HANDOFF_PROPOSAL.id;
const RANK = { documented: 0, estimated: 1, assumed: 2, unknown: 3 };
const weakest = (xs) => xs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'documented');
/** A refusal from a pass's traces, described as its summary describes it. */
function describe(s) {
    return { id: s.id, category: s.category, message: s.message, canon: s.canon, question: s.question, proposal: s.proposal, path: s.path };
}
/**
 * Validate the documents and the handover attachment, and run the handovers
 * by composition: the delivered traces are those of the last pass, with the
 * handover trace that explains them and the derived documents they read (the
 * replay record). Throws where the run is not valid (ModelInvalidError), cannot
 * be configured (ConfigurationError), or where a defect check fails
 * (AccountingError); every value it cannot compute is refused in the result.
 */
export function runHandoff(modelDoc, scenarioDoc, workAttachmentDoc, backlogAttachmentDoc, couplingAttachmentDoc, handoffAttachmentDoc, options = {}) {
    const mv = validateModel(modelDoc);
    if (!mv.ok || !mv.model)
        throw new ModelInvalidError('model', mv.issues);
    const model = mv.model;
    const modelSha256 = sha(modelDoc);
    const wv = validateWorkAttachment(workAttachmentDoc, model, modelSha256);
    if (!wv.ok || !wv.attachment)
        throw new ModelInvalidError('work attachment', wv.issues);
    const work = wv.attachment;
    const bv = validateBacklogAttachment(backlogAttachmentDoc, model, modelSha256, work, sha(workAttachmentDoc));
    if (!bv.ok || !bv.attachment)
        throw new ModelInvalidError('backlog attachment', bv.issues);
    const backlog = bv.attachment;
    const backlogSha256 = sha(backlogAttachmentDoc);
    let coupling = null;
    if (couplingAttachmentDoc !== null) {
        const cv = validateCouplingAttachment(couplingAttachmentDoc, model, modelSha256, backlog, backlogSha256, work);
        if (!cv.ok || !cv.attachment)
            throw new ModelInvalidError('coupling attachment', cv.issues);
        coupling = { attachment: cv.attachment, sha256: sha(couplingAttachmentDoc) };
    }
    const hv = validateHandoffAttachment(handoffAttachmentDoc, model, modelSha256, backlog, backlogSha256, work, coupling);
    if (!hv.ok || !hv.attachment)
        throw new ModelInvalidError('handover attachment', hv.issues);
    checkDrawPolicy(options);
    const multiwork = resolveMultiwork(options, model, modelSha256, work, sha(workAttachmentDoc));
    if (multiwork) {
        const issues = checkMultiworkAccounts(multiwork.attachment, backlog);
        if (issues.some((i) => i.severity === 'error'))
            throw new ModelInvalidError('multiwork attachment', issues);
    }
    return composed(model, modelDoc, work, scenarioDoc, workAttachmentDoc, backlogAttachmentDoc, couplingAttachmentDoc, options, backlog, backlogSha256, coupling, { attachment: hv.attachment, sha256: sha(handoffAttachmentDoc) });
}
function composed(model, modelDoc, work, scenarioDoc, workDoc, backlogDoc, couplingDoc, options, backlog, backlogSha256, coupling, handoff) {
    const handovers = handoff.attachment.handovers.slice().sort((a, b) => byId(a.handover, b.handover));
    const analysis = new Map(handoffAnalysis(model, work, backlog, coupling?.attachment ?? null, handovers).map((x) => [x.handover, x]));
    const accepted = handovers.filter((h) => analysis.get(h.handover)?.forwardOnly === true);
    const passes = 1 + Math.max(0, ...accepted.map((h) => analysis.get(h.handover)?.pass));
    const accountOf = (id) => backlog.accounts.find((a) => a.account === id);
    const receivers = [...new Set(handovers.map((h) => h.to))].sort(byId);
    // The refusals a handover creates of its own.
    const notForwardOnly = new Map(handovers.map((h) => [h.handover, {
            id: `handoff/unsupported-rule not forward-only ${h.handover}`, category: 'unsupported-rule', proposal: P, path: `$.handovers.${h.handover}`,
            message: `handover '${h.handover}': ${analysis.get(h.handover)?.detail ?? 'not forward-only'}`,
        }]));
    const fractional = new Map(handovers.map((h) => [h.handover, {
            id: `handoff/unsupported-rule fractional handover into indivisible obligations ${h.handover}`, category: 'unsupported-rule', proposal: P, path: `$.handovers.${h.handover}`,
            message: `handover '${h.handover}': ${Q.toCanonical(h.correspondence.perCompletion)} x the completions of '${h.from}' is not a whole number, and '${h.to}' is indivisible: no partial obligation or rounding is given`,
        }]));
    const openingUnknown = new Map(handovers.map((h) => [h.handover, {
            id: `handoff/unknown-prerequisite opening in transit ${h.handover}`, category: 'unknown-prerequisite', proposal: P, path: `$.handovers.${h.handover}.openingInTransit`,
            message: `handover '${h.handover}': what is in transit at the start is unknown${h.openingInTransit && isGap(h.openingInTransit.value) ? ` (${h.openingInTransit.value.note})` : ''}, so '${h.to}''s admission at step 0 is refused`,
        }]));
    /** What each handover hands over and admits, from a pass's upstream completions. */
    const seriesOf = (h, pass) => {
        const described = new Map(pass.backlog.refusals.map((s) => [s.id, describe(s)]));
        const fromRecord = (t) => pass.backlog.steps[t]?.accounts.find((a) => a.account === h.from);
        const steps = pass.backlog.steps.length;
        const k = h.correspondence.perCompletion;
        const indivisible = accountOf(h.to).divisibility === 'indivisible';
        const completions = [];
        const handedOver = [];
        for (let t = 0; t < steps; t++) {
            const c = fromRecord(t)?.completions;
            if (!c)
                throw new AccountingError(`P-HANDOFF-01: no record of '${h.from}' at step ${t} (a defect)`);
            const C = 'refused' in c ? refused(c.refused.map((id) => described.get(id) ?? { id, category: 'unknown-prerequisite', message: id })) : ok(Q.parseRational(c.v));
            completions.push(C);
            if (!analysis.get(h.handover)?.forwardOnly)
                handedOver.push(refused([notForwardOnly.get(h.handover)]));
            else if (!C.ok)
                handedOver.push(C);
            else {
                const H = Q.mul(k, C.v);
                handedOver.push(indivisible && !Q.isInteger(H) ? refused([fractional.get(h.handover)]) : ok(H));
            }
        }
        const opening = () => {
            const o = h.openingInTransit;
            if (!analysis.get(h.handover)?.forwardOnly)
                return refused([notForwardOnly.get(h.handover)]);
            if (!o || isGap(o.value) || o.evidence.status === 'unknown')
                return refused([openingUnknown.get(h.handover)]);
            return ok(o.value);
        };
        const nextStep = h.timing.availability === 'next-step';
        const admitted = handedOver.map((x, t) => (nextStep ? (t === 0 ? opening() : handedOver[t - 1]) : x));
        const inTransit = handedOver.map((x) => (nextStep ? x : (analysis.get(h.handover)?.forwardOnly ? ok(Q.ZERO) : x)));
        return { completions, handedOver, admitted, inTransit };
    };
    /** The derived backlog attachment for a pass: each downstream account's own series plus what is handed over, step by step. */
    const derivedBacklog = (given, steps) => {
        const doc = clone(backlogDoc);
        for (const to of receivers) {
            const acc = accountOf(to);
            const into = handovers.filter((h) => h.to === to);
            const raw = doc.accounts.find((a) => a['account'] === to);
            const statuses = [acc.admissions.evidence.status, ...into.flatMap((h) => handoverClaims(h).filter(([c]) => c !== 'opening in transit').map(([, ev]) => ev.status)),
                ...into.flatMap((h) => handoverConditions(h, backlog, coupling?.attachment ?? null, handovers).map((c) => c.slice(c.lastIndexOf(': ') + 2)))];
            const source = `P-HANDOFF-01, derived: generated from ${into.map((h) => `the completions of '${h.from}' (handover '${h.handover}': ${Q.toCanonical(h.correspondence.perCompletion)} ${h.correspondence.toUnit} per ${h.correspondence.fromUnit} completed, ${h.timing.availability})`).join('; ')}, added to '${to}''s own admissions as mapped (${acc.admissions.evidence.status}: ${acc.admissions.evidence.source})`;
            let perStep;
            if (given === null) {
                // Pass 0: an explicit gap, never an assumed 0. A handover that is not forward-only says why.
                const refusedHere = into.filter((h) => !analysis.get(h.handover)?.forwardOnly).map((h) => notForwardOnly.get(h.handover).id);
                perStep = [{ step: 0, value: { gap: refusedHere.length > 0 ? `P-HANDOFF-01: ${refusedHere.join('; ')}` : 'P-HANDOFF-01: not yet computed (a provisional pass, never delivered)' } }];
            }
            else {
                perStep = [];
                for (let t = 0; t < steps; t++) {
                    const own = seriesAt(acc.admissions.perStep, t, `$.accounts.${to}.admissions.perStep`);
                    const parts = [own, ...into.map((h) => given.get(h.handover).admitted[t])];
                    const ids = [...new Set(parts.flatMap((x) => (x.ok ? [] : x.refusals.map((r) => r.id))))].sort(byId);
                    perStep.push({ step: t, value: ids.length > 0 ? { gap: `P-HANDOFF-01: ${ids.join('; ')}` } : Q.toCanonical(Q.sum(parts.map((x) => x.v))) });
                }
            }
            raw['admissions'] = { perStep, evidence: { status: weakest(statuses), source } };
        }
        return doc;
    };
    const derivedCoupling = (b) => {
        if (couplingDoc === null)
            return null;
        const c = clone(couplingDoc);
        c.backlogAttachment = { ...c.backlogAttachment, sha256: sha(b) };
        return c;
    };
    const runPass = (b, c) => {
        if (c === null) {
            const r = runBacklog(modelDoc, scenarioDoc, workDoc, b, options);
            return { ...r, coupling: null };
        }
        return runCoupled(modelDoc, scenarioDoc, workDoc, b, c, options);
    };
    // The passes: their number fixed above, before any is run.
    let docs = { backlog: derivedBacklog(null, 0), coupling: null };
    docs.coupling = derivedCoupling(docs.backlog);
    let previous = null;
    let current = runPass(docs.backlog, docs.coupling);
    const steps = current.base.steps.length;
    for (let p = 1; p < passes; p++) {
        const given = new Map(handovers.map((h) => [h.handover, seriesOf(h, current)]));
        const b = derivedBacklog(given, steps);
        docs = { backlog: b, coupling: derivedCoupling(b) };
        previous = current;
        current = runPass(docs.backlog, docs.coupling);
    }
    // Defect checks: the upstream is invariant across the last two passes, and every handover conserves.
    const final = new Map(handovers.map((h) => [h.handover, seriesOf(h, current)]));
    if (previous !== null) {
        const prev = previous;
        for (const h of accepted) {
            const part = accountOf(h.from).part;
            const upstream = (x) => canonicalJson([
                x.backlog.steps.map((s) => s.accounts.find((a) => a.account === h.from)),
                x.work.steps.map((s) => s.works.filter((w) => w.part === part)),
                x.base.steps.map((s) => [s.parts.filter((r) => r.part === part), s.units.filter((u) => u.part === part)]),
            ]);
            if (upstream(prev) !== upstream(current)) {
                throw new AccountingError(`P-HANDOFF-01: the figures of '${h.from}' and its part '${part}' differ between the last two passes, so handover '${h.handover}' is not forward-only as analysed (a defect); nothing is delivered`);
            }
        }
    }
    for (const h of accepted) {
        const s = final.get(h.handover);
        const all = [...s.completions, ...s.admitted, ...s.inTransit];
        if (!all.every((x) => x.ok))
            continue;
        const v = (x) => x.v;
        const k = h.correspondence.perCompletion;
        const opening = h.timing.availability === 'next-step' ? v(s.admitted[0]) : Q.ZERO;
        const left = Q.add(Q.mul(k, Q.sum(s.completions.map(v))), opening);
        const right = Q.add(Q.sum(s.admitted.map(v)), v(s.inTransit[s.inTransit.length - 1]));
        if (!Q.eq(left, right))
            throw new AccountingError(`P-HANDOFF-01: handover '${h.handover}' does not conserve: handed over ${Q.toCanonical(left)}, admitted and in transit ${Q.toCanonical(right)} (a defect)`);
    }
    return { ...current, handoff: traceOf(current, handovers, analysis, final, passes, backlog, backlogDoc, backlogSha256, coupling, docs, handoff), derived: { backlog: docs.backlog, coupling: docs.coupling } };
}
function traceOf(pass, handovers, analysis, series, passes, backlog, backlogDoc, backlogSha256, coupling, docs, handoff) {
    const seen = new Map();
    const tv = (tag, v, t) => {
        if (v.ok)
            return { t: tag, v: Q.toCanonical(v.v) };
        for (const r of v.refusals) {
            const s = seen.get(r.id);
            if (s) {
                s.last = Math.max(s.last, t);
                s.values += 1;
            }
            else
                seen.set(r.id, { refusal: r, first: t, last: t, values: 1 });
        }
        return { t: tag, refused: v.refusals.map((r) => r.id) };
    };
    const steps = pass.base.steps.map((_, t) => ({
        step: t,
        handovers: handovers.map((h) => {
            const s = series.get(h.handover);
            const nextStep = h.timing.availability === 'next-step';
            return {
                handover: h.handover, from: h.from, to: h.to,
                completions: tv('computed', s.completions[t], t),
                handedOver: tv('computed', s.handedOver[t], t),
                admitted: tv(nextStep && t === 0 ? 'input' : 'computed', s.admitted[t], t),
                inTransit: tv('computed', s.inTransit[t], t),
            };
        }),
    }));
    const partOf = (a) => backlog.accounts.find((x) => x.account === a)?.part;
    const stamps = handovers.map((h) => ({
        handover: h.handover, from: h.from, fromPart: partOf(h.from), to: h.to, toPart: partOf(h.to),
        perCompletion: Q.toCanonical(h.correspondence.perCompletion), fromUnit: h.correspondence.fromUnit, toUnit: h.correspondence.toUnit,
        availability: h.timing.availability,
        claims: [
            { claim: 'correspondence', statement: h.correspondence.statement, status: h.correspondence.evidence.status, source: h.correspondence.evidence.source },
            { claim: 'timing', statement: h.timing.statement, status: h.timing.evidence.status, source: h.timing.evidence.source },
            { claim: 'eligibility', statement: h.eligibility.statement, status: h.eligibility.evidence.status, source: h.eligibility.evidence.source },
            ...(h.openingInTransit ? [{ claim: 'opening in transit', statement: isGap(h.openingInTransit.value) ? `unknown: ${h.openingInTransit.value.note}` : `${Q.toCanonical(h.openingInTransit.value)} ${h.correspondence.toUnit} in transit before step 0`, status: h.openingInTransit.evidence.status, source: h.openingInTransit.evidence.source }] : []),
        ],
        downstreamCoupled: coupling?.attachment.bindings.some((b) => b.account === h.to) ?? false,
        conditionalOn: handoverConditions(h, backlog, coupling?.attachment ?? null, handovers),
        analysis: analysis.get(h.handover),
    }));
    const b = pass.base.stamp;
    const mappedBacklog = backlogDoc;
    const refusals = [...seen.keys()].sort(byId).map((id) => {
        const s = seen.get(id);
        const r = s.refusal;
        return { id, category: r.category, message: r.message, canon: r.canon, question: r.question, proposal: r.proposal, path: r.path, firstStep: s.first, lastStep: s.last, values: s.values };
    });
    return {
        stamp: {
            handoffVersion: HANDOFF_VERSION,
            proposal: { id: HANDOFF_PROPOSAL.id, version: HANDOFF_PROPOSAL.version },
            conditional: stamps.some((s) => s.conditionalOn.length > 0),
            passes,
            runner: coupling === null ? 'runBacklog' : 'runCoupled',
            base: { traceSha256: traceHash(pass.base), mapping: { id: b.mapping.id, sha256: b.mapping.sha256 }, scenario: { id: b.scenario.id, sha256: b.scenario.sha256 }, steps: b.steps, proposals: [...b.proposals] },
            work: { traceSha256: workTraceHash(pass.work), attachment: { ...pass.work.stamp.attachment } },
            backlog: {
                traceSha256: backlogTraceHash(pass.backlog),
                attachment: { id: mappedBacklog.id, version: mappedBacklog.attachmentVersion, sha256: sha(docs.backlog), derived: true },
                mapped: { id: backlog.id, version: backlog.attachmentVersion, sha256: backlogSha256 },
            },
            coupling: coupling === null || pass.coupling === null || docs.coupling === null ? null : {
                traceSha256: couplingTraceHash(pass.coupling),
                attachment: { id: coupling.attachment.id, version: coupling.attachment.attachmentVersion, sha256: sha(docs.coupling), derived: true },
                mapped: { id: coupling.attachment.id, version: coupling.attachment.attachmentVersion, sha256: coupling.sha256 },
            },
            attachment: { id: handoff.attachment.id, version: handoff.attachment.attachmentVersion, sha256: handoff.sha256 },
            handovers: stamps,
        },
        steps,
        refusals,
        questions: [...new Set(refusals.map((r) => r.question).filter((q) => q !== undefined))].sort(byId),
    };
}
