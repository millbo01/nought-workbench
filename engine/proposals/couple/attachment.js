// P-COUPLE-01 (the v0.3 design resolutions, CF-D01 to CF-D10, approved; its
// implementation authorised 2026-10-20): the coupling attachment. A separate
// document, bound to one model revision and one backlog attachment by their
// ids, versions and digests (the backlog attachment binds its work attachment
// in turn), that binds an account's eligible obligations to exactly one load
// declared on the account's own part, under an active-workload claim that
// holds in every step of the run (F.2). Only runCoupled reads it. Parsing
// rejects unknown fields; validation rejects what cannot be coupled as mapped
// (CF-D02, CF-D03), with no fallback to the scenario's loads (F.4), and flags
// what is accepted with a condition: an estimated or assumed claim (CF-D03), a
// reference-output rule not proven within R_t <= D_t (CF-D07), and what reads
// each bound load (CF-D06's preflight impact diagnostic). Nothing in it
// changes the model, the scenario, the work or backlog attachment, or a trace.
import * as Q from "../../core/rational.js";
import { levelRead, loadsRead } from "../../core/rules.js";
import { readArray, readId, readObject, readOptString, readString, Reader } from "../../core/schema/parse.js";
import { isGap } from "../../core/schema/types.js";
import { claimsOf } from "../backlog/attachment.js";
export const COUPLING_ATTACHMENT_VERSION = '0.1.0';
/** The proposal a coupling attachment enables, at the contract version this engine computes (CF-D01). */
export const COUPLING_PROPOSAL = { id: 'P-COUPLE-01', version: '0.1' };
const STATUSES = ['documented', 'estimated', 'assumed', 'unknown'];
const P = 'P-COUPLE-01';
function byId(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
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
        r.error(`${path}.evidence.status`, 'couple-evidence', "evidence is 'documented', 'estimated', 'assumed' or 'unknown'", undefined, P);
    }
    const source = readText(r, e, 'source', `${path}.evidence`);
    return STATUSES.includes(status) && source !== undefined ? { status: status, source } : undefined;
}
function readBinding(r, v, path) {
    const o = readObject(r, v, path, ['binding', 'account', 'part', 'load', 'activeWorkload', 'label', 'rationale']);
    if (!o)
        return undefined;
    const binding = readId(r, o, 'binding', path);
    const account = readId(r, o, 'account', path);
    const part = readId(r, o, 'part', path);
    const load = readId(r, o, 'load', path);
    const c = present(r, o, 'activeWorkload', path) ? readObject(r, o['activeWorkload'], `${path}.activeWorkload`, ['statement', 'evidence']) : undefined;
    const statement = c && readText(r, c, 'statement', `${path}.activeWorkload`);
    const evidence = c && readEvidence(r, c, `${path}.activeWorkload`);
    if (!binding || !account || !part || !load || statement === undefined || !evidence)
        return undefined;
    return {
        binding, account, part, load, activeWorkload: { statement, evidence },
        label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
    };
}
/** Read an untrusted JSON document into a coupling attachment, collecting every issue with its path. */
export function parseCouplingAttachment(doc) {
    const r = new Reader();
    const o = readObject(r, doc, '$', ['attachmentVersion', 'id', 'label', 'rationale', 'model', 'modelSha256', 'backlogAttachment', 'proposals', 'bindings']);
    if (!o)
        return { issues: r.issues };
    const path = '$';
    const attachmentVersion = readString(r, o, 'attachmentVersion', path);
    const id = readId(r, o, 'id', path);
    const model = readId(r, o, 'model', path);
    const modelSha256 = readString(r, o, 'modelSha256', path);
    const hex = (s, p, what) => {
        if (s !== undefined && !/^[0-9a-f]{64}$/.test(s))
            r.error(p, 'couple-digest', `${what} is 64 lower-case hex digits`, undefined, P);
    };
    hex(modelSha256, `${path}.modelSha256`, "the model's digest (RunStamp.mapping.sha256)");
    const b = present(r, o, 'backlogAttachment', path) ? readObject(r, o['backlogAttachment'], `${path}.backlogAttachment`, ['id', 'version', 'sha256']) : undefined;
    const backlogId = b && readId(r, b, 'id', `${path}.backlogAttachment`);
    const backlogVersion = b && readString(r, b, 'version', `${path}.backlogAttachment`);
    const backlogSha = b && readString(r, b, 'sha256', `${path}.backlogAttachment`);
    hex(backlogSha, `${path}.backlogAttachment.sha256`, "the backlog attachment's digest (BacklogRunStamp.attachment.sha256)");
    const proposals = readArray(r, o, 'proposals', path, (v, p) => {
        const e = readObject(r, v, p, ['id', 'version']);
        if (!e)
            return undefined;
        const pid = readString(r, e, 'id', p);
        const version = readString(r, e, 'version', p);
        return pid !== undefined && version !== undefined ? { id: pid, version } : undefined;
    });
    const bindings = readArray(r, o, 'bindings', path, (v, p) => readBinding(r, v, p));
    if (!r.ok || attachmentVersion === undefined || !id || !model || modelSha256 === undefined || !backlogId || backlogVersion === undefined || backlogSha === undefined) {
        return { issues: r.issues };
    }
    return {
        attachment: {
            attachmentVersion, id, model, modelSha256, backlogAttachment: { id: backlogId, version: backlogVersion, sha256: backlogSha }, proposals, bindings,
            label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
        },
        issues: r.issues,
    };
}
/** What reads a bound load (CF-D06), from the model and the work attachment alone. */
export function couplingImpact(model, work, part, load) {
    const p = model.parts.find((x) => x.id === part);
    const reads = (rule) => !isGap(rule) && loadsRead(rule).includes(load);
    const requirements = (p?.requirement ?? []).filter((e) => reads(e.rule)).map((e) => e.resource).sort(byId);
    const upkeep = (p?.upkeep ?? []).filter((e) => reads(e.rule)).map((e) => e.resource).sort(byId);
    const referenceOutputs = work.works.filter((w) => w.part === part && reads(w.referenceOutputRule)).map((w) => w.work).sort(byId);
    const measuresIt = (m) => !isGap(m) && m.of === 'load' && m.part === part && m.load === load;
    const levels = model.levels.filter((l) => measuresIt(l.measures)).map((l) => l.id).sort(byId);
    const sensed = new Set(levels);
    const readsLevel = (rule) => {
        if (isGap(rule))
            return false;
        const l = levelRead(rule);
        return l !== null && sensed.has(l);
    };
    const levelReaders = [
        ...model.settings.filter((s) => readsLevel(s.rule)).map((s) => `setting:${s.id}`),
        ...model.stores.filter((s) => readsLevel(s.release.rule)).map((s) => `store-release:${s.id}`),
        ...model.stores.filter((s) => readsLevel(s.fill.rule)).map((s) => `store-fill:${s.id}`),
        ...model.routes.filter((x) => readsLevel(x.capacity)).map((x) => `route:${x.id}`),
        ...model.thresholdSwitches.filter((s) => sensed.has(s.level)).map((s) => `switch:${s.id}`),
        ...model.governor.bands.filter((x) => sensed.has(x.level)).map((x) => `band:${x.level}`),
    ].sort(byId);
    const indicators = model.indicators.filter((i) => ('level' in i.watches && sensed.has(i.watches.level)) ||
        ('measure' in i.watches && measuresIt(i.watches.measure))).map((i) => i.id).sort(byId);
    return { requirements, upkeep, referenceOutputs, levels, levelReaders, indicators };
}
/** CF-D07's static guard for one account's work, as bound to `load`. */
export function staticGuard(rule, load) {
    if (isGap(rule))
        return { status: 'unproven', detail: 'the reference-output rule is a gap, so nothing is proven of it (every reference output it gives is refused)' };
    if (rule.kind === 'constant') {
        return Q.isZero(rule.value)
            ? { status: 'proven', detail: 'R = 0' }
            : { status: 'unproven', detail: `R = ${Q.toCanonical(rule.value)}, a constant above 0, can exceed the eligible obligations` };
    }
    if (rule.kind === 'table')
        return { status: 'unproven', detail: 'a table rule is not of the proven form R = b x G with b <= 1' };
    const others = rule.terms.filter((t) => t.load !== load).map((t) => t.load);
    if (others.length > 0)
        return { status: 'unproven', detail: `the rule also reads ${[...new Set(others)].sort(byId).map((x) => `'${x}'`).join(', ')}, so it is not of the proven form R = b x G` };
    const b = Q.sum(rule.terms.map((t) => t.per));
    if (!Q.isZero(rule.base))
        return { status: 'unproven', detail: `R = ${Q.toCanonical(rule.base)} + ${Q.toCanonical(b)} x G has an intercept above 0` };
    if (Q.gt(b, Q.ONE))
        return { status: 'unproven', detail: `R = ${Q.toCanonical(b)} x G has a coefficient above 1` };
    return { status: 'proven', detail: `R = ${Q.toCanonical(b)} x G with ${Q.toCanonical(b)} <= 1` };
}
/** The claims a binding's results are conditional on, where assumed or estimated: its active-workload claim, then the account's own. */
export function conditionsOf(b, account) {
    const graded = (s) => s === 'assumed' || s === 'estimated';
    return [
        ...(graded(b.activeWorkload.evidence.status) ? [`active workload: ${b.activeWorkload.evidence.status}`] : []),
        ...claimsOf(account).filter(([, ev]) => graded(ev.status)).map(([c, ev]) => `${c}: ${ev.status}`),
    ];
}
const describeImpact = (i) => {
    const parts = [
        i.requirements.length > 0 ? `the requirement for ${i.requirements.join(', ')}` : '',
        i.upkeep.length > 0 ? `the upkeep for ${i.upkeep.join(', ')}` : '',
        i.referenceOutputs.length > 0 ? `the reference output of ${i.referenceOutputs.join(', ')}` : '',
        i.levels.length > 0 ? `the level${i.levels.length === 1 ? '' : 's'} ${i.levels.join(', ')}${i.levelReaders.length > 0 ? ` (read by ${i.levelReaders.join(', ')})` : ''}` : '',
        i.indicators.length > 0 ? `the indicator${i.indicators.length === 1 ? '' : 's'} ${i.indicators.join(', ')}` : '',
    ].filter((x) => x !== '');
    return parts.length > 0 ? parts.join('; ') : 'nothing: the generated load changes no value';
};
/** Checks of a parsed coupling attachment against its model, its backlog attachment and that attachment's work attachment, with their exact digests. */
export function checkCouplingAttachment(a, model, modelSha256, backlog, backlogSha256, work) {
    const r = new Reader();
    if (a.attachmentVersion !== COUPLING_ATTACHMENT_VERSION) {
        r.error('$.attachmentVersion', 'couple-version', `this engine reads coupling attachments ${COUPLING_ATTACHMENT_VERSION}, not '${a.attachmentVersion}'`, undefined, P);
    }
    if (a.model !== model.id)
        r.error('$.model', 'couple-model', `the attachment names model '${a.model}', not '${model.id}'`, undefined, P);
    else if (a.modelSha256 !== modelSha256) {
        r.error('$.modelSha256', 'couple-model-digest', 'the attachment was mapped against another revision of this model: review it against this one', undefined, P);
    }
    const ba = a.backlogAttachment;
    if (ba.id !== backlog.id || ba.version !== backlog.attachmentVersion || ba.sha256 !== backlogSha256) {
        r.error('$.backlogAttachment', 'couple-backlog-attachment', `the attachment names backlog attachment '${ba.id}' version '${ba.version}' with another digest than the one supplied ('${backlog.id}', '${backlog.attachmentVersion}'): review it against that one`, undefined, P);
    }
    if (backlog.model !== model.id)
        r.error('$.backlogAttachment', 'couple-backlog-attachment', `the backlog attachment names model '${backlog.model}', not '${model.id}'`, undefined, P);
    const listed = new Set();
    a.proposals.forEach((p, i) => {
        const path = `$.proposals[${i}]`;
        if (p.id !== COUPLING_PROPOSAL.id)
            r.error(`${path}.id`, 'couple-proposal', `a coupling attachment enables only ${COUPLING_PROPOSAL.id}, not '${p.id}'`, undefined, P);
        else if (p.version !== COUPLING_PROPOSAL.version)
            r.error(`${path}.version`, 'couple-proposal', `this engine computes ${COUPLING_PROPOSAL.id} at version ${COUPLING_PROPOSAL.version}, not '${p.version}'`, undefined, P);
        if (listed.has(p.id))
            r.error(`${path}.id`, 'duplicate-id', `'${p.id}' is listed twice`);
        listed.add(p.id);
    });
    if (!listed.has(COUPLING_PROPOSAL.id))
        r.error('$.proposals', 'couple-proposal', `the attachment must enable ${COUPLING_PROPOSAL.id}: that is its opt-in`, undefined, P);
    if (a.bindings.length === 0)
        r.error('$.bindings', 'couple-no-binding', 'a coupled run binds at least one account to a load; without one nothing is coupled', undefined, P);
    const ids = new Set();
    const loads = new Map();
    const accounts = new Map();
    a.bindings.forEach((b, i) => {
        const path = `$.bindings[${i}]`;
        if (ids.has(b.binding))
            r.error(`${path}.binding`, 'duplicate-id', `binding '${b.binding}' is given twice`);
        ids.add(b.binding);
        const key = `${b.part}|${b.load}`;
        const owner = loads.get(key);
        if (owner !== undefined) {
            r.error(path, 'couple-load-twice', `load '${b.load}' on '${b.part}' is already generated by binding '${owner}': a load has one source (CF-D02)`, undefined, P);
        }
        else
            loads.set(key, b.binding);
        const bound = accounts.get(b.account);
        if (bound !== undefined) {
            r.error(path, 'couple-account-twice', `account '${b.account}' already generates a load through binding '${bound}': an account generates one load (CF-D02)`, undefined, P);
        }
        else
            accounts.set(b.account, b.binding);
        const acc = backlog.accounts.find((x) => x.account === b.account);
        const part = model.parts.find((x) => x.id === b.part);
        const decl = part?.loads.find((x) => x.id === b.load);
        if (!acc)
            r.error(`${path}.account`, 'couple-account', `the backlog attachment maps no account '${b.account}'`, undefined, P);
        else if (acc.part !== b.part) {
            r.error(`${path}.part`, 'couple-part', `account '${b.account}' belongs to part '${acc.part}', not '${b.part}': a binding generates a load on the account's own part only (CF-D02)`, undefined, P);
        }
        if (!part)
            r.error(`${path}.part`, 'unknown-reference', `no part '${b.part}'`);
        else if (!decl)
            r.error(`${path}.load`, 'couple-load', `part '${b.part}' declares no load '${b.load}'`, undefined, P);
        else if (acc && acc.part === b.part && decl.unit !== acc.obligationUnit) {
            r.error(`${path}.load`, 'couple-unit', `load '${b.load}' is counted in '${decl.unit}' and the account's obligations in '${acc.obligationUnit}': no conversion is implied (CF-D02)`, undefined, P);
        }
        const ev = b.activeWorkload.evidence;
        if (ev.status === 'unknown') {
            r.error(`${path}.activeWorkload.evidence.status`, 'couple-unknown-claim', `binding '${b.binding}': the active-workload claim's evidence is unknown, so the coupled run is not valid; there is no fallback to the scenario's loads (CF-D03, F.4)`, undefined, P);
        }
        else if (ev.status !== 'documented') {
            r.flag(path, 'couple-conditional', `binding '${b.binding}': the active-workload claim is ${ev.status}, so the coupled results are a conditional simulation (CF-D03)`, undefined, P);
        }
        if (!acc || acc.part !== b.part || !decl)
            return;
        const w = work.works.find((x) => x.part === acc.part && x.work === acc.work);
        if (w) {
            const guard = staticGuard(w.referenceOutputRule, b.load);
            if (guard.status === 'unproven') {
                r.flag(path, 'couple-guard-unproven', `binding '${b.binding}': the reference output of '${w.work}' is not proven within the eligible obligations (${guard.detail}); the runtime guard still applies (CF-D07)`, undefined, P);
            }
        }
        const impact = couplingImpact(model, work, b.part, b.load);
        r.flag(path, 'couple-impact', `binding '${b.binding}': the generated load '${b.load}' is read by ${describeImpact(impact)} (CF-D06)`, undefined, P);
        if (impact.levels.length > 0) {
            r.flag(path, 'couple-sensed-level', `binding '${b.binding}': ${impact.levels.map((x) => `'${x}'`).join(', ')} measure${impact.levels.length === 1 ? 's' : ''} the generated load in the same step, through its producing part and route (CF-D10)`, undefined, P);
        }
    });
    return r.issues;
}
/** Parse and check a coupling attachment against its model and backlog attachment, each with its exact digest, and the work attachment the backlog attachment names. */
export function validateCouplingAttachment(doc, model, modelSha256, backlog, backlogSha256, work) {
    const parsed = parseCouplingAttachment(doc);
    if (!parsed.attachment)
        return { ok: false, issues: parsed.issues };
    const issues = [...parsed.issues, ...checkCouplingAttachment(parsed.attachment, model, modelSha256, backlog, backlogSha256, work)];
    const ok = !issues.some((i) => i.severity === 'error');
    return { ok, issues, attachment: ok ? parsed.attachment : undefined };
}
