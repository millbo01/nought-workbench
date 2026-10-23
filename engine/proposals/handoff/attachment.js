// P-HANDOFF-01 (approved in principle by James, 2026-10-21; first release
// authorised; docs/p-handoff-01-scope.md): the work-handover attachment. A
// separate document, bound to one model revision, one backlog attachment and,
// where the run is coupled, one coupling attachment, by their ids, versions
// and digests. Each handover turns the completions of one P-LOAD-02 account
// (upstream) into admissions of another account on another part (downstream),
// under an explicit correspondence (k downstream obligations per upstream
// completion, in exactly the two accounts' units), timing (same-step or
// next-step: no default), eligibility, and, for next-step, the obligations in
// transit at the start. It moves counts of obligations, never resources.
//
// The forward-only analysis says, before anything is computed, what a
// downstream account's admissions can reach in a run, conservatively: its
// generated load (P-COUPLE-01), the part's draws and so every part drawing the
// same resources, the levels those reach (by what they measure, their producer
// or their signal route) and every rule reading those levels, the governor's
// bands and mode switches (which reach everything), P-DEP-01 links, and further
// handovers. A handover whose upstream account its own or a later handover's
// downstream admissions can reach lies on a cycle of dependence: it is accepted
// and refused when computed. No order is chosen, and nothing is iterated.
import * as Q from "../../core/rational.js";
import { levelRead } from "../../core/rules.js";
import { readArray, readId, readObject, readOptString, readOrGap, readRationalValue, readString, Reader } from "../../core/schema/parse.js";
import { isGap } from "../../core/schema/types.js";
import { claimsOf } from "../backlog/attachment.js";
export const HANDOFF_ATTACHMENT_VERSION = '0.1.0';
/** The proposal a handover attachment enables, at the contract version this engine computes. */
export const HANDOFF_PROPOSAL = { id: 'P-HANDOFF-01', version: '0.1' };
const STATUSES = ['documented', 'estimated', 'assumed', 'unknown'];
const AVAILABILITY = ['same-step', 'next-step'];
const P = 'P-HANDOFF-01';
function byId(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
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
        r.error(`${path}.evidence.status`, 'handoff-evidence', "evidence is 'documented', 'estimated', 'assumed' or 'unknown'", undefined, P);
    }
    const source = readText(r, e, 'source', `${path}.evidence`);
    return STATUSES.includes(status) && source !== undefined ? { status: status, source } : undefined;
}
/** A claim object: the listed fields, a statement and evidence. */
function readClaim(r, o, key, path, extra) {
    if (!present(r, o, key, path))
        return undefined;
    const c = readObject(r, o[key], `${path}.${key}`, [...extra, 'statement', 'evidence']);
    if (!c)
        return undefined;
    const statement = readText(r, c, 'statement', `${path}.${key}`);
    const evidence = readEvidence(r, c, `${path}.${key}`);
    return statement !== undefined && evidence ? { raw: c, statement, evidence } : undefined;
}
function readHandover(r, v, path) {
    const o = readObject(r, v, path, ['handover', 'from', 'to', 'correspondence', 'timing', 'eligibility', 'openingInTransit', 'label', 'rationale']);
    if (!o)
        return undefined;
    const handover = readId(r, o, 'handover', path);
    const from = readId(r, o, 'from', path);
    const to = readId(r, o, 'to', path);
    const corr = readClaim(r, o, 'correspondence', path, ['perCompletion', 'fromUnit', 'toUnit']);
    const k = corr && (present(r, corr.raw, 'perCompletion', `${path}.correspondence`) ? readRationalValue(r, corr.raw['perCompletion'], `${path}.correspondence.perCompletion`) : undefined);
    const fromUnit = corr && readText(r, corr.raw, 'fromUnit', `${path}.correspondence`);
    const toUnit = corr && readText(r, corr.raw, 'toUnit', `${path}.correspondence`);
    const timing = readClaim(r, o, 'timing', path, ['availability']);
    const availability = timing?.raw['availability'];
    if (timing && !AVAILABILITY.includes(availability)) {
        r.error(`${path}.timing.availability`, 'handoff-availability', "availability is 'same-step' or 'next-step': it is declared, never chosen by default", undefined, P);
    }
    const eligibility = readClaim(r, o, 'eligibility', path, []);
    let openingInTransit;
    if (o['openingInTransit'] !== undefined) {
        const t = readObject(r, o['openingInTransit'], `${path}.openingInTransit`, ['value', 'evidence']);
        const value = t && readOrGap(r, t['value'], `${path}.openingInTransit.value`, (x, p) => readRationalValue(r, x, p));
        const evidence = t && readEvidence(r, t, `${path}.openingInTransit`);
        if (value !== undefined && evidence)
            openingInTransit = { value, evidence };
    }
    if (!handover || !from || !to || !corr || k === undefined || fromUnit === undefined || toUnit === undefined || !timing ||
        !AVAILABILITY.includes(availability) || !eligibility)
        return undefined;
    return {
        handover, from, to,
        correspondence: { perCompletion: k, fromUnit, toUnit, statement: corr.statement, evidence: corr.evidence },
        timing: { availability: availability, statement: timing.statement, evidence: timing.evidence },
        eligibility: { statement: eligibility.statement, evidence: eligibility.evidence },
        openingInTransit,
        label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
    };
}
function readBound(r, o, key, path, what) {
    const b = readObject(r, o[key], `${path}.${key}`, ['id', 'version', 'sha256']);
    const id = b && readId(r, b, 'id', `${path}.${key}`);
    const version = b && readString(r, b, 'version', `${path}.${key}`);
    const sha256 = b && readString(r, b, 'sha256', `${path}.${key}`);
    if (sha256 !== undefined && !/^[0-9a-f]{64}$/.test(sha256))
        r.error(`${path}.${key}.sha256`, 'handoff-digest', `${what} is 64 lower-case hex digits`, undefined, P);
    return id && version !== undefined && sha256 !== undefined ? { id, version, sha256 } : undefined;
}
/** Read an untrusted JSON document into a handover attachment, collecting every issue with its path. */
export function parseHandoffAttachment(doc) {
    const r = new Reader();
    const o = readObject(r, doc, '$', ['attachmentVersion', 'id', 'label', 'rationale', 'model', 'modelSha256', 'backlogAttachment', 'couplingAttachment', 'proposals', 'handovers']);
    if (!o)
        return { issues: r.issues };
    const path = '$';
    const attachmentVersion = readString(r, o, 'attachmentVersion', path);
    const id = readId(r, o, 'id', path);
    const model = readId(r, o, 'model', path);
    const modelSha256 = readString(r, o, 'modelSha256', path);
    if (modelSha256 !== undefined && !/^[0-9a-f]{64}$/.test(modelSha256))
        r.error(`${path}.modelSha256`, 'handoff-digest', "the model's digest is 64 lower-case hex digits", undefined, P);
    const backlog = present(r, o, 'backlogAttachment', path) ? readBound(r, o, 'backlogAttachment', path, "the backlog attachment's digest") : undefined;
    // A run that only tracks names no coupling attachment: null, stated, never left out.
    let coupling;
    if (!present(r, o, 'couplingAttachment', path))
        coupling = undefined;
    else if (o['couplingAttachment'] === null)
        coupling = null;
    else
        coupling = readBound(r, o, 'couplingAttachment', path, "the coupling attachment's digest");
    const proposals = readArray(r, o, 'proposals', path, (v, p) => {
        const e = readObject(r, v, p, ['id', 'version']);
        if (!e)
            return undefined;
        const pid = readString(r, e, 'id', p);
        const version = readString(r, e, 'version', p);
        return pid !== undefined && version !== undefined ? { id: pid, version } : undefined;
    });
    const handovers = readArray(r, o, 'handovers', path, (v, p) => readHandover(r, v, p));
    if (!r.ok || attachmentVersion === undefined || !id || !model || modelSha256 === undefined || !backlog || coupling === undefined)
        return { issues: r.issues };
    return {
        attachment: {
            attachmentVersion, id, model, modelSha256, backlogAttachment: backlog, couplingAttachment: coupling, proposals, handovers,
            label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
        },
        issues: r.issues,
    };
}
// ---------------------------------------------------------------- the forward-only analysis
/** The resources a part's state can change the draw of: what it requires, keeps up, is set or routed, and rebuilds or loses units by. */
function resourcesOf(model, part) {
    const rs = new Set([...part.requirement.map((e) => e.resource), ...part.upkeep.map((e) => e.resource)]);
    for (const s of model.settings)
        if (s.part === part.id)
            rs.add(s.resource);
    for (const x of model.routes)
        if (x.to === part.id)
            rs.add(x.resource);
    if (part.setsOwnAccess && part.draws !== undefined && !isGap(part.draws))
        for (const d of part.draws)
            rs.add(d);
    for (const dial of [part.loadDials?.unitLossUnderShortfall, part.loadDials?.unitRebuilding]) {
        if (dial && !isGap(dial))
            for (const k of Object.keys(dial.parameters))
                if (k !== 'perStep')
                    rs.add(k);
    }
    return rs;
}
/**
 * What the admissions of `account` can reach in a run, conservatively: a
 * closure over accounts, parts, resources and levels, or 'everything' where a
 * level the governor's bands or mode switches read is reached.
 */
export function reachOf(model, work, backlog, coupling, handovers, account) {
    const parts = new Map(model.parts.map((p) => [p.id, p]));
    const draws = new Map(model.parts.map((p) => [p.id, resourcesOf(model, p)]));
    const reads = (rule, level) => !isGap(rule) && levelRead(rule) === level;
    const onResource = (m, rid) => {
        if (isGap(m))
            return false;
        if (m.of === 'received' || m.of === 'entering' || m.of === 'inflow')
            return m.resource === rid;
        if (m.of === 'store-content')
            return model.stores.some((s) => s.id === m.store && s.resource === rid);
        return false;
    };
    const seen = new Set();
    const queue = [`account:${account}`];
    const add = (n) => {
        if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
        }
    };
    seen.add(queue[0]);
    while (queue.length > 0) {
        const node = queue.shift();
        const colon = node.indexOf(':');
        const kind = node.slice(0, colon);
        const id = node.slice(colon + 1);
        if (kind === 'account') {
            // Its generated load, and the levels measuring that load; and the accounts it hands over to.
            for (const b of coupling?.bindings ?? []) {
                if (b.account !== id)
                    continue;
                add(`part:${b.part}`);
                for (const l of model.levels)
                    if (!isGap(l.measures) && l.measures.of === 'load' && l.measures.part === b.part && l.measures.load === b.load)
                        add(`level:${l.id}`);
            }
            for (const h of handovers)
                if (h.from === id)
                    add(`account:${h.to}`);
        }
        else if (kind === 'part') {
            // Its work's accounts, its draws, the parts its work caps (P-DEP-01), and the levels it produces or that measure what it receives.
            for (const a of backlog.accounts)
                if (a.part === id)
                    add(`account:${a.account}`);
            for (const rid of draws.get(id) ?? [])
                add(`resource:${rid}`);
            for (const l of work.links)
                if (l.part === id)
                    add(`part:${l.feeds}`);
            for (const l of model.levels) {
                const byProducer = !isGap(l.producedBy) && l.producedBy === id;
                const received = !isGap(l.measures) && l.measures.of === 'received' && l.measures.part === id;
                if (byProducer || received)
                    add(`level:${l.id}`);
            }
        }
        else if (kind === 'resource') {
            // Every part drawing it (the shared flow's allocation, stores, routes, what is left), and every level on it.
            for (const [pid, rs] of draws)
                if (rs.has(id) && parts.has(pid))
                    add(`part:${pid}`);
            for (const l of model.levels) {
                const route = !isGap(l.route) && l.route.kind === 'shared-flow' && l.route.resource === id;
                if (onResource(l.measures, id) || route)
                    add(`level:${l.id}`);
            }
        }
        else if (kind === 'level') {
            // What reads the level: a switch or a band reaches every mode and setting, so everything.
            if (model.thresholdSwitches.some((s) => s.level === id) || model.governor.bands.some((b) => b.level === id))
                return ['everything'];
            for (const s of model.settings)
                if (reads(s.rule, id)) {
                    add(`part:${s.part}`);
                    add(`resource:${s.resource}`);
                }
            for (const x of model.routes)
                if (reads(x.capacity, id)) {
                    add(`part:${x.to}`);
                    add(`resource:${x.resource}`);
                }
            for (const s of model.stores)
                if (reads(s.release.rule, id) || reads(s.fill.rule, id))
                    add(`resource:${s.resource}`);
        }
    }
    return [...seen].sort(byId);
}
/**
 * The forward-only analysis of every handover: what each one's downstream
 * admissions reach, which handovers lie on a cycle of dependence (refused when
 * computed), and, for the others, the pass from which their admissions are
 * final. A handover depends on another where the other's downstream
 * admissions reach its upstream account (a chain of handovers is such a
 * dependence). The passes are fixed by this order before anything is
 * computed: none is repeated to converge.
 */
export function handoffAnalysis(model, work, backlog, coupling, handovers) {
    const hs = handovers.slice().sort((a, b) => byId(a.handover, b.handover));
    const reach = new Map(hs.map((h) => [h.handover, reachOf(model, work, backlog, coupling, handovers, h.to)]));
    const reaches = (g, h) => {
        const r = reach.get(g.handover);
        return r.includes('everything') || r.includes(`account:${h.from}`);
    };
    // g -> h where g's downstream admissions reach h's upstream account.
    const after = new Map(hs.map((g) => [g.handover, hs.filter((h) => reaches(g, h)).map((h) => h.handover)]));
    const before = new Map(hs.map((h) => [h.handover, hs.filter((g) => reaches(g, h)).map((g) => g.handover)]));
    const reachable = (from) => {
        const seen = new Set();
        const stack = [...(after.get(from) ?? [])];
        while (stack.length > 0) {
            const x = stack.pop();
            if (seen.has(x))
                continue;
            seen.add(x);
            stack.push(...(after.get(x) ?? []));
        }
        return seen;
    };
    const onCycle = new Set(hs.filter((h) => reachable(h.handover).has(h.handover)).map((h) => h.handover));
    const pass = new Map();
    const passOf = (id) => {
        const known = pass.get(id);
        if (known !== undefined)
            return known;
        const p = 1 + Math.max(0, ...(before.get(id) ?? []).filter((g) => !onCycle.has(g)).map(passOf));
        pass.set(id, p);
        return p;
    };
    return hs.map((h) => {
        const r = reach.get(h.handover);
        if (!onCycle.has(h.handover)) {
            return { handover: h.handover, reaches: r, forwardOnly: true, pass: passOf(h.handover),
                detail: `nothing '${h.to}' admits can reach '${h.from}': the handover is computed from '${h.from}''s completions, in pass ${passOf(h.handover)}` };
        }
        const via = (before.get(h.handover) ?? []).filter((g) => onCycle.has(g) && reachable(h.handover).has(g));
        const why = r.includes('everything') ? `'${h.to}''s admissions reach a level the governor's bands or mode switches read, and so everything`
            : r.includes(`account:${h.from}`) ? `'${h.to}''s admissions reach '${h.from}' (through ${r.filter((x) => x !== `account:${h.to}` && x !== `account:${h.from}`).join(', ') || 'the accounts themselves'})`
                : `the handover lies on a cycle of dependence with ${via.map((x) => `'${x}'`).join(', ')}`;
        return { handover: h.handover, reaches: r, forwardOnly: false, pass: null,
            detail: `${why}: no order is given within the run and none is chosen, so its admissions are refused (not forward-only)` };
    });
}
// ---------------------------------------------------------------- checks
const graded = (s) => s === 'assumed' || s === 'estimated';
/** The claims of a handover, in a fixed order, with their evidence. */
export function handoverClaims(h) {
    return [
        ['correspondence', h.correspondence.evidence],
        ['timing', h.timing.evidence],
        ['eligibility', h.eligibility.evidence],
        ...(h.openingInTransit ? [['opening in transit', h.openingInTransit.evidence]] : []),
    ];
}
/** Checks of a parsed handover attachment against its model, backlog attachment, work attachment and, where named, coupling attachment, with their exact digests. */
export function checkHandoffAttachment(a, model, modelSha256, backlog, backlogSha256, work, coupling) {
    const r = new Reader();
    if (a.attachmentVersion !== HANDOFF_ATTACHMENT_VERSION) {
        r.error('$.attachmentVersion', 'handoff-version', `this engine reads handover attachments ${HANDOFF_ATTACHMENT_VERSION}, not '${a.attachmentVersion}'`, undefined, P);
    }
    if (a.model !== model.id)
        r.error('$.model', 'handoff-model', `the attachment names model '${a.model}', not '${model.id}'`, undefined, P);
    else if (a.modelSha256 !== modelSha256)
        r.error('$.modelSha256', 'handoff-model-digest', 'the attachment was mapped against another revision of this model: review it against this one', undefined, P);
    const ba = a.backlogAttachment;
    if (ba.id !== backlog.id || ba.version !== backlog.attachmentVersion || ba.sha256 !== backlogSha256) {
        r.error('$.backlogAttachment', 'handoff-backlog-attachment', `the attachment names backlog attachment '${ba.id}' version '${ba.version}' with another digest than the one supplied ('${backlog.id}', '${backlog.attachmentVersion}')`, undefined, P);
    }
    const ca = a.couplingAttachment;
    if (ca === null && coupling !== null)
        r.error('$.couplingAttachment', 'handoff-coupling-attachment', 'a coupling attachment was supplied, and the handover attachment names none: name it, so the coupled run is the one mapped', undefined, P);
    else if (ca !== null && coupling === null)
        r.error('$.couplingAttachment', 'handoff-coupling-attachment', `the handover attachment names coupling attachment '${ca.id}', and none was supplied`, undefined, P);
    else if (ca !== null && coupling !== null && (ca.id !== coupling.attachment.id || ca.version !== coupling.attachment.attachmentVersion || ca.sha256 !== coupling.sha256)) {
        r.error('$.couplingAttachment', 'handoff-coupling-attachment', `the attachment names coupling attachment '${ca.id}' version '${ca.version}' with another digest than the one supplied ('${coupling.attachment.id}', '${coupling.attachment.attachmentVersion}')`, undefined, P);
    }
    const listed = new Set();
    a.proposals.forEach((p, i) => {
        const path = `$.proposals[${i}]`;
        if (p.id !== HANDOFF_PROPOSAL.id)
            r.error(`${path}.id`, 'handoff-proposal', `a handover attachment enables only ${HANDOFF_PROPOSAL.id}, not '${p.id}'`, undefined, P);
        else if (p.version !== HANDOFF_PROPOSAL.version)
            r.error(`${path}.version`, 'handoff-proposal', `this engine computes ${HANDOFF_PROPOSAL.id} at version ${HANDOFF_PROPOSAL.version}, not '${p.version}'`, undefined, P);
        if (listed.has(p.id))
            r.error(`${path}.id`, 'duplicate-id', `'${p.id}' is listed twice`);
        listed.add(p.id);
    });
    if (!listed.has(HANDOFF_PROPOSAL.id))
        r.error('$.proposals', 'handoff-proposal', `the attachment must enable ${HANDOFF_PROPOSAL.id}: that is its opt-in`, undefined, P);
    if (a.handovers.length === 0)
        r.error('$.handovers', 'handoff-no-handover', 'a handover attachment maps at least one handover', undefined, P);
    const accounts = new Map(backlog.accounts.map((x) => [x.account, x]));
    const ids = new Set();
    const outOf = new Map();
    let structural = true;
    a.handovers.forEach((h, i) => {
        const path = `$.handovers[${i}]`;
        if (ids.has(h.handover))
            r.error(`${path}.handover`, 'duplicate-id', `handover '${h.handover}' is given twice`);
        ids.add(h.handover);
        const from = accounts.get(h.from);
        const to = accounts.get(h.to);
        if (!from)
            r.error(`${path}.from`, 'handoff-account', `the backlog attachment maps no account '${h.from}'`, undefined, P);
        if (!to)
            r.error(`${path}.to`, 'handoff-account', `the backlog attachment maps no account '${h.to}'`, undefined, P);
        if (!from || !to) {
            structural = false;
            return;
        }
        if (h.from === h.to) {
            r.error(path, 'handoff-same-account', `handover '${h.handover}' runs from '${h.from}' to itself: a handover runs between two accounts`, undefined, P);
            structural = false;
        }
        else if (from.part === to.part) {
            r.error(path, 'handoff-same-part', `'${h.from}' and '${h.to}' are both on part '${from.part}': a handover runs between parts`, undefined, P);
        }
        const prior = outOf.get(h.from);
        if (prior !== undefined) {
            r.error(path, 'handoff-split', `'${h.from}' already hands over through '${prior}': dividing or duplicating one account's completions between accounts is not given in this release`, undefined, P);
        }
        else
            outOf.set(h.from, h.handover);
        const c = h.correspondence;
        if (c.fromUnit !== from.obligationUnit)
            r.error(`${path}.correspondence.fromUnit`, 'handoff-units', `'${h.from}' counts '${from.obligationUnit}', not '${c.fromUnit}': no conversion is implied`, undefined, P);
        if (c.toUnit !== to.obligationUnit)
            r.error(`${path}.correspondence.toUnit`, 'handoff-units', `'${h.to}' counts '${to.obligationUnit}', not '${c.toUnit}': no conversion is implied`, undefined, P);
        if (!Q.isPositive(c.perCompletion))
            r.error(`${path}.correspondence.perCompletion`, 'handoff-ratio', 'a correspondence is above 0: downstream obligations per upstream completion', undefined, P);
        else if (to.divisibility === 'indivisible' && !Q.isInteger(c.perCompletion)) {
            r.flag(`${path}.correspondence.perCompletion`, 'handoff-fraction', `'${h.to}' is indivisible and ${Q.toCanonical(c.perCompletion)} per completion is not a whole number: a step whose handover is not whole is refused, never rounded`, undefined, P);
        }
        if (h.timing.availability === 'next-step' && !h.openingInTransit) {
            r.error(`${path}.openingInTransit`, 'handoff-opening', `a next-step handover states what is in transit at the start (a value or an explicit gap, with its evidence): it is never taken as 0`, undefined, P);
        }
        if (h.timing.availability === 'same-step' && h.openingInTransit) {
            r.error(`${path}.openingInTransit`, 'handoff-opening', 'only a next-step handover has obligations in transit at the start', undefined, P);
        }
        if (h.openingInTransit && !isGap(h.openingInTransit.value)) {
            const v = h.openingInTransit.value;
            if (Q.isNegative(v))
                r.error(`${path}.openingInTransit.value`, 'negative', 'a negative amount in transit', undefined, P);
            else if (to.divisibility === 'indivisible' && !Q.isInteger(v))
                r.error(`${path}.openingInTransit.value`, 'handoff-opening', `'${h.to}' is indivisible, so ${Q.toCanonical(v)} in transit is not accepted (no rounding)`, undefined, P);
        }
        for (const [claim, ev] of [['correspondence', c.evidence], ['timing', h.timing.evidence], ['eligibility', h.eligibility.evidence]]) {
            if (ev.status === 'unknown') {
                r.error(path, 'handoff-unknown-claim', `handover '${h.handover}': the ${claim} claim's evidence is unknown, so the handover is not valid`, undefined, P);
            }
            else if (graded(ev.status)) {
                r.flag(path, 'handoff-conditional', `handover '${h.handover}': the ${claim} claim is ${ev.status}, so what '${h.to}' admits from it is conditional on it`, undefined, P);
            }
        }
        if (h.openingInTransit?.evidence.status === 'unknown') {
            r.flag(path, 'handoff-unknown-opening', `handover '${h.handover}': the evidence for what is in transit at the start is unknown, so the step-0 admission is refused`, undefined, P);
        }
        // The same-step cap and the handover together would hold the downstream to this step's upstream output.
        if (work.links.some((l) => l.part === from.part && l.feeds === to.part)) {
            r.error(path, 'handoff-link-conflict', `a P-DEP-01 link from '${from.part}' to '${to.part}' is mapped as well: its same-step cap would stop '${to.part}' completing carried-over obligations. Map one or the other`, undefined, P);
        }
        // Arrivals from outside the chain add to the handovers: say so, against double counting.
        if (to.admissions.perStep.some((e) => isGap(e.value) || !Q.isZero(e.value))) {
            r.flag(`${path}.to`, 'handoff-outside-admissions', `'${h.to}' also admits its own series as mapped; the handover's admissions are added to it. Check that the series counts only arrivals from outside the chain, never obligations handed over`, undefined, P);
        }
    });
    // A cycle of handovers, account to account: no step order is given for it.
    if (structural) {
        const next = new Map(a.handovers.map((h) => [h.from, h.to]));
        for (const h of a.handovers) {
            const seen = new Set([h.from]);
            let at = h.to;
            while (at !== undefined && !seen.has(at)) {
                seen.add(at);
                at = next.get(at);
            }
            if (at === h.from) {
                r.error('$.handovers', 'handoff-cycle', `the handovers form a cycle through '${h.from}': rework loops are not given in this release`, undefined, P);
                break;
            }
        }
    }
    if (r.ok) {
        for (const x of handoffAnalysis(model, work, backlog, coupling?.attachment ?? null, a.handovers)) {
            r.flag('$.handovers', 'handoff-reach', `handover '${x.handover}': what its downstream account admits can reach ${x.reaches.join(', ')}`, undefined, P);
            if (!x.forwardOnly)
                r.flag('$.handovers', 'handoff-not-forward-only', `handover '${x.handover}': ${x.detail}`, undefined, P);
        }
    }
    return r.issues;
}
/** Parse and check a handover attachment against its model, backlog and work attachments and, where named, the coupling attachment, each with its exact digest. */
export function validateHandoffAttachment(doc, model, modelSha256, backlog, backlogSha256, work, coupling) {
    const parsed = parseHandoffAttachment(doc);
    if (!parsed.attachment)
        return { ok: false, issues: parsed.issues };
    const issues = [...parsed.issues, ...checkHandoffAttachment(parsed.attachment, model, modelSha256, backlog, backlogSha256, work, coupling)];
    const ok = !issues.some((i) => i.severity === 'error');
    return { ok, issues, attachment: ok ? parsed.attachment : undefined };
}
/** The claims an account's handover admissions rest on, where assumed or estimated: each handover's own, then its upstream account's and binding's (and theirs in turn). */
export function handoverConditions(h, backlog, coupling, handovers, depth = 0) {
    if (depth > handovers.length)
        return [];
    const from = backlog.accounts.find((x) => x.account === h.from);
    const own = handoverClaims(h).filter(([, ev]) => graded(ev.status)).map(([c, ev]) => `${c}: ${ev.status}`);
    const up = from ? claimsOf(from).filter(([, ev]) => graded(ev.status)).map(([c, ev]) => `${h.from} ${c}: ${ev.status}`) : [];
    const b = coupling?.bindings.find((x) => x.account === h.from);
    const bound = b && graded(b.activeWorkload.evidence.status) ? [`${h.from} active workload: ${b.activeWorkload.evidence.status}`] : [];
    const earlier = handovers.filter((g) => g.to === h.from).flatMap((g) => handoverConditions(g, backlog, coupling, handovers, depth + 1));
    return [...new Set([...own, ...up, ...bound, ...earlier])];
}
