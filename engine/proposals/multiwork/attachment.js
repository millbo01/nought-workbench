// P-MULTIWORK-01 (first release, approved 2026-10-21): several works on one
// part, drawing on one finite productive balance (what is left for work once
// upkeep is covered) under an explicitly mapped work-allocation arrangement.
// The arrangement is a separate, versioned document, mapped against one model
// and one work attachment by their exact digests. For each part it names the
// shared resource, every work on the part with its divisibility, and a dated
// schedule of arrangements: fixed shares (amounts or fractions of the balance,
// with what happens to unused amounts stated) or a strict order. An
// arrangement may be an explicit gap: then no work-level result is given. The
// schedule is the work layer's own: it never changes, and is never changed
// by, the base run's modes, settings or order. Parsing rejects unknown fields,
// so a typo never becomes a default.
import * as Q from "../../core/rational.js";
import { readArray, readId, readInteger, readObject, readOptString, readOrGap, readRational, readString, Reader } from "../../core/schema/parse.js";
import { isGap } from "../../core/schema/types.js";
export const MULTIWORK_ATTACHMENT_VERSION = '0.1.0';
export const MULTIWORK_PROPOSAL = { id: 'P-MULTIWORK-01', version: '0.1' };
const P = MULTIWORK_PROPOSAL.id;
const STATUSES = ['documented', 'estimated', 'assumed', 'unknown'];
function readText(r, o, key, path) {
    const s = readString(r, o, key, path);
    if (s !== undefined && s.trim() === '') {
        r.error(`${path}.${key}`, 'missing-field', `'${key}' must say something`);
        return undefined;
    }
    return s;
}
function readEvidence(r, v, path) {
    const o = readObject(r, v, path, ['status', 'source']);
    if (!o)
        return undefined;
    const status = o['status'];
    if (!STATUSES.includes(status)) {
        r.error(`${path}.status`, 'multiwork-evidence', "evidence status is 'documented', 'estimated', 'assumed' or 'unknown'", undefined, P);
        return undefined;
    }
    const source = readText(r, o, 'source', path);
    return source === undefined ? undefined : { status: status, source };
}
function readIds(r, o, key, path) {
    return readArray(r, o, key, path, (v, p) => (typeof v === 'string' && v.trim() !== '' ? v : (r.error(p, 'bad-id', 'a work id'), undefined)));
}
function readShareList(r, o, path) {
    return readArray(r, o, 'of', path, (v, p) => {
        const e = readObject(r, v, p, ['work', 'value']);
        if (!e)
            return undefined;
        const work = readId(r, e, 'work', p);
        const value = readRational(r, e, 'value', p);
        return work && value ? { work, value } : undefined;
    });
}
function readShares(r, v, path) {
    const kind = typeof v === 'object' && v !== null ? v['kind'] : undefined;
    if (kind === 'amount') {
        const o = readObject(r, v, path, ['kind', 'of', 'whenBalanceBelow']);
        if (!o)
            return undefined;
        const of = readShareList(r, o, path);
        const below = o['whenBalanceBelow'];
        if (below !== 'refuse' && below !== 'scale-down') {
            r.error(`${path}.whenBalanceBelow`, 'multiwork-shares', "amount shares state what happens when the balance is below their sum: 'refuse' or 'scale-down' (there is no default)", undefined, P);
            return undefined;
        }
        return { kind: 'amount', of, whenBalanceBelow: below };
    }
    if (kind === 'fraction') {
        const o = readObject(r, v, path, ['kind', 'of']);
        return o ? { kind: 'fraction', of: readShareList(r, o, path) } : undefined;
    }
    r.error(path, 'multiwork-shares', "shares are { kind: 'amount', of, whenBalanceBelow } or { kind: 'fraction', of }", undefined, P);
    return undefined;
}
function readUnused(r, v, path) {
    const kind = typeof v === 'object' && v !== null ? v['kind'] : undefined;
    if (kind === 'idle')
        return readObject(r, v, path, ['kind']) ? { kind: 'idle' } : undefined;
    if (kind === 'passed-on') {
        const o = readObject(r, v, path, ['kind', 'order']);
        return o ? { kind: 'passed-on', order: readIds(r, o, 'order', path) } : undefined;
    }
    r.error(path, 'multiwork-unused', "what happens to unused amounts is stated: { kind: 'idle' } or { kind: 'passed-on', order } (there is no default)", undefined, P);
    return undefined;
}
function readArrangement(r, v, path) {
    const form = typeof v === 'object' && v !== null ? v['form'] : undefined;
    if (form === 'fixed-shares') {
        const o = readObject(r, v, path, ['form', 'shares', 'unused', 'evidence']);
        if (!o)
            return undefined;
        const shares = readShares(r, o['shares'], `${path}.shares`);
        const unused = readUnused(r, o['unused'], `${path}.unused`);
        const evidence = readEvidence(r, o['evidence'], `${path}.evidence`);
        return shares && unused && evidence ? { form: 'fixed-shares', shares, unused, evidence } : undefined;
    }
    if (form === 'strict-priority') {
        const o = readObject(r, v, path, ['form', 'order', 'evidence']);
        if (!o)
            return undefined;
        const order = readIds(r, o, 'order', path);
        const evidence = readEvidence(r, o['evidence'], `${path}.evidence`);
        return evidence ? { form: 'strict-priority', order, evidence } : undefined;
    }
    r.error(path, 'multiwork-form', "an arrangement's form is 'fixed-shares' or 'strict-priority' in this release, or the arrangement is a gap", undefined, P);
    return undefined;
}
function readArrangedWork(r, v, path) {
    const o = readObject(r, v, path, ['work', 'divisibility', 'wholeUnits']);
    if (!o)
        return undefined;
    const work = readId(r, o, 'work', path);
    if (o['divisibility'] === undefined) {
        r.error(`${path}.divisibility`, 'missing-field', "'divisibility' is required: 'indivisible', 'divisible', or { \"gap\": \"<note>\" } where it is not known");
        return undefined;
    }
    const divisibility = readOrGap(r, o['divisibility'], `${path}.divisibility`, (x, p) => {
        if (x === 'indivisible' || x === 'divisible')
            return x;
        r.error(p, 'multiwork-divisibility', "divisibility is 'indivisible' or 'divisible', or a gap", undefined, P);
        return undefined;
    });
    let wholeUnits;
    if (o['wholeUnits'] !== undefined) {
        const w = readObject(r, o['wholeUnits'], `${path}.wholeUnits`, ['rule', 'evidence']);
        if (w) {
            if (w['rule'] !== 'most-whole-units-within-allocation') {
                r.error(`${path}.wholeUnits.rule`, 'multiwork-whole-units', "the one whole-unit rule in this release is 'most-whole-units-within-allocation'", undefined, P);
            }
            const evidence = readEvidence(r, w['evidence'], `${path}.wholeUnits.evidence`);
            if (evidence && w['rule'] === 'most-whole-units-within-allocation')
                wholeUnits = { rule: 'most-whole-units-within-allocation', evidence };
        }
    }
    return work && divisibility ? { work, divisibility, ...(wholeUnits ? { wholeUnits } : {}) } : undefined;
}
function readPart(r, v, path) {
    const o = readObject(r, v, path, ['part', 'resource', 'works', 'schedule', 'rationale']);
    if (!o)
        return undefined;
    const part = readId(r, o, 'part', path);
    const resource = readId(r, o, 'resource', path);
    const works = readArray(r, o, 'works', path, (x, p) => readArrangedWork(r, x, p));
    const schedule = readArray(r, o, 'schedule', path, (x, p) => {
        const e = readObject(r, x, p, ['fromStep', 'arrangement', 'label']);
        if (!e)
            return undefined;
        const fromStep = readInteger(r, e, 'fromStep', p, 0);
        if (e['arrangement'] === undefined) {
            r.error(`${p}.arrangement`, 'missing-field', "'arrangement' is required (write { \"gap\": \"<note>\" } where it is not known)");
            return undefined;
        }
        const arrangement = readOrGap(r, e['arrangement'], `${p}.arrangement`, (y, q) => readArrangement(r, y, q));
        return fromStep !== undefined && arrangement ? { fromStep, arrangement, label: readOptString(r, e, 'label', p) } : undefined;
    });
    return part && resource ? { part, resource, works, schedule, rationale: readOptString(r, o, 'rationale', path) } : undefined;
}
/** Read an untrusted JSON document into a multiwork attachment, collecting every issue with its path. */
export function parseMultiworkAttachment(doc) {
    const r = new Reader();
    const o = readObject(r, doc, '$', ['attachmentVersion', 'id', 'label', 'rationale', 'model', 'modelSha256', 'workAttachment', 'proposals', 'parts']);
    if (!o)
        return { issues: r.issues };
    const path = '$';
    const attachmentVersion = readString(r, o, 'attachmentVersion', path);
    const id = readId(r, o, 'id', path);
    const model = readId(r, o, 'model', path);
    const modelSha256 = readString(r, o, 'modelSha256', path);
    const wa = readObject(r, o['workAttachment'], `${path}.workAttachment`, ['id', 'version', 'sha256']);
    const workAttachment = wa ? { id: readId(r, wa, 'id', `${path}.workAttachment`), version: readString(r, wa, 'version', `${path}.workAttachment`), sha256: readString(r, wa, 'sha256', `${path}.workAttachment`) } : undefined;
    const proposals = readArray(r, o, 'proposals', path, (v, p) => {
        const e = readObject(r, v, p, ['id', 'version']);
        if (!e)
            return undefined;
        const pid = readString(r, e, 'id', p);
        const version = readString(r, e, 'version', p);
        return pid !== undefined && version !== undefined ? { id: pid, version } : undefined;
    });
    const parts = readArray(r, o, 'parts', path, (v, p) => readPart(r, v, p));
    if (!r.ok || attachmentVersion === undefined || !id || !model || modelSha256 === undefined || !workAttachment?.id || workAttachment.version === undefined || workAttachment.sha256 === undefined) {
        return { issues: r.issues };
    }
    return {
        attachment: {
            attachmentVersion, id, model, modelSha256, workAttachment: { id: workAttachment.id, version: workAttachment.version, sha256: workAttachment.sha256 }, proposals, parts,
            label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
        },
        issues: r.issues,
    };
}
/** Each listed id once, and exactly the works given. */
function sameWorks(ids, works) {
    return ids.length === works.length && new Set(ids).size === ids.length && ids.every((x) => works.includes(x));
}
/** Checks of a parsed attachment against its model, its work attachment and their exact digests. */
export function checkMultiworkAttachment(a, model, modelSha256, work, workSha256) {
    const r = new Reader();
    if (a.attachmentVersion !== MULTIWORK_ATTACHMENT_VERSION) {
        r.error('$.attachmentVersion', 'multiwork-version', `this engine reads multiwork attachments ${MULTIWORK_ATTACHMENT_VERSION}, not '${a.attachmentVersion}'`, undefined, P);
    }
    if (a.model !== model.id)
        r.error('$.model', 'multiwork-model', `the attachment names model '${a.model}', not '${model.id}'`, undefined, P);
    else if (a.modelSha256 !== modelSha256)
        r.error('$.modelSha256', 'multiwork-model-digest', 'the attachment was mapped against another revision of this model: review it against this one', undefined, P);
    if (a.workAttachment.id !== work.id || a.workAttachment.version !== work.attachmentVersion) {
        r.error('$.workAttachment', 'multiwork-work-attachment', `the attachment names work attachment '${a.workAttachment.id}' ${a.workAttachment.version}, not '${work.id}' ${work.attachmentVersion}`, undefined, P);
    }
    else if (a.workAttachment.sha256 !== workSha256) {
        r.error('$.workAttachment.sha256', 'multiwork-work-attachment', 'the attachment was mapped against another revision of the work attachment: review it against this one', undefined, P);
    }
    if (a.proposals.length !== 1 || a.proposals[0]?.id !== P)
        r.error('$.proposals', 'multiwork-proposal', `a multiwork attachment enables ${P}, and nothing else: that is its opt-in`, undefined, P);
    else if (a.proposals[0].version !== MULTIWORK_PROPOSAL.version)
        r.error('$.proposals[0].version', 'multiwork-proposal', `this engine computes ${P} at version ${MULTIWORK_PROPOSAL.version}, not '${a.proposals[0].version}'`, undefined, P);
    const seenParts = new Set();
    a.parts.forEach((pa, i) => {
        const path = `$.parts[${i}]`;
        if (seenParts.has(pa.part))
            r.error(`${path}.part`, 'duplicate-id', `part '${pa.part}' is arranged twice`);
        seenParts.add(pa.part);
        const part = model.parts.find((p) => p.id === pa.part);
        if (!part) {
            r.error(`${path}.part`, 'unknown-reference', `no part '${pa.part}'`);
            return;
        }
        if (!model.resources.some((x) => x.id === pa.resource))
            r.error(`${path}.resource`, 'unknown-reference', `no resource '${pa.resource}'`);
        const onPart = work.works.filter((w) => w.part === pa.part);
        if (onPart.length < 2)
            r.error(`${path}.part`, 'multiwork-single-work', `part '${pa.part}' has ${onPart.length} work${onPart.length === 1 ? '' : 's'} in the work attachment: an arrangement is for a part with several`, undefined, P);
        const listed = pa.works.map((w) => w.work);
        if (!sameWorks(listed, onPart.map((w) => w.work))) {
            r.error(`${path}.works`, 'multiwork-works', `the arrangement names each work on part '${pa.part}' once, and no other: ${onPart.map((w) => `'${w.work}'`).join(', ')}`, undefined, P);
        }
        for (const w of onPart) {
            const q = `${path}.works`;
            if (!w.recipe.some((e) => e.resource === pa.resource))
                r.error(q, 'multiwork-resource', `work '${w.work}' does not use '${pa.resource}': every work on an arranged part draws on the shared balance`, undefined, P);
            if (!isGap(w.capacity) && w.capacity.kind === 'per-unit') {
                r.flag(q, 'multiwork-per-unit', `work '${w.work}' has a per-unit capacity: the part's units would be counted once for each work, so it is accepted and refused when computed`, undefined, P);
            }
            for (const e of w.recipe) {
                if (e.resource === pa.resource)
                    continue;
                if (onPart.some((x) => x.work !== w.work && x.recipe.some((y) => y.resource === e.resource))) {
                    r.error(q, 'multiwork-shared-resources', `works on part '${pa.part}' also share '${e.resource}': one shared resource per part in this release`, undefined, P);
                }
            }
        }
        if (work.links.some((l) => l.part === pa.part || l.feeds === pa.part)) {
            r.flag(`${path}.part`, 'multiwork-link', `a functional link names part '${pa.part}', whose output is not one quantity under an arrangement: accepted and refused when computed`, undefined, P);
        }
        pa.works.forEach((w, j) => {
            const q = `${path}.works[${j}]`;
            if (isGap(w.divisibility))
                r.flag(`${q}.divisibility`, 'multiwork-unknown-divisibility', `work '${w.work}': divisibility is not known, so a fractional output is refused`, undefined, P);
            if (w.wholeUnits && w.divisibility !== 'indivisible')
                r.error(`${q}.wholeUnits`, 'multiwork-whole-units', `work '${w.work}': a whole-unit rule is for indivisible work only`, undefined, P);
            if (w.wholeUnits?.evidence.status === 'unknown')
                r.flag(`${q}.wholeUnits`, 'multiwork-whole-units', `work '${w.work}': the whole-unit rule's evidence is unknown, so it is not applied`, undefined, P);
        });
        if (pa.schedule.length === 0 || pa.schedule[0]?.fromStep !== 0)
            r.error(`${path}.schedule`, 'multiwork-schedule', 'the schedule starts at step 0: an arrangement, or a gap, from the first step', undefined, P);
        for (let j = 1; j < pa.schedule.length; j++) {
            if (pa.schedule[j].fromStep <= pa.schedule[j - 1].fromStep)
                r.error(`${path}.schedule[${j}].fromStep`, 'multiwork-schedule', 'schedule steps strictly increase', undefined, P);
        }
        pa.schedule.forEach((s, j) => {
            const q = `${path}.schedule[${j}].arrangement`;
            if (isGap(s.arrangement)) {
                r.flag(q, 'multiwork-unknown-arrangement', `part '${pa.part}' from step ${s.fromStep}: the arrangement is not known, so each work's output is refused`, undefined, P);
                return;
            }
            const ar = s.arrangement;
            if (ar.evidence.status === 'unknown')
                r.flag(`${q}.evidence`, 'multiwork-unknown-arrangement', `part '${pa.part}' from step ${s.fromStep}: the arrangement's evidence is unknown, so it is not applied and each work's output is refused`, undefined, P);
            else if (ar.evidence.status !== 'documented')
                r.flag(`${q}.evidence`, 'multiwork-conditional', `part '${pa.part}' from step ${s.fromStep}: the arrangement is ${ar.evidence.status}, so the results resting on it are conditional`, undefined, P);
            if (ar.form === 'strict-priority') {
                if (!sameWorks(ar.order, listed))
                    r.error(`${q}.order`, 'multiwork-order', 'a strict order names every work on the part once', undefined, P);
                return;
            }
            if (!sameWorks(ar.shares.of.map((x) => x.work), listed))
                r.error(`${q}.shares.of`, 'multiwork-shares', 'fixed shares name every work on the part once (0 where it has none)', undefined, P);
            if (ar.shares.of.some((x) => Q.isNegative(x.value)))
                r.error(`${q}.shares.of`, 'negative', 'a negative share', undefined, P);
            if (ar.shares.kind === 'fraction' && Q.gt(Q.sum(ar.shares.of.map((x) => x.value)), Q.ONE))
                r.error(`${q}.shares.of`, 'multiwork-shares', 'fractions of the balance sum to at most 1', undefined, P);
            if (ar.unused.kind === 'passed-on') {
                const order = ar.unused.order;
                if (order.length === 0 || new Set(order).size !== order.length || !order.every((x) => listed.includes(x))) {
                    r.error(`${q}.unused.order`, 'multiwork-unused', 'unused amounts are passed on to works of the part, each named once', undefined, P);
                }
            }
        });
    });
    return r.issues;
}
/** Where an account exists for an arranged work, the two state the same divisibility. */
export function checkMultiworkAccounts(a, backlog) {
    const r = new Reader();
    a.parts.forEach((pa, i) => pa.works.forEach((w, j) => {
        if (isGap(w.divisibility))
            return;
        const acc = backlog.accounts.find((x) => x.part === pa.part && x.work === w.work);
        if (acc && acc.divisibility !== w.divisibility) {
            r.error(`$.parts[${i}].works[${j}].divisibility`, 'multiwork-divisibility', `work '${w.work}' is ${w.divisibility} here, but its account '${acc.account}' is ${acc.divisibility}`, undefined, P);
        }
    }));
    return r.issues;
}
/** Parse and check a multiwork attachment against its model, its work attachment and their digests. */
export function validateMultiworkAttachment(doc, model, modelSha256, work, workSha256) {
    const parsed = parseMultiworkAttachment(doc);
    if (!parsed.attachment)
        return { ok: false, issues: parsed.issues };
    const issues = [...parsed.issues, ...checkMultiworkAttachment(parsed.attachment, model, modelSha256, work, workSha256)];
    const ok = !issues.some((i) => i.severity === 'error');
    return { ok, issues, attachment: ok ? parsed.attachment : undefined };
}
/** The arrangement in force at a step: the last schedule entry from that step or before. */
export function scheduleAt(schedule, step) {
    let found = schedule[0];
    for (const s of schedule)
        if (s.fromStep <= step)
            found = s;
    return found;
}
