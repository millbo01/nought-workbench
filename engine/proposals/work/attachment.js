// P-WORK-01 and P-DEP-01: the work attachment (docs/proposals.md; decisions of
// 2026-10-20). A separate document, mapped against one model and its exact
// digest, that enables the two proposals and gives each part's work and any
// functional links. Nothing in it changes the model, the scenario or the base
// run. Parsing rejects unknown fields, so a typo never becomes a default;
// validation against the model rejects what cannot be computed as mapped, and
// flags what is accepted but refused when the work is computed.
import * as Q from "../../core/rational.js";
import { readArray, readId, readInteger, readObject, readOptString, readOrGap, readRational, readRationalValue, readString, Reader } from "../../core/schema/parse.js";
import { isGap } from "../../core/schema/types.js";
export const WORK_ATTACHMENT_VERSION = '0.1.0';
/** The proposals a work attachment can enable, at the contract revision this engine computes. */
export const WORK_PROPOSALS = [
    { id: 'P-WORK-01', version: '0.3' },
    { id: 'P-DEP-01', version: '0.3' },
];
const SEMANTICS = ['non-exclusive-enablement', 'exhaustible-support'];
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
    r.error(`${path}.${key}`, 'missing-field', `'${key}' is required (write { "gap": "<note>" } where it is not known)`);
    return false;
}
function readPoints(r, o, path) {
    return readArray(r, o, 'points', path, (v, p) => {
        const e = readObject(r, v, p, ['at', 'value']);
        if (!e)
            return undefined;
        const at = readRational(r, e, 'at', p);
        const value = readRational(r, e, 'value', p);
        return at && value ? { at, value } : undefined;
    });
}
function readReferenceRule(r, v, path) {
    const kind = typeof v === 'object' && v !== null ? v['kind'] : undefined;
    switch (kind) {
        case 'constant': {
            const o = readObject(r, v, path, ['kind', 'value']);
            const value = o && readRational(r, o, 'value', path);
            return value ? { kind: 'constant', value } : undefined;
        }
        case 'linear': {
            const o = readObject(r, v, path, ['kind', 'base', 'terms']);
            if (!o)
                return undefined;
            const base = readRational(r, o, 'base', path);
            const terms = readArray(r, o, 'terms', path, (x, p) => {
                const e = readObject(r, x, p, ['load', 'per']);
                if (!e)
                    return undefined;
                const load = readId(r, e, 'load', p);
                const per = readRational(r, e, 'per', p);
                return load && per ? { load, per } : undefined;
            });
            return base ? { kind: 'linear', base, terms } : undefined;
        }
        case 'table': {
            const o = readObject(r, v, path, ['kind', 'load', 'points']);
            if (!o)
                return undefined;
            const load = readId(r, o, 'load', path);
            const points = readPoints(r, o, path);
            return load ? { kind: 'table', load, points } : undefined;
        }
        default:
            r.error(path, 'work-rule', "a reference-output rule has kind 'constant', 'linear' or 'table' (decision 6)", undefined, 'P-WORK-01');
            return undefined;
    }
}
function readCapacity(r, v, path) {
    const kind = typeof v === 'object' && v !== null ? v['kind'] : undefined;
    if (kind === 'constant') {
        const o = readObject(r, v, path, ['kind', 'value', 'rationale']);
        if (!o)
            return undefined;
        const value = readRational(r, o, 'value', path);
        const rationale = readText(r, o, 'rationale', path);
        return value && rationale !== undefined ? { kind: 'constant', value, rationale } : undefined;
    }
    if (kind === 'per-unit') {
        const o = readObject(r, v, path, ['kind', 'perUnit']);
        const perUnit = o && readRational(r, o, 'perUnit', path);
        return perUnit ? { kind: 'per-unit', perUnit } : undefined;
    }
    r.error(path, 'work-capacity', "a capacity is { kind: 'constant', value, rationale } or { kind: 'per-unit', perUnit }", undefined, 'P-WORK-01');
    return undefined;
}
function readWork(r, v, path) {
    const o = readObject(r, v, path, ['part', 'work', 'workUnit', 'definition', 'referenceOutputRule', 'recipe', 'capacity', 'yield', 'label', 'rationale']);
    if (!o)
        return undefined;
    const part = readId(r, o, 'part', path);
    const work = readId(r, o, 'work', path);
    const workUnit = readText(r, o, 'workUnit', path);
    const definition = readText(r, o, 'definition', path);
    const rule = present(r, o, 'referenceOutputRule', path)
        ? readOrGap(r, o['referenceOutputRule'], `${path}.referenceOutputRule`, (x, p) => readReferenceRule(r, x, p)) : undefined;
    const recipe = readArray(r, o, 'recipe', path, (x, p) => {
        const e = readObject(r, x, p, ['resource', 'perWorkUnit']);
        if (!e)
            return undefined;
        const resource = readId(r, e, 'resource', p);
        const perWorkUnit = readRational(r, e, 'perWorkUnit', p);
        return resource && perWorkUnit ? { resource, perWorkUnit } : undefined;
    });
    if (Array.isArray(o['recipe']) && o['recipe'].length === 0) {
        r.error(`${path}.recipe`, 'work-recipe', 'a work states at least one recipe resource', undefined, 'P-WORK-01');
    }
    const capacity = present(r, o, 'capacity', path)
        ? readOrGap(r, o['capacity'], `${path}.capacity`, (x, p) => readCapacity(r, x, p)) : undefined;
    const y = present(r, o, 'yield', path)
        ? readOrGap(r, o['yield'], `${path}.yield`, (x, p) => readRationalValue(r, x, p)) : undefined;
    if (!part || !work || workUnit === undefined || definition === undefined || !rule || !capacity || !y)
        return undefined;
    return {
        part, work, workUnit, definition, referenceOutputRule: rule, recipe, capacity, yield: y,
        label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
    };
}
function readLink(r, v, path) {
    const o = readObject(r, v, path, ['part', 'feeds', 'workUnits', 'ratio', 'lagSteps', 'semantics', 'rationale', 'label']);
    if (!o)
        return undefined;
    const part = readId(r, o, 'part', path);
    const feeds = readId(r, o, 'feeds', path);
    const u = readObject(r, o['workUnits'], `${path}.workUnits`, ['part', 'feeds']);
    const upUnit = u && readText(r, u, 'part', `${path}.workUnits`);
    const downUnit = u && readText(r, u, 'feeds', `${path}.workUnits`);
    const ratio = readRational(r, o, 'ratio', path);
    const lagSteps = readInteger(r, o, 'lagSteps', path, 0);
    const semantics = o['semantics'];
    if (!SEMANTICS.includes(semantics)) {
        r.error(`${path}.semantics`, 'work-link-semantics', "semantics is 'non-exclusive-enablement' or 'exhaustible-support' (D-4)", undefined, 'P-DEP-01');
    }
    const rationale = readText(r, o, 'rationale', path);
    if (!part || !feeds || upUnit === undefined || downUnit === undefined || !ratio || lagSteps === undefined || !SEMANTICS.includes(semantics) || rationale === undefined) {
        return undefined;
    }
    return {
        part, feeds, workUnits: { part: upUnit, feeds: downUnit }, ratio, lagSteps, semantics: semantics, rationale,
        label: readOptString(r, o, 'label', path),
    };
}
/** Read an untrusted JSON document into a work attachment, collecting every issue with its path. */
export function parseWorkAttachment(doc) {
    const r = new Reader();
    const o = readObject(r, doc, '$', ['attachmentVersion', 'id', 'label', 'rationale', 'model', 'modelSha256', 'proposals', 'works', 'links']);
    if (!o)
        return { issues: r.issues };
    const path = '$';
    const attachmentVersion = readString(r, o, 'attachmentVersion', path);
    const id = readId(r, o, 'id', path);
    const model = readId(r, o, 'model', path);
    const modelSha256 = readString(r, o, 'modelSha256', path);
    if (modelSha256 !== undefined && !/^[0-9a-f]{64}$/.test(modelSha256)) {
        r.error(`${path}.modelSha256`, 'work-model-digest', "the model's digest is 64 lower-case hex digits (RunStamp.mapping.sha256)", undefined, 'P-WORK-01');
    }
    const proposals = readArray(r, o, 'proposals', path, (v, p) => {
        const e = readObject(r, v, p, ['id', 'version']);
        if (!e)
            return undefined;
        const pid = readString(r, e, 'id', p);
        const version = readString(r, e, 'version', p);
        return pid !== undefined && version !== undefined ? { id: pid, version } : undefined;
    });
    const works = readArray(r, o, 'works', path, (v, p) => readWork(r, v, p));
    const links = readArray(r, o, 'links', path, (v, p) => readLink(r, v, p), false);
    if (!r.ok || attachmentVersion === undefined || !id || !model || modelSha256 === undefined)
        return { issues: r.issues };
    return {
        attachment: {
            attachmentVersion, id, model, modelSha256, proposals, works, links,
            label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path),
        },
        issues: r.issues,
    };
}
function strictlyIncreasing(xs) {
    for (let i = 1; i < xs.length; i++)
        if (!Q.lt(xs[i - 1], xs[i]))
            return false;
    return true;
}
function nonDecreasing(xs) {
    for (let i = 1; i < xs.length; i++)
        if (Q.lt(xs[i], xs[i - 1]))
            return false;
    return true;
}
/** Decision 6: on the part's own loads, non-negative and non-decreasing. A rule of P-WORK-01, not of Q-009. */
function checkReferenceRule(r, part, rule, path) {
    const loads = new Set(part.loads.map((l) => l.id));
    const monotone = 'P-WORK-01 (decision 6): a reference-output rule never falls while its load rises in this release';
    if (rule.kind === 'constant' && Q.isNegative(rule.value))
        r.error(path, 'negative', 'a negative reference output', undefined, 'P-WORK-01');
    if (rule.kind === 'linear') {
        if (Q.isNegative(rule.base))
            r.error(`${path}.base`, 'negative', 'a negative reference-output base', undefined, 'P-WORK-01');
        rule.terms.forEach((t, i) => {
            if (!loads.has(t.load))
                r.error(`${path}.terms[${i}].load`, 'unknown-reference', `part '${part.id}' declares no load '${t.load}'`);
            if (Q.isNegative(t.per))
                r.error(`${path}.terms[${i}].per`, 'work-reference-monotone', `${monotone}: no negative coefficient`, undefined, 'P-WORK-01');
        });
    }
    if (rule.kind === 'table') {
        if (!loads.has(rule.load))
            r.error(`${path}.load`, 'unknown-reference', `part '${part.id}' declares no load '${rule.load}'`);
        if (rule.points.length < 2)
            r.error(`${path}.points`, 'bad-rule', 'a table needs at least two points');
        if (!strictlyIncreasing(rule.points.map((p) => p.at)))
            r.error(`${path}.points`, 'bad-rule', "'at' values must strictly increase");
        if (rule.points.some((p) => Q.isNegative(p.value)))
            r.error(`${path}.points`, 'negative', 'a negative reference output', undefined, 'P-WORK-01');
        if (!nonDecreasing(rule.points.map((p) => p.value)))
            r.error(`${path}.points`, 'work-reference-monotone', `${monotone}: this table falls`, undefined, 'P-WORK-01');
    }
}
/** Checks of a parsed attachment against the model it names and that model's digest. */
export function checkWorkAttachment(a, model, modelSha256) {
    const r = new Reader();
    if (a.attachmentVersion !== WORK_ATTACHMENT_VERSION) {
        r.error('$.attachmentVersion', 'work-version', `this engine reads work attachments ${WORK_ATTACHMENT_VERSION}, not '${a.attachmentVersion}'`, undefined, 'P-WORK-01');
    }
    if (a.model !== model.id)
        r.error('$.model', 'work-model', `the attachment names model '${a.model}', not '${model.id}'`, undefined, 'P-WORK-01');
    else if (a.modelSha256 !== modelSha256) {
        r.error('$.modelSha256', 'work-model-digest', 'the attachment was mapped against another revision of this model: review it against this one (decision 10)', undefined, 'P-WORK-01');
    }
    const listed = new Set();
    a.proposals.forEach((p, i) => {
        const path = `$.proposals[${i}]`;
        const known = WORK_PROPOSALS.find((w) => w.id === p.id);
        if (!known)
            r.error(`${path}.id`, 'work-proposal', `a work attachment enables only P-WORK-01 and P-DEP-01, not '${p.id}'`);
        else if (p.version !== known.version)
            r.error(`${path}.version`, 'work-proposal', `this engine computes ${p.id} at version ${known.version}, not '${p.version}'`, undefined, p.id);
        if (listed.has(p.id))
            r.error(`${path}.id`, 'duplicate-id', `'${p.id}' is listed twice`);
        listed.add(p.id);
    });
    if (!listed.has('P-WORK-01'))
        r.error('$.proposals', 'work-proposal', 'the attachment must enable P-WORK-01: that is its opt-in', undefined, 'P-WORK-01');
    if (a.links.length > 0 && !listed.has('P-DEP-01')) {
        r.error('$.links', 'work-link-proposal', 'functional links need P-DEP-01 enabled in the attachment', undefined, 'P-DEP-01');
    }
    const partById = new Map(model.parts.map((p) => [p.id, p]));
    const workIds = new Set();
    const worksOf = new Map();
    a.works.forEach((w, i) => {
        const path = `$.works[${i}]`;
        if (workIds.has(w.work))
            r.error(`${path}.work`, 'duplicate-id', `work '${w.work}' is mapped twice`);
        workIds.add(w.work);
        worksOf.set(w.part, [...(worksOf.get(w.part) ?? []), w]);
        const part = partById.get(w.part);
        if (!part) {
            r.error(`${path}.part`, 'unknown-reference', `no part '${w.part}'`);
            return;
        }
        if (part.setsOwnAccess) {
            r.flag(`${path}.part`, 'work-separate-case', `part '${w.part}' sets its own access, a separate case with no record in the base trace: its resource term and any per-unit capacity are refused`, 'C3.5', 'P-WORK-01');
        }
        if (!isGap(w.referenceOutputRule))
            checkReferenceRule(r, part, w.referenceOutputRule, `${path}.referenceOutputRule`);
        const seen = new Set();
        w.recipe.forEach((e, j) => {
            const q = `${path}.recipe[${j}]`;
            if (seen.has(e.resource))
                r.error(`${q}.resource`, 'duplicate-id', `resource '${e.resource}' is in the recipe twice`);
            seen.add(e.resource);
            if (!model.resources.some((x) => x.id === e.resource))
                r.error(`${q}.resource`, 'unknown-reference', `no resource '${e.resource}'`);
            else if (!part.requirement.some((x) => x.resource === e.resource)) {
                r.error(`${q}.resource`, 'work-recipe-resource', `part '${w.part}' has no requirement for '${e.resource}', so nothing of it is left for work`, undefined, 'P-WORK-01');
            }
            else if (!part.upkeep.some((x) => x.resource === e.resource)) {
                r.error(`${q}.resource`, 'work-recipe-upkeep', `part '${w.part}' states no upkeep for '${e.resource}': state it, 0 where that is the case, so what is left for work can be read (decision 4)`, undefined, 'P-WORK-01');
            }
            if (!Q.isPositive(e.perWorkUnit))
                r.error(`${q}.perWorkUnit`, 'work-recipe', 'a recipe amount is above 0', undefined, 'P-WORK-01');
        });
        if (!isGap(w.capacity)) {
            const c = w.capacity;
            if (Q.isNegative(c.kind === 'constant' ? c.value : c.perUnit))
                r.error(`${path}.capacity`, 'negative', 'a negative capacity', undefined, 'P-WORK-01');
        }
        if (!isGap(w.yield) && (Q.isNegative(w.yield) || Q.gt(w.yield, Q.ONE))) {
            r.error(`${path}.yield`, 'work-yield', 'a yield is a fraction of the mapped recipe, in [0, 1]', undefined, 'P-WORK-01');
        }
    });
    for (const [part, ws] of [...worksOf.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
        if (ws.length > 1) {
            r.flag('$.works', 'work-several-on-part', `part '${part}' has ${ws.length} works: they are refused, since how one recipe is shared between them is not given (decision 8)`, undefined, 'P-WORK-01');
        }
    }
    const pairs = new Set();
    a.links.forEach((l, i) => {
        const path = `$.links[${i}]`;
        const key = `${l.part}|${l.feeds}`;
        if (pairs.has(key))
            r.error(path, 'duplicate-id', `the link from '${l.part}' to '${l.feeds}' is mapped twice`);
        pairs.add(key);
        if (!model.dependencies.some((d) => d.part === l.part && d.feeds === l.feeds)) {
            r.error(path, 'work-link-dependency', `no dependency in which '${l.part}' feeds '${l.feeds}': a functional link attaches only to an existing dependency`, undefined, 'P-DEP-01');
        }
        for (const [end, unit, field] of [[l.part, l.workUnits.part, 'part'], [l.feeds, l.workUnits.feeds, 'feeds']]) {
            const ws = worksOf.get(end) ?? [];
            if (ws.length === 0)
                r.error(`${path}.${field}`, 'work-link-endpoint', `part '${end}' has no work mapped, so the link has nothing to read or cap`, undefined, 'P-DEP-01');
            else if (!ws.some((w) => w.workUnit === unit)) {
                r.error(`${path}.workUnits.${field}`, 'work-link-units', `part '${end}' has no work counted in '${unit}'`, undefined, 'P-DEP-01');
            }
        }
        if (!Q.isPositive(l.ratio))
            r.error(`${path}.ratio`, 'work-ratio', 'a ratio is above 0: upstream work units per downstream work unit', undefined, 'P-DEP-01');
        if (l.lagSteps > 0)
            r.flag(`${path}.lagSteps`, 'work-link-lag', `a lag of ${l.lagSteps} is accepted and refused when computed: lagged links are not given in this release (D-3)`, undefined, 'P-DEP-01');
        if (l.semantics === 'exhaustible-support') {
            r.flag(`${path}.semantics`, 'work-link-exhaustible', 'finite shared support is accepted and refused when computed: how upstream work is divided between recipients is not given (D-4)', undefined, 'P-DEP-01');
        }
    });
    return r.issues;
}
/** Parse and check a work attachment against its model and that model's digest (RunStamp.mapping.sha256). */
export function validateWorkAttachment(doc, model, modelSha256) {
    const parsed = parseWorkAttachment(doc);
    if (!parsed.attachment)
        return { ok: false, issues: parsed.issues };
    const issues = [...parsed.issues, ...checkWorkAttachment(parsed.attachment, model, modelSha256)];
    const ok = !issues.some((i) => i.severity === 'error');
    return { ok, issues, attachment: ok ? parsed.attachment : undefined };
}
