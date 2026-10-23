// P-LOAD-02, tracking only (handoff v0.1, approved 2026-10-20): a ledger of
// eligible carryable obligations, computed after the run and apart from it,
// from a finished base trace and the work trace computed from it. Nothing here
// writes to either trace, and no ledger value reaches a load, a requirement, a
// reference output, a draw, a unit count or a level. For each account and step:
//   B_t     opening balance (B_0 as mapped; after that, the closing balance before)
//   N_t     new admissions in the step (an entry holds until the next)
//   D_t     = B_t + N_t, the eligible obligations available to complete
//   R_t,O_t the work record's reference and actual output, unchanged
//   C_t     = O_t, only where every closure guard holds
//   W_t     = 0, as the mapping asserts
//   B_{t+1} = D_t - C_t - W_t
// so that B_t + N_t = C_t + W_t + B_{t+1}, in exact rationals. The closure
// guards: the eligibility, one-to-one closure and zero-withdrawal claims are
// not unknown; D_t, R_t and O_t are known; R_t <= D_t; not D_t = 0 with O_t
// above 0; and, for an indivisible account, O_t a whole number. There is no
// known-zero rule here: an output of 0 never stands in for an unknown balance or
// claim. A refused closing balance refuses every later balance of the account,
// with no restart; other accounts are unaffected.
import { canonicalJson } from "../../core/canonical-json.js";
import { AccountingError, ConfigurationError, ModelInvalidError } from "../../core/errors.js";
import * as Q from "../../core/rational.js";
import { mergeRefusals, ok, refused, refusalsOf } from "../../core/refusal.js";
import { isGap } from "../../core/schema/types.js";
import { validateModel } from "../../core/schema/validate.js";
import { seriesAt } from "../../core/series.js";
import { sha256OfString } from "../../core/sha256.js";
import { traceHash } from "../../core/trace.js";
import { ENGINE_VERSION, SCHEMA_VERSION } from "../../core/version.js";
import { validateWorkAttachment } from "../work/attachment.js";
import { resolveMultiwork, runWork } from "../work/run-work.js";
import { checkMultiworkAccounts } from "../multiwork/attachment.js";
import { outstandingBounds } from "../multiwork/bound.js";
import { WORK_VERSION, workTraceHash } from "../work/trace.js";
import { BACKLOG_PROPOSAL, claimsOf, validateBacklogAttachment } from "./attachment.js";
import { BACKLOG_VERSION } from "./trace.js";
function byId(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
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
}
export function startBacklog(attachment, attachmentSha256, stepCount, sources) {
    const fail = (why) => {
        throw new ConfigurationError(`P-LOAD-02: ${why}; the backlog ledger is not computed`);
    };
    const accounts = attachment.accounts.slice().sort((x, y) => byId(x.account, y.account));
    const recordOf = (step, acc) => {
        const r = step.works.find((x) => x.part === acc.part && x.work === acc.work);
        if (!r)
            return fail(`the work trace has no record for work '${acc.work}' of '${acc.part}' at step ${step.step}`);
        if (r.workUnit !== acc.obligationUnit)
            fail(`account '${acc.account}' counts '${acc.obligationUnit}', and its work counts '${r.workUnit}'`);
        return r;
    };
    const notes = new Notes();
    const kinds = new Map();
    const fromWork = (x) => {
        if (!('refused' in x))
            return ok(Q.parseRational(x.v));
        return refused(x.refused.map((id) => sources.describe(id) ?? fail(`the work trace refuses a value for '${id}' and does not describe it`)));
    };
    const tv = (tag, v, t) => (v.ok ? { t: tag, v: Q.toCanonical(v.v) } : { t: tag, refused: notes.note(v.refusals, t) });
    const backlogRefusal = (kind, category, subject, message, path) => {
        const r = { id: `backlog/${category} ${subject}`, category, message, proposal: BACKLOG_PROPOSAL.id, path };
        kinds.set(r.id, kind);
        return r;
    };
    const gapIn = (path, note) => backlogRefusal('unknown-ledger-input', 'unknown-prerequisite', path, `unknown at ${path}: ${note}`, path);
    /** Refusals the core's series rule raised for the attachment's own series take the backlog/ prefix. */
    const own = (v) => {
        if (v.ok)
            return v;
        return refused(v.refusals.map((x) => (x.path?.startsWith('$.accounts') === true && !x.id.startsWith('backlog/')
            ? backlogRefusal('unknown-ledger-input', x.category, x.path, x.message, x.path) : x)));
    };
    const ledgers = accounts.map((acc) => {
        const a = acc.account;
        const unknownClaim = (claim, kind) => backlogRefusal(kind, 'unknown-prerequisite', `unknown ${claim} claim of ${a}`, `account '${a}': the evidence for its ${claim} claim is unknown, so what depends on it is refused`, `$.accounts.${a}`);
        const status = new Map(claimsOf(acc));
        const isUnknown = (claim) => status.get(claim)?.status === 'unknown';
        // An unknown eligibility, closure or withdrawal claim refuses completions; an unknown count refuses that count.
        const gate = ['eligibility', 'closure', 'withdrawals'].filter(isUnknown).map((c) => unknownClaim(c, 'closure-guard'));
        const opening0 = isGap(acc.openingBalance.value)
            ? refused([gapIn(`$.accounts.${a}.openingBalance.value`, acc.openingBalance.value.note)])
            : isUnknown('opening balance') ? refused([unknownClaim('opening balance', 'unknown-ledger-input')]) : ok(acc.openingBalance.value);
        const admissionsUnknown = isUnknown('admissions') ? [unknownClaim('admissions', 'unknown-ledger-input')] : [];
        const withdrawals = isUnknown('withdrawals') ? refused([unknownClaim('withdrawals', 'closure-guard')]) : ok(Q.ZERO);
        const conditionalOn = claimsOf(acc).filter(([, ev]) => ev.status === 'assumed' || ev.status === 'estimated').map(([c, ev]) => `${c}: ${ev.status}`);
        const referenceAbove = backlogRefusal('closure-guard', 'unsupported-rule', `reference output above eligible obligations ${a}`, `account '${a}': the work's reference output exceeds the eligible obligations available, so its output is not read as completions (no clamping, no invented obligations)`);
        const positiveWithNone = backlogRefusal('closure-guard', 'unsupported-rule', `positive output with no eligible obligations ${a}`, `account '${a}': the work's output is above 0 with no eligible obligation to complete, so it is not read as completions`);
        const fractional = backlogRefusal('indivisible-fractional-closure', 'unsupported-rule', `fractional closure of indivisible obligations ${a}`, `account '${a}': the work's output is not a whole number, and its obligations are indivisible: no partial completion or rounding is given`);
        return { acc, gate, opening0, admissionsUnknown, withdrawals, conditionalOn, referenceAbove, positiveWithNone, fractional };
    });
    const ledgerOf = new Map(ledgers.map((l) => [l.acc.account, l]));
    const opening = new Map(ledgers.map((l) => [l.acc.account, l.opening0]));
    const admissionsAt = (l, t) => (l.admissionsUnknown.length > 0
        ? refused(l.admissionsUnknown)
        : own(seriesAt(l.acc.admissions.perStep, t, `$.accounts.${l.acc.account}.admissions.perStep`)));
    const eligibleOf = (B, N) => (B.ok && N.ok ? ok(Q.add(B.v, N.v)) : refused(refusalsOf(B, N)));
    const steps = [];
    const stepOf = (step) => {
        const t = step.step;
        if (t !== steps.length || t >= stepCount)
            throw new Error(`backlog: step ${t} taken out of order (expected ${steps.length} of ${stepCount}; a defect)`);
        const records = ledgers.map((l) => {
            const acc = l.acc;
            const wr = recordOf(step, acc);
            const B = opening.get(acc.account);
            const N = admissionsAt(l, t);
            const D = eligibleOf(B, N);
            const R = fromWork(wr.referenceOutput);
            const O = fromWork(wr.actualOutput);
            let C;
            if (!D.ok || !R.ok || !O.ok) {
                C = refused(mergeRefusals(l.gate, refusalsOf(D, R, O)));
            }
            else {
                const guards = [];
                if (Q.isZero(D.v) && Q.isPositive(O.v))
                    guards.push(l.positiveWithNone);
                if (Q.gt(R.v, D.v))
                    guards.push(l.referenceAbove);
                if (acc.divisibility === 'indivisible' && !Q.isInteger(O.v))
                    guards.push(l.fractional);
                const all = mergeRefusals(l.gate, guards);
                if (all.length > 0)
                    C = refused(all);
                else {
                    if (Q.gt(O.v, D.v))
                        throw new AccountingError(`P-LOAD-02: account '${acc.account}' completes more than is eligible at step ${t}`);
                    C = O;
                }
            }
            const W = l.withdrawals;
            let closing;
            if (D.ok && C.ok && W.ok && B.ok && N.ok) {
                const left = Q.sub(Q.sub(D.v, C.v), W.v);
                if (Q.isNegative(left) || !Q.eq(Q.add(B.v, N.v), Q.add(Q.add(C.v, W.v), left))) {
                    throw new AccountingError(`P-LOAD-02: account '${acc.account}' does not reconcile at step ${t}`);
                }
                closing = ok(left);
            }
            else {
                closing = refused(refusalsOf(D, C, W));
            }
            opening.set(acc.account, closing);
            const ids = new Set();
            for (const v of [B, N, D, C, W, closing])
                if (!v.ok)
                    for (const x of v.refusals)
                        ids.add(x.id);
            const diagnostics = new Set();
            // The ledger's own refusals first: in a coupled run they come back to it through the generated load (P-COUPLE-01).
            for (const id of ids)
                diagnostics.add(kinds.get(id) ?? (sources.describe(id) !== undefined ? 'inherited-work-refusal' : 'unknown-ledger-input'));
            if (l.conditionalOn.length > 0)
                diagnostics.add('conditional-evidence');
            return {
                account: acc.account,
                part: acc.part,
                work: acc.work,
                obligationUnit: acc.obligationUnit,
                divisibility: acc.divisibility,
                openingBalance: tv(t === 0 ? 'input' : 'computed', B, t),
                admissions: tv('input', N, t),
                eligible: tv('computed', D, t),
                referenceOutput: tv(wr.referenceOutput.t, R, t),
                actualOutput: tv(wr.actualOutput.t, O, t),
                workBinding: wr.binding,
                completions: tv('computed', C, t),
                withdrawals: tv('input', W, t),
                closingBalance: tv('computed', closing, t),
                conditionalOn: l.conditionalOn,
                diagnostics: [...diagnostics].sort(byId),
            };
        });
        const record = { step: t, accounts: records };
        steps.push(record);
        return record;
    };
    const eligible = (account) => {
        const l = ledgerOf.get(account);
        if (!l)
            return fail(`no account '${account}'`);
        return eligibleOf(opening.get(account), admissionsAt(l, steps.length));
    };
    const finish = (base, work) => {
        if (steps.length !== stepCount)
            throw new Error(`backlog: finished after ${steps.length} of ${stepCount} steps (a defect)`);
        const b = base.stamp;
        const w = work.stamp;
        return {
            stamp: {
                backlogVersion: BACKLOG_VERSION,
                proposal: { id: BACKLOG_PROPOSAL.id, version: BACKLOG_PROPOSAL.version },
                base: {
                    engineVersion: b.engineVersion,
                    schemaVersion: b.schemaVersion,
                    canonFingerprint: { canon: b.canonFingerprint.canon, application: b.canonFingerprint.application },
                    traceSha256: traceHash(base),
                    mapping: { id: b.mapping.id, sha256: b.mapping.sha256 },
                    scenario: { id: b.scenario.id, sha256: b.scenario.sha256 },
                    steps: b.steps,
                },
                work: {
                    workVersion: w.workVersion,
                    traceSha256: workTraceHash(work),
                    attachment: { id: w.attachment.id, version: w.attachment.version, sha256: w.attachment.sha256 },
                    proposals: w.proposals.map((p) => ({ id: p.id, version: p.version })),
                },
                attachment: { id: attachment.id, version: attachment.attachmentVersion, sha256: attachmentSha256 },
                accounts: ledgers.map((l) => ({
                    account: l.acc.account,
                    part: l.acc.part,
                    work: l.acc.work,
                    obligationUnit: l.acc.obligationUnit,
                    divisibility: l.acc.divisibility,
                    claims: claimsOf(l.acc).map(([claim, ev]) => ({ claim, status: ev.status, source: ev.source })),
                    conditionalOn: l.conditionalOn,
                })),
            },
            steps,
            refusals: notes.summary(),
            questions: notes.questions(),
        };
    };
    return { eligible, step: stepOf, finish };
}
/**
 * The backlog trace for a base trace and the work trace computed from it, from
 * a validated backlog attachment. Pure: it reads both traces and writes nothing
 * to them. Throws ConfigurationError where the traces and the attachment do
 * not belong together; every ledger value it cannot compute is refused.
 */
export function backlogFromTraces(base, work, attachment, attachmentSha256) {
    const b = base.stamp;
    const w = work.stamp;
    const fail = (why) => {
        throw new ConfigurationError(`P-LOAD-02: ${why}; the backlog ledger is not computed`);
    };
    if (b.engineVersion !== ENGINE_VERSION || b.schemaVersion !== SCHEMA_VERSION)
        fail(`the base trace is engine ${b.engineVersion}, schema ${b.schemaVersion}, not ${ENGINE_VERSION}`);
    if (w.workVersion !== WORK_VERSION)
        fail(`the work trace is version ${w.workVersion}, not ${WORK_VERSION}`);
    if (traceHash(base) !== w.base.traceSha256)
        fail('the work trace was not computed from this base trace');
    if (attachment.model !== b.mapping.id || attachment.modelSha256 !== b.mapping.sha256)
        fail('the backlog attachment was mapped against another model revision than the base run');
    const wa = attachment.workAttachment;
    if (wa.id !== w.attachment.id || wa.version !== w.attachment.version || wa.sha256 !== w.attachment.sha256)
        fail('the backlog attachment names another work attachment than the work trace read');
    if (work.steps.length !== base.steps.length)
        fail('the work trace and the base trace have different step counts');
    for (const acc of attachment.accounts.slice().sort((x, y) => byId(x.account, y.account))) {
        const r = work.steps[0]?.works.find((x) => x.part === acc.part && x.work === acc.work);
        if (!r)
            fail(`the work trace has no record for work '${acc.work}' of '${acc.part}' at step 0`);
        else if (r.workUnit !== acc.obligationUnit)
            fail(`account '${acc.account}' counts '${acc.obligationUnit}', and its work counts '${r.workUnit}'`);
    }
    const inherited = new Map(work.refusals.map((x) => [x.id, {
            id: x.id, category: x.category, message: x.message, canon: x.canon, question: x.question, proposal: x.proposal, path: x.path,
        }]));
    const cursor = startBacklog(attachment, attachmentSha256, base.steps.length, { describe: (id) => inherited.get(id) });
    for (const step of work.steps)
        cursor.step(step);
    return cursor.finish(base, work);
}
/**
 * Validate the model, the work attachment and the backlog attachment, compute
 * the base and work traces with one `runWork` call, and the ledger from them.
 * Throws only where a run cannot be initialised (ModelInvalidError,
 * ConfigurationError); every ledger value it cannot compute is refused.
 */
export function runBacklog(modelDoc, scenarioDoc, workAttachmentDoc, backlogAttachmentDoc, options = {}) {
    const mv = validateModel(modelDoc);
    if (!mv.ok || !mv.model)
        throw new ModelInvalidError('model', mv.issues);
    const modelSha256 = sha256OfString(canonicalJson(modelDoc));
    const wv = validateWorkAttachment(workAttachmentDoc, mv.model, modelSha256);
    if (!wv.ok || !wv.attachment)
        throw new ModelInvalidError('work attachment', wv.issues);
    const workSha256 = sha256OfString(canonicalJson(workAttachmentDoc));
    const bv = validateBacklogAttachment(backlogAttachmentDoc, mv.model, modelSha256, wv.attachment, workSha256);
    if (!bv.ok || !bv.attachment)
        throw new ModelInvalidError('backlog attachment', bv.issues);
    const multiwork = resolveMultiwork(options, mv.model, modelSha256, wv.attachment, workSha256);
    if (multiwork) {
        const issues = checkMultiworkAccounts(multiwork.attachment, bv.attachment);
        if (issues.some((i) => i.severity === 'error'))
            throw new ModelInvalidError('multiwork attachment', issues);
    }
    const { base, work } = runWork(modelDoc, scenarioDoc, workAttachmentDoc, options);
    const backlog = backlogFromTraces(base, work, bv.attachment, sha256OfString(canonicalJson(backlogAttachmentDoc)));
    return { base, work, backlog, ...(multiwork ? { multiwork: outstandingBounds(wv.attachment, multiwork, work, backlog) } : {}) };
}
