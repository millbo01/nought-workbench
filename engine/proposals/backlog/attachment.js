// P-LOAD-02, tracking only (handoff v0.1, approved 2026-10-20): the backlog
// attachment. A separate document, bound to one model revision and one work
// attachment by their ids, versions and digests, that maps eligible carryable
// obligation accounts onto P-WORK-01 works. It is reusable across scenarios:
// the trace hashes of a particular run are checked and recorded in the
// backlog trace, not fixed here. Nothing in it changes the model, the scenario,
// the work attachment or any trace. Parsing rejects unknown fields; validation
// rejects what cannot be tracked as mapped, and flags what is accepted but
// refused, or computed only conditionally, when the ledger runs.
import * as Q from "../../core/rational.js";
import { readArray, readId, readInteger, readObject, readOptString, readOrGap, readRationalValue, readString, Reader } from "../../core/schema/parse.js";
import { isGap } from "../../core/schema/types.js";
export const BACKLOG_ATTACHMENT_VERSION = '0.1.0';
/** The proposal a backlog attachment enables, at the handoff version this engine computes. */
export const BACKLOG_PROPOSAL = { id: 'P-LOAD-02', version: '0.1' };
/** The five central claims of an account, in a fixed order, with their evidence. */
export function claimsOf(a) {
    return [
        ['eligibility', a.eligibility.evidence],
        ['closure', a.closure.evidence],
        ['withdrawals', a.withdrawals.evidence],
        ['opening balance', a.openingBalance.evidence],
        ['admissions', a.admissions.evidence],
    ];
}
const STATUSES = ['documented', 'estimated', 'assumed', 'unknown'];
const DIVISIBILITY = ['indivisible', 'divisible'];
const P = 'P-LOAD-02';
/** A required, non-empty text. */
function readText(r, o, key, path) {
    const s = readString(r, o, key, path);
    if (s !== undefined && s.trim() === '') {
        r.error(`${path}.${key}`, 'missing-field', `'${key}' must say something`);
        return undefined;
    }
    return s;
}
function present(r, o, key, path) {
    if (o[key] !== undefined)
        return true;
    r.error(`${path}.${key}`, 'missing-field', `'${key}' is required`);
    return false;
}
function readEvidence(r, o, path) {
    if (!present(r, o, 'evidence', path))
        return undefined;
    const e = readObject(r, o['evidence'], `${path}.evidence`, ['status', 'source']);
    if (!e)
        return undefined;
    const status = e['status'];
    if (!STATUSES.includes(status)) {
        r.error(`${path}.evidence.status`, 'backlog-evidence', "evidence is 'documented', 'estimated', 'assumed' or 'unknown'", undefined, P);
    }
    const source = readText(r, e, 'source', `${path}.evidence`);
    return STATUSES.includes(status) && source !== undefined ? { status: status, source } : undefined;
}
function readClaim(r, o, key, path, fields) {
    if (!present(r, o, key, path))
        return undefined;
    const p = `${path}.${key}`;
    const c = readObject(r, o[key], p, [...fields, 'evidence']);
    if (!c)
        return undefined;
    const texts = {};
    let ok = true;
    for (const f of fields) {
        if (f === 'oneToOne' || f === 'zeroEveryStep' || f === 'value' || f === 'perStep')
            continue;
        const s = readText(r, c, f, p);
        if (s === undefined)
            ok = false;
        else
            texts[f] = s;
    }
    const evidence = readEvidence(r, c, p);
    return ok && evidence ? { texts, evidence, raw: c } : undefined;
}
function readAccount(r, v, path) {
    const o = readObject(r, v, path, ['account', 'part', 'work', 'obligationUnit', 'divisibility', 'eligibility', 'closure', 'withdrawals', 'openingBalance', 'admissions', 'label', 'rationale']);
    if (!o)
        return undefined;
    const account = readId(r, o, 'account', path);
    const part = readId(r, o, 'part', path);
    const work = readId(r, o, 'work', path);
    const obligationUnit = readText(r, o, 'obligationUnit', path);
    const divisibility = o['divisibility'];
    if (!DIVISIBILITY.includes(divisibility)) {
        r.error(`${path}.divisibility`, 'backlog-divisibility', "divisibility is 'indivisible' or 'divisible', stated explicitly", undefined, P);
    }
    const eligibility = readClaim(r, o, 'eligibility', path, ['definition', 'carryable', 'boundary']);
    const closure = readClaim(r, o, 'closure', path, ['oneToOne', 'statement']);
    if (closure && closure.raw['oneToOne'] !== true) {
        r.error(`${path}.closure.oneToOne`, 'backlog-closure', 'the closure correspondence must state oneToOne: true: one unit of actual output is one completed eligible obligation', undefined, P);
    }
    const withdrawals = readClaim(r, o, 'withdrawals', path, ['zeroEveryStep', 'statement']);
    if (withdrawals && withdrawals.raw['zeroEveryStep'] !== true) {
        r.error(`${path}.withdrawals.zeroEveryStep`, 'backlog-withdrawals', 'this release allows only no withdrawals in any step, asserted as zeroEveryStep: true; an omission is not a zero', undefined, P);
    }
    const opening = readClaim(r, o, 'openingBalance', path, ['value']);
    const openingValue = opening && present(r, opening.raw, 'value', `${path}.openingBalance`)
        ? readOrGap(r, opening.raw['value'], `${path}.openingBalance.value`, (x, q) => readRationalValue(r, x, q)) : undefined;
    const admissions = readClaim(r, o, 'admissions', path, ['perStep']);
    const perStep = admissions ? readArray(r, admissions.raw, 'perStep', `${path}.admissions`, (x, q) => {
        const e = readObject(r, x, q, ['step', 'value']);
        if (!e)
            return undefined;
        const step = readInteger(r, e, 'step', q, 0);
        const value = readOrGap(r, e['value'], `${q}.value`, (y, s) => readRationalValue(r, y, s));
        return step !== undefined && value !== undefined ? { step, value } : undefined;
    }) : [];
    if (!account || !part || !work || obligationUnit === undefined || !DIVISIBILITY.includes(divisibility) ||
        !eligibility || !closure || !withdrawals || !opening || openingValue === undefined || !admissions)
        return undefined;
    return {
        account, part, work, obligationUnit, divisibility: divisibility,
        eligibility: { definition: eligibility.texts['definition'], carryable: eligibility.texts['carryable'], boundary: eligibility.texts['boundary'], evidence: eligibility.evidence },
        closure: { oneToOne: true, statement: closure.texts['statement'], evidence: closure.evidence },
        withdrawals: { zeroEveryStep: true, statement: withdrawals.texts['statement'], evidence: withdrawals.evidence },
        openingBalance: { value: openingValue, evidence: opening.evidence },
        admissions: { perStep, evidence: admissions.evidence },
        label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
    };
}
/** Read an untrusted JSON document into a backlog attachment, collecting every issue with its path. */
export function parseBacklogAttachment(doc) {
    const r = new Reader();
    const o = readObject(r, doc, '$', ['attachmentVersion', 'id', 'label', 'rationale', 'model', 'modelSha256', 'workAttachment', 'proposals', 'accounts']);
    if (!o)
        return { issues: r.issues };
    const path = '$';
    const attachmentVersion = readString(r, o, 'attachmentVersion', path);
    const id = readId(r, o, 'id', path);
    const model = readId(r, o, 'model', path);
    const modelSha256 = readString(r, o, 'modelSha256', path);
    const hex = (s, p, what) => {
        if (s !== undefined && !/^[0-9a-f]{64}$/.test(s))
            r.error(p, 'backlog-digest', `${what} is 64 lower-case hex digits`, undefined, P);
    };
    hex(modelSha256, `${path}.modelSha256`, "the model's digest (RunStamp.mapping.sha256)");
    const w = present(r, o, 'workAttachment', path) ? readObject(r, o['workAttachment'], `${path}.workAttachment`, ['id', 'version', 'sha256']) : undefined;
    const workId = w && readId(r, w, 'id', `${path}.workAttachment`);
    const workVersion = w && readString(r, w, 'version', `${path}.workAttachment`);
    const workSha = w && readString(r, w, 'sha256', `${path}.workAttachment`);
    hex(workSha, `${path}.workAttachment.sha256`, "the work attachment's digest (WorkRunStamp.attachment.sha256)");
    const proposals = readArray(r, o, 'proposals', path, (v, p) => {
        const e = readObject(r, v, p, ['id', 'version']);
        if (!e)
            return undefined;
        const pid = readString(r, e, 'id', p);
        const version = readString(r, e, 'version', p);
        return pid !== undefined && version !== undefined ? { id: pid, version } : undefined;
    });
    const accounts = readArray(r, o, 'accounts', path, (v, p) => readAccount(r, v, p));
    if (!r.ok || attachmentVersion === undefined || !id || !model || modelSha256 === undefined || !workId || workVersion === undefined || workSha === undefined) {
        return { issues: r.issues };
    }
    return {
        attachment: {
            attachmentVersion, id, model, modelSha256, workAttachment: { id: workId, version: workVersion, sha256: workSha }, proposals, accounts,
            label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
        },
        issues: r.issues,
    };
}
/** Checks of a parsed backlog attachment against its model and its work attachment, with their exact digests. */
export function checkBacklogAttachment(a, model, modelSha256, work, workSha256) {
    const r = new Reader();
    if (a.attachmentVersion !== BACKLOG_ATTACHMENT_VERSION) {
        r.error('$.attachmentVersion', 'backlog-version', `this engine reads backlog attachments ${BACKLOG_ATTACHMENT_VERSION}, not '${a.attachmentVersion}'`, undefined, P);
    }
    if (a.model !== model.id)
        r.error('$.model', 'backlog-model', `the attachment names model '${a.model}', not '${model.id}'`, undefined, P);
    else if (a.modelSha256 !== modelSha256) {
        r.error('$.modelSha256', 'backlog-model-digest', 'the attachment was mapped against another revision of this model: review it against this one', undefined, P);
    }
    const wa = a.workAttachment;
    if (wa.id !== work.id || wa.version !== work.attachmentVersion || wa.sha256 !== workSha256) {
        r.error('$.workAttachment', 'backlog-work-attachment', `the attachment names work attachment '${wa.id}' version '${wa.version}' with another digest than the one supplied ('${work.id}', '${work.attachmentVersion}'): review it against that one`, undefined, P);
    }
    if (work.model !== model.id)
        r.error('$.workAttachment', 'backlog-work-attachment', `the work attachment names model '${work.model}', not '${model.id}'`, undefined, P);
    const listed = new Set();
    a.proposals.forEach((p, i) => {
        const path = `$.proposals[${i}]`;
        if (p.id !== BACKLOG_PROPOSAL.id)
            r.error(`${path}.id`, 'backlog-proposal', `a backlog attachment enables only ${BACKLOG_PROPOSAL.id}, not '${p.id}'`);
        else if (p.version !== BACKLOG_PROPOSAL.version)
            r.error(`${path}.version`, 'backlog-proposal', `this engine computes ${BACKLOG_PROPOSAL.id} at version ${BACKLOG_PROPOSAL.version}, not '${p.version}'`, undefined, P);
        if (listed.has(p.id))
            r.error(`${path}.id`, 'duplicate-id', `'${p.id}' is listed twice`);
        listed.add(p.id);
    });
    if (!listed.has(BACKLOG_PROPOSAL.id))
        r.error('$.proposals', 'backlog-proposal', `the attachment must enable ${BACKLOG_PROPOSAL.id}: that is its opt-in`, undefined, P);
    const ids = new Set();
    const pairs = new Set();
    a.accounts.forEach((acc, i) => {
        const path = `$.accounts[${i}]`;
        if (ids.has(acc.account))
            r.error(`${path}.account`, 'duplicate-id', `account '${acc.account}' is mapped twice`);
        ids.add(acc.account);
        const pair = `${acc.part}|${acc.work}`;
        if (pairs.has(pair)) {
            r.error(path, 'backlog-double-registration', `the work '${acc.work}' of '${acc.part}' already has an account: one eligible account per part and work in this release`, undefined, P);
        }
        pairs.add(pair);
        const w = work.works.find((x) => x.part === acc.part && x.work === acc.work);
        if (!w) {
            r.error(path, 'backlog-account-work', `the work attachment maps no work '${acc.work}' on part '${acc.part}'`, undefined, P);
        }
        else if (w.workUnit !== acc.obligationUnit) {
            r.error(`${path}.obligationUnit`, 'backlog-unit', `the obligation unit '${acc.obligationUnit}' is not the work's unit '${w.workUnit}': no conversion is implied`, undefined, P);
        }
        const whole = acc.divisibility === 'indivisible';
        const amount = (x, p, what) => {
            if (isGap(x))
                return;
            if (Q.isNegative(x))
                r.error(p, 'negative', `a negative ${what}`, undefined, P);
            else if (whole && !Q.isInteger(x)) {
                r.error(p, 'backlog-integral', `an indivisible obligation is counted in whole units, so a ${what} of ${Q.toCanonical(x)} is not accepted (no rounding)`, undefined, P);
            }
        };
        amount(acc.openingBalance.value, `${path}.openingBalance.value`, 'opening balance');
        const entries = acc.admissions.perStep;
        if (entries.length === 0 || entries[0]?.step !== 0)
            r.error(`${path}.admissions.perStep`, 'series-start', 'every series starts at step 0');
        for (let j = 1; j < entries.length; j++) {
            if (entries[j].step <= entries[j - 1].step)
                r.error(`${path}.admissions.perStep[${j}]`, 'series-order', 'series steps must strictly increase');
        }
        entries.forEach((e, j) => amount(e.value, `${path}.admissions.perStep[${j}].value`, 'number of admissions'));
        for (const [claim, ev] of claimsOf(acc)) {
            if (ev.status === 'unknown') {
                r.flag(path, 'backlog-unknown-claim', `account '${acc.account}': the ${claim} claim's evidence is unknown, so what depends on it is refused`, undefined, P);
            }
            else if (ev.status !== 'documented') {
                r.flag(path, 'backlog-conditional', `account '${acc.account}': the ${claim} claim is ${ev.status}, so its results are conditional on it`, undefined, P);
            }
        }
    });
    return r.issues;
}
/** Parse and check a backlog attachment against its model and work attachment, each with its exact digest. */
export function validateBacklogAttachment(doc, model, modelSha256, work, workSha256) {
    const parsed = parseBacklogAttachment(doc);
    if (!parsed.attachment)
        return { ok: false, issues: parsed.issues };
    const issues = [...parsed.issues, ...checkBacklogAttachment(parsed.attachment, model, modelSha256, work, workSha256)];
    const ok = !issues.some((i) => i.severity === 'error');
    return { ok, issues, attachment: ok ? parsed.attachment : undefined };
}
