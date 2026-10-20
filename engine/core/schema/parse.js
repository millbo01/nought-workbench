// Shape validation: reads an untrusted JSON document into the typed schema,
// collecting every issue with its path. Unknown fields are rejected, so a typo
// never silently becomes a default. Structural CANON rules that need the whole
// model are in validate.ts.
import { parseRational } from "../rational.js";
export class Reader {
    issues = [];
    error(path, code, message, canon, proposal) {
        this.issues.push({ severity: 'error', code, path, message, canon, proposal });
    }
    flag(path, code, message, canon, proposal) {
        this.issues.push({ severity: 'flag', code, path, message, canon, proposal });
    }
    get ok() {
        return !this.issues.some((i) => i.severity === 'error');
    }
}
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
/** Fields that belong only to parts. On any other element they break C2.3a or C3.10. */
const PART_ONLY = ['units', 'requirement', 'upkeep', 'rank', 'access', 'loads'];
function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function readObject(r, v, path, allowed, component = 'other') {
    if (!isPlainObject(v)) {
        r.error(path, 'type', 'expected an object');
        return undefined;
    }
    for (const k of Object.keys(v).sort()) {
        if (allowed.includes(k))
            continue;
        const p = `${path}.${k}`;
        if (PART_ONLY.includes(k) && component === 'governor') {
            r.error(p, 'governor-not-part', `the governor has no '${k}': it does no work, has no rank and is never a part`, 'C2.2c, C3.1c');
        }
        else if (k === 'units' && component === 'other') {
            r.error(p, 'units-belong-to-part', "units belong to a part; only parts have 'units'", 'C3.10');
        }
        else if (PART_ONLY.includes(k) && component === 'other') {
            r.error(p, 'part-field-on-non-part', `'${k}' belongs only to parts (anything that does work is a part)`, 'C2.3a');
        }
        else {
            r.error(p, 'unknown-field', `unknown field '${k}'`);
        }
    }
    return v;
}
export function readString(r, o, key, path) {
    const v = o[key];
    if (typeof v !== 'string') {
        r.error(`${path}.${key}`, v === undefined ? 'missing-field' : 'type', `'${key}' must be a string`);
        return undefined;
    }
    return v;
}
export function readOptString(r, o, key, path) {
    if (o[key] === undefined)
        return undefined;
    return readString(r, o, key, path);
}
export function readId(r, o, key, path) {
    const s = readString(r, o, key, path);
    if (s !== undefined && !ID_RE.test(s)) {
        r.error(`${path}.${key}`, 'bad-id', `'${s}' is not a valid id (letters, digits, '_', '.', ':', '-')`);
        return undefined;
    }
    return s;
}
function idValue(r, v, path) {
    if (typeof v !== 'string' || !ID_RE.test(v)) {
        r.error(path, 'bad-id', 'expected an id');
        return undefined;
    }
    return v;
}
export function readRationalValue(r, v, path) {
    if (typeof v !== 'string' && typeof v !== 'number') {
        r.error(path, v === undefined ? 'missing-field' : 'type', 'expected a number (or a decimal or fraction string)');
        return undefined;
    }
    try {
        return parseRational(v);
    }
    catch (e) {
        r.error(path, 'bad-number', e.message);
        return undefined;
    }
}
export function readRational(r, o, key, path) {
    return readRationalValue(r, o[key], `${path}.${key}`);
}
export function readInteger(r, o, key, path, min) {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min) {
        r.error(`${path}.${key}`, v === undefined ? 'missing-field' : 'type', `'${key}' must be an integer of at least ${min}`);
        return undefined;
    }
    return v;
}
export function readBoolean(r, o, key, path) {
    const v = o[key];
    if (v === undefined)
        return undefined;
    if (typeof v !== 'boolean') {
        r.error(`${path}.${key}`, 'type', `'${key}' must be true or false`);
        return undefined;
    }
    return v;
}
/** `{ "gap": "note" }` is an explicit information gap; anything else is read by `read`. */
export function readOrGap(r, v, path, read) {
    if (isPlainObject(v) && 'gap' in v) {
        const keys = Object.keys(v);
        if (keys.length !== 1 || typeof v['gap'] !== 'string' || v['gap'].trim() === '') {
            r.error(path, 'bad-gap', 'an information gap is written { "gap": "<note saying what is missing>" }');
            return undefined;
        }
        return { gap: true, note: v['gap'] };
    }
    return read(v, path);
}
export function readArray(r, o, key, path, read, required = true) {
    const v = o[key];
    if (v === undefined && !required)
        return [];
    if (!Array.isArray(v)) {
        r.error(`${path}.${key}`, v === undefined ? 'missing-field' : 'type', `'${key}' must be a list`);
        return [];
    }
    const out = [];
    v.forEach((item, i) => {
        const x = read(item, `${path}.${key}[${i}]`);
        if (x !== undefined)
            out.push(x);
    });
    return out;
}
function annotations(r, o, path) {
    return { label: readOptString(r, o, 'label', path), rationale: readOptString(r, o, 'rationale', path) };
}
const ANNOT = ['label', 'rationale'];
// ---------------------------------------------------------------- rules
function readTablePoints(r, o, path) {
    return readArray(r, o, 'points', path, (v, p) => {
        const e = readObject(r, v, p, ['at', 'value']);
        if (!e)
            return undefined;
        const at = readRational(r, e, 'at', p);
        const value = readRational(r, e, 'value', p);
        return at && value ? { at, value } : undefined;
    });
}
function readSilence(r, v, path) {
    if (isPlainObject(v) && v['normal'] !== undefined) {
        r.error(`${path}.normal`, 'silence-no-intervention', 'silence read as no intervention gives no value: the governor does not act (Q-029); only an alarm response is stated', 'C7.1b');
    }
    const o = readObject(r, v, path, ['alarm', 'normal']);
    if (!o)
        return undefined;
    const alarm = o['alarm'] === undefined ? undefined : readOrGap(r, o['alarm'], `${path}.alarm`, (x, p) => readRationalValue(r, x, p));
    return { alarm };
}
export function readLevelRule(r, v, path) {
    if (!isPlainObject(v)) {
        r.error(path, 'type', 'expected a rule object');
        return undefined;
    }
    switch (v['kind']) {
        case 'constant': {
            const o = readObject(r, v, path, ['kind', 'value']);
            const value = o && readRational(r, o, 'value', path);
            return value ? { kind: 'constant', value } : undefined;
        }
        case 'step': {
            const o = readObject(r, v, path, ['kind', 'reads', 'below', 'steps', 'whenSilent']);
            if (!o)
                return undefined;
            const reads = readId(r, o, 'reads', path);
            const below = readRational(r, o, 'below', path);
            const steps = readArray(r, o, 'steps', path, (x, p) => {
                const e = readObject(r, x, p, ['from', 'value']);
                if (!e)
                    return undefined;
                const from = readRational(r, e, 'from', p);
                const value = readRational(r, e, 'value', p);
                return from && value ? { from, value } : undefined;
            });
            const whenSilent = o['whenSilent'] === undefined ? undefined : readSilence(r, o['whenSilent'], `${path}.whenSilent`);
            return reads && below ? { kind: 'step', reads, below, steps, whenSilent } : undefined;
        }
        case 'linear': {
            const o = readObject(r, v, path, ['kind', 'reads', 'points', 'whenSilent']);
            if (!o)
                return undefined;
            const reads = readId(r, o, 'reads', path);
            const points = readTablePoints(r, o, path);
            const whenSilent = o['whenSilent'] === undefined ? undefined : readSilence(r, o['whenSilent'], `${path}.whenSilent`);
            return reads ? { kind: 'linear', reads, points, whenSilent } : undefined;
        }
        default:
            r.error(`${path}.kind`, 'bad-rule', "a rule on a sensed level has kind 'constant', 'step' or 'linear'", 'C3.6b');
            return undefined;
    }
}
function readRequirementRule(r, v, path, allowPerUnit) {
    if (!isPlainObject(v)) {
        r.error(path, 'type', 'expected a rule object');
        return undefined;
    }
    switch (v['kind']) {
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
            const points = readTablePoints(r, o, path);
            return load ? { kind: 'table', load, points } : undefined;
        }
        case 'per-unit': {
            if (!allowPerUnit) {
                r.error(`${path}.kind`, 'requirement-reads-units', 'a requirement rule cannot read units: units switched off or lost never lower it', 'C3.12c');
                return undefined;
            }
            const o = readObject(r, v, path, ['kind', 'per']);
            const per = o && readRational(r, o, 'per', path);
            return per ? { kind: 'per-unit', per } : undefined;
        }
        default:
            r.error(`${path}.kind`, 'bad-rule', "a requirement rule has kind 'constant', 'linear' or 'table'", 'C3.12a');
            return undefined;
    }
}
function readPerResource(r, o, key, path, read) {
    return readArray(r, o, key, path, (x, p) => {
        const e = readObject(r, x, p, ['resource', 'rule']);
        if (!e)
            return undefined;
        const resource = readId(r, e, 'resource', p);
        const rule = readOrGap(r, e['rule'], `${p}.rule`, read);
        return resource && rule ? { resource, rule } : undefined;
    }, false);
}
function readDial(r, v, path) {
    const o = readObject(r, v, path, ['parameters', 'note']);
    if (!o)
        return undefined;
    const params = readObject(r, o['parameters'], `${path}.parameters`, Object.keys(isPlainObject(o['parameters']) ? o['parameters'] : {}));
    if (!params)
        return undefined;
    const parameters = {};
    for (const k of Object.keys(params).sort()) {
        const x = readRationalValue(r, params[k], `${path}.parameters.${k}`);
        if (x)
            parameters[k] = x;
    }
    return { parameters, note: readOptString(r, o, 'note', path) };
}
function readSendingDial(r, v, path) {
    if (isPlainObject(v) && v['kind'] === 'keeps-sending')
        return readObject(r, v, path, ['kind']) ? { kind: 'keeps-sending' } : undefined;
    if (isPlainObject(v) && v['kind'] === 'stops-when-short') {
        const o = readObject(r, v, path, ['kind', 'above']);
        if (!o)
            return undefined;
        const above = readArray(r, o, 'above', path, (x, q) => {
            const e = readObject(r, x, q, ['resource', 'amount']);
            if (!e)
                return undefined;
            const resource = readId(r, e, 'resource', q);
            const amount = readRational(r, e, 'amount', q);
            return resource && amount ? { resource, amount } : undefined;
        });
        return { kind: 'stops-when-short', above };
    }
    r.error(path, 'sending-dial', "the sending dial is { kind: 'keeps-sending' } or { kind: 'stops-when-short', above: [{ resource, amount }] } (decision Q-004)", 'C3.1b, C7.1b', 'PROP-SENSE-01');
    return undefined;
}
function readLoadDials(r, v, path) {
    const o = readObject(r, v, path, ['unitLossUnderShortfall', 'unitRebuilding', 'backlog', 'damage']);
    if (!o)
        return undefined;
    const dial = (k) => (o[k] === undefined ? undefined : readOrGap(r, o[k], `${path}.${k}`, (x, q) => readDial(r, x, q)));
    return { unitLossUnderShortfall: dial('unitLossUnderShortfall'), unitRebuilding: dial('unitRebuilding'), backlog: dial('backlog'), damage: dial('damage') };
}
function readMeasure(r, v, path) {
    if (!isPlainObject(v)) {
        r.error(path, 'type', 'expected a measure object');
        return undefined;
    }
    switch (v['of']) {
        case 'store-content': {
            const o = readObject(r, v, path, ['of', 'store']);
            const store = o && readId(r, o, 'store', path);
            return store ? { of: 'store-content', store } : undefined;
        }
        case 'load': {
            const o = readObject(r, v, path, ['of', 'part', 'load']);
            if (!o)
                return undefined;
            const part = readId(r, o, 'part', path);
            const load = readId(r, o, 'load', path);
            return part && load ? { of: 'load', part, load } : undefined;
        }
        case 'received': {
            const o = readObject(r, v, path, ['of', 'part', 'resource']);
            if (!o)
                return undefined;
            const part = readId(r, o, 'part', path);
            const resource = readId(r, o, 'resource', path);
            return part && resource ? { of: 'received', part, resource } : undefined;
        }
        case 'entering':
        case 'inflow': {
            const of = v['of'];
            const o = readObject(r, v, path, ['of', 'resource']);
            const resource = o && readId(r, o, 'resource', path);
            return resource ? { of, resource } : undefined;
        }
        default:
            r.error(`${path}.of`, 'bad-measure', "a level measures 'store-content', 'load', 'received', 'entering' or 'inflow'", 'C7.1c');
            return undefined;
    }
}
function readIdList(r, o, key, path, required = true) {
    return readArray(r, o, key, path, (x, p) => idValue(r, x, p), required);
}
function readKind(r, o, path) {
    const k = o['kind'];
    if (k !== 'governor-set' && k !== 'built-in') {
        r.error(`${path}.kind`, 'setting-kind', "kind is 'governor-set' or 'built-in'", 'C3.6a');
        return undefined;
    }
    return k;
}
function readBand(r, v, path) {
    const o = readObject(r, v, path, ['level', 'lower', 'upper', 'held']);
    if (!o)
        return undefined;
    const level = readId(r, o, 'level', path);
    const num = (k) => readOrGap(r, o[k], `${path}.${k}`, (x, p) => readRationalValue(r, x, p));
    const lower = num('lower');
    const upper = num('upper');
    const held = o['held'] === undefined ? undefined : num('held');
    return level && lower && upper ? { level, lower, upper, held } : undefined;
}
// ---------------------------------------------------------------- model
const MODEL_KEYS = ['schemaVersion', 'id', ...ANNOT, 'resources', 'boundary', 'parts', 'dependencies', 'governor', 'levels',
    'indicators', 'settings', 'modes', 'initialMode', 'protectedFlow', 'routes', 'stores', 'outsideInputs', 'thresholdSwitches'];
export function parseModel(doc) {
    const r = new Reader();
    if (isPlainObject(doc) && Array.isArray(doc['boundary'])) {
        r.error('$.boundary', 'one-boundary', 'a model has exactly one boundary in this phase', 'C2.1');
        return { issues: r.issues };
    }
    if (isPlainObject(doc) && doc['boundaries'] !== undefined) {
        r.error('$.boundaries', 'one-boundary', 'a model has exactly one boundary in this phase', 'C2.1');
        return { issues: r.issues };
    }
    const o = readObject(r, doc, '$', MODEL_KEYS);
    if (!o)
        return { issues: r.issues };
    const path = '$';
    const schemaVersion = readString(r, o, 'schemaVersion', path);
    const id = readId(r, o, 'id', path);
    const resources = readArray(r, o, 'resources', path, (v, p) => {
        const e = readObject(r, v, p, ['id', 'unit', 'storable', ...ANNOT]);
        if (!e)
            return undefined;
        const rid = readId(r, e, 'id', p);
        const unit = readString(r, e, 'unit', p);
        const storable = readBoolean(r, e, 'storable', p);
        if (storable === undefined && e['storable'] === undefined) {
            r.error(`${p}.storable`, 'missing-field', 'a resource states whether it can be held from one step to the next (storable: true or false)');
        }
        return rid && unit && storable !== undefined ? { id: rid, unit, storable, ...annotations(r, e, p) } : undefined;
    });
    let boundary;
    {
        const p = '$.boundary';
        const e = readObject(r, o['boundary'], p, ['id', 'top', ...ANNOT]);
        if (e) {
            const bid = readId(r, e, 'id', p);
            let top;
            if (Array.isArray(e['top'])) {
                r.error(`${p}.top`, 'one-top', 'exactly one part is the top', 'C2.3d');
            }
            else if (e['top'] === undefined) {
                r.error(`${p}.top`, 'one-top', 'the boundary must name the top (or record it as an explicit gap)', 'C2.1, C2.3d');
            }
            else {
                top = readOrGap(r, e['top'], `${p}.top`, (x, q) => idValue(r, x, q));
            }
            if (bid && top)
                boundary = { id: bid, top, ...annotations(r, e, p) };
        }
    }
    const parts = readArray(r, o, 'parts', path, (v, p) => {
        if (isPlainObject(v) && v['top'] !== undefined) {
            r.error(`${p}.top`, 'one-top', 'the top is fixed by the boundary: declare it once, as boundary.top', 'C2.1');
        }
        const e = readObject(r, v, p, ['id', ...ANNOT, 'units', 'loads', 'requirement', 'upkeep', 'rank', 'setsOwnAccess', 'draws',
            'capacity', 'efficiency', 'loadDials', 'structure', 'top'], 'part');
        if (!e)
            return undefined;
        const pid = readId(r, e, 'id', p);
        const units = readOrGap(r, e['units'], `${p}.units`, (x, q) => readRationalValue(r, x, q));
        const loads = readArray(r, e, 'loads', p, (x, q) => {
            const l = readObject(r, x, q, ['id', 'unit', ...ANNOT]);
            if (!l)
                return undefined;
            const lid = readId(r, l, 'id', q);
            const unit = readString(r, l, 'unit', q);
            return lid && unit ? { id: lid, unit, ...annotations(r, l, q) } : undefined;
        }, false);
        const requirement = readPerResource(r, e, 'requirement', p, (x, q) => readRequirementRule(r, x, q, false));
        const upkeep = readPerResource(r, e, 'upkeep', p, (x, q) => readRequirementRule(r, x, q, true));
        const rank = readOrGap(r, e['rank'], `${p}.rank`, (x, q) => {
            const rk = readObject(r, x, q, ['layer', 'position']);
            if (!rk)
                return undefined;
            const layer = rk['layer'] === undefined ? undefined : readInteger(r, rk, 'layer', q, 0);
            const position = readOrGap(r, rk['position'], `${q}.position`, (y, s) => {
                if (typeof y !== 'number' || !Number.isSafeInteger(y) || y < 1) {
                    r.error(s, 'type', 'position must be an integer of at least 1');
                    return undefined;
                }
                return y;
            });
            return position === undefined ? undefined : { layer, position };
        });
        const setsOwnAccess = readBoolean(r, e, 'setsOwnAccess', p) ?? false;
        const draws = e['draws'] === undefined ? undefined
            : readOrGap(r, e['draws'], `${p}.draws`, (x, q) => (Array.isArray(x) ? x.map((y, i) => idValue(r, y, `${q}[${i}]`)).filter((y) => y !== undefined) : (r.error(q, 'type', 'expected a list of resource ids'), undefined)));
        const dial = (k) => (e[k] === undefined ? undefined : readOrGap(r, e[k], `${p}.${k}`, (x, q) => readDial(r, x, q)));
        if (pid && units && rank) {
            return {
                id: pid, ...annotations(r, e, p), units, loads, requirement, upkeep, rank, setsOwnAccess, draws,
                capacity: dial('capacity'), efficiency: dial('efficiency'),
                loadDials: e['loadDials'] === undefined ? undefined : readLoadDials(r, e['loadDials'], `${p}.loadDials`),
                structure: readOptString(r, e, 'structure', p),
            };
        }
        if (pid && e['units'] === undefined)
            r.error(`${p}.units`, 'missing-field', "a part states its units (or an explicit gap)", 'C3.10');
        if (pid && e['rank'] === undefined)
            r.error(`${p}.rank`, 'missing-field', 'a part states its rank (or an explicit gap)', 'C2.3c');
        return undefined;
    });
    const dependencies = readArray(r, o, 'dependencies', path, (v, p) => {
        const e = readObject(r, v, p, ['part', 'feeds', ...ANNOT]);
        if (!e)
            return undefined;
        const part = readId(r, e, 'part', p);
        const feeds = readId(r, e, 'feeds', p);
        return part && feeds ? { part, feeds, ...annotations(r, e, p) } : undefined;
    });
    let governor;
    {
        const p = '$.governor';
        const e = readObject(r, o['governor'], p, ['id', ...ANNOT, 'bands', 'controls'], 'governor');
        if (e) {
            const gid = readId(r, e, 'id', p);
            const bands = readArray(r, e, 'bands', p, (x, q) => readBand(r, x, q));
            const c = readObject(r, e['controls'], `${p}.controls`, ['settings', 'stores', 'routes']);
            const controls = c ? {
                settings: readIdList(r, c, 'settings', `${p}.controls`),
                stores: readIdList(r, c, 'stores', `${p}.controls`),
                routes: readIdList(r, c, 'routes', `${p}.controls`),
            } : undefined;
            if (gid && controls)
                governor = { id: gid, bands, controls, ...annotations(r, e, p) };
        }
    }
    const levels = readArray(r, o, 'levels', path, (v, p) => {
        const e = readObject(r, v, p, ['id', 'unit', ...ANNOT, 'measures', 'producedBy', 'route', 'missingSignal', 'whenProducerShort']);
        if (!e)
            return undefined;
        const lid = readId(r, e, 'id', p);
        const unit = readString(r, e, 'unit', p);
        if (e['producedBy'] === undefined) {
            r.error(`${p}.producedBy`, 'level-producer', 'every level names the part that produces it (sensing is work done by parts)', 'C3.1a, C7.1a');
        }
        if (e['route'] === undefined) {
            r.error(`${p}.route`, 'level-route', 'every level names the route that carries it (in the shared flow or a route of its own)', 'C7.1b');
        }
        if (e['missingSignal'] === undefined) {
            r.error(`${p}.missingSignal`, 'missing-field', "every level states how the governor reads it when silent: 'no-intervention' or 'alarm' (or an explicit gap)", 'C7.1b');
        }
        const measures = readOrGap(r, e['measures'], `${p}.measures`, (x, q) => readMeasure(r, x, q));
        const producedBy = e['producedBy'] === undefined ? undefined : readOrGap(r, e['producedBy'], `${p}.producedBy`, (x, q) => idValue(r, x, q));
        const route = e['route'] === undefined ? undefined : readOrGap(r, e['route'], `${p}.route`, (x, q) => {
            if (isPlainObject(x) && x['kind'] === 'own-route') {
                return readObject(r, x, q, ['kind']) ? { kind: 'own-route' } : undefined;
            }
            if (isPlainObject(x) && x['kind'] === 'shared-flow') {
                const so = readObject(r, x, q, ['kind', 'resource']);
                const res = so && readId(r, so, 'resource', q);
                return res ? { kind: 'shared-flow', resource: res } : undefined;
            }
            r.error(q, 'level-route', "a signal route is { kind: 'own-route' } or { kind: 'shared-flow', resource }", 'C7.1b');
            return undefined;
        });
        const missingSignal = e['missingSignal'] === undefined ? undefined : readOrGap(r, e['missingSignal'], `${p}.missingSignal`, (x, q) => {
            if (x !== 'no-intervention' && x !== 'alarm') {
                r.error(q, 'type', "missingSignal is 'no-intervention' or 'alarm'");
                return undefined;
            }
            return x;
        });
        const whenProducerShort = e['whenProducerShort'] === undefined ? undefined
            : readOrGap(r, e['whenProducerShort'], `${p}.whenProducerShort`, (x, q) => readSendingDial(r, x, q));
        return lid && unit && measures && producedBy && route && missingSignal
            ? { id: lid, unit, ...annotations(r, e, p), measures, producedBy, route, missingSignal, whenProducerShort } : undefined;
    });
    const indicators = readArray(r, o, 'indicators', path, (v, p) => {
        const e = readObject(r, v, p, ['id', ...ANNOT, 'kind', 'watches']);
        if (!e)
            return undefined;
        const iid = readId(r, e, 'id', p);
        const kind = readOrGap(r, e['kind'], `${p}.kind`, (x, q) => {
            if (x !== 'protected-flow' && x !== 'held-level' && x !== 'neither') {
                r.error(q, 'indicator-kind', "an indicator states whether it is the 'protected-flow', a 'held-level' or 'neither'", 'C3.3');
                return undefined;
            }
            return x;
        });
        const w = readObject(r, e['watches'], `${p}.watches`, ['protectedFlow', 'level', 'measure']);
        let watches;
        if (w) {
            const keys = Object.keys(w);
            if (keys.length !== 1)
                r.error(`${p}.watches`, 'indicator-watches', 'an indicator watches exactly one thing');
            else if (w['protectedFlow'] === true)
                watches = { protectedFlow: true };
            else if (w['level'] !== undefined) {
                const l = idValue(r, w['level'], `${p}.watches.level`);
                if (l)
                    watches = { level: l };
            }
            else if (w['measure'] !== undefined) {
                const m = readMeasure(r, w['measure'], `${p}.watches.measure`);
                if (m)
                    watches = { measure: m };
            }
            else
                r.error(`${p}.watches`, 'indicator-watches', 'protectedFlow must be true');
        }
        return iid && kind && watches ? { id: iid, kind, watches, ...annotations(r, e, p) } : undefined;
    }, false);
    const settings = readArray(r, o, 'settings', path, (v, p) => {
        const e = readObject(r, v, p, ['id', ...ANNOT, 'part', 'resource', 'kind', 'rule', 'proposalData']);
        if (!e)
            return undefined;
        const sid = readId(r, e, 'id', p);
        const part = readId(r, e, 'part', p);
        const resource = readId(r, e, 'resource', p);
        const kind = readKind(r, e, p);
        const rule = readOrGap(r, e['rule'], `${p}.rule`, (x, q) => readLevelRule(r, x, q));
        let proposalData;
        if (e['proposalData'] !== undefined) {
            if (!isPlainObject(e['proposalData']))
                r.error(`${p}.proposalData`, 'type', 'proposalData is an object keyed by proposal id');
            else
                proposalData = e['proposalData'];
        }
        return sid && part && resource && kind && rule ? { id: sid, part, resource, kind, rule, proposalData, ...annotations(r, e, p) } : undefined;
    });
    const modes = readArray(r, o, 'modes', path, (v, p) => {
        const e = readObject(r, v, p, ['id', ...ANNOT, 'held', 'settings', 'order']);
        if (!e)
            return undefined;
        const mid = readId(r, e, 'id', p);
        const held = readIdList(r, e, 'held', p);
        const ms = readIdList(r, e, 'settings', p);
        const order = e['order'] === undefined ? undefined : readArray(r, e, 'order', p, (x, q) => {
            const oe = readObject(r, x, q, ['part', 'position']);
            if (!oe)
                return undefined;
            const part = readId(r, oe, 'part', q);
            const position = readInteger(r, oe, 'position', q, 1);
            return part && position !== undefined ? { part, position } : undefined;
        });
        return mid ? { id: mid, held, settings: ms, order, ...annotations(r, e, p) } : undefined;
    });
    const initialMode = readId(r, o, 'initialMode', path);
    let protectedFlow;
    {
        const p = '$.protectedFlow';
        const e = readObject(r, o['protectedFlow'], p, ['resource', ...ANNOT]);
        if (e) {
            const resource = readOrGap(r, e['resource'], `${p}.resource`, (x, q) => idValue(r, x, q));
            if (resource)
                protectedFlow = { resource, ...annotations(r, e, p) };
        }
    }
    const routes = readArray(r, o, 'routes', path, (v, p) => {
        const e = readObject(r, v, p, ['id', ...ANNOT, 'resource', 'from', 'to', 'kind', 'capacity', 'structure']);
        if (!e)
            return undefined;
        const rid = readId(r, e, 'id', p);
        const resource = readId(r, e, 'resource', p);
        const f = e['from'];
        if (isPlainObject(f) && f['part'] !== undefined) {
            r.error(`${p}.from`, 'no-part-to-part-route', 'nothing passes between parts: a route runs from the shared flow to a part, never from a part', 'C3.4a');
        }
        else if (isPlainObject(f) && (f['store'] !== undefined || f['outsideInput'] !== undefined)) {
            r.error(`${p}.from`, 'route-not-from-shared-flow', 'store releases and outside input enter the one shared flow of their resource, and routes run from the shared flow to parts only; for a ring-fenced allocation, give the receiving part a built-in access setting (decision Q-010)', 'C2.5, C3.4b');
        }
        else if (f !== undefined && f !== 'shared-flow') {
            r.error(`${p}.from`, 'route-not-from-shared-flow', "routes run from the shared flow to parts only: 'from' may be omitted or 'shared-flow' (decision Q-010)", 'C2.5');
        }
        const to = readId(r, e, 'to', p);
        const kind = readKind(r, e, p);
        const capacity = readOrGap(r, e['capacity'], `${p}.capacity`, (x, q) => readLevelRule(r, x, q));
        return rid && resource && to && kind && capacity
            ? { id: rid, resource, to, kind, capacity, structure: readOptString(r, e, 'structure', p), ...annotations(r, e, p) } : undefined;
    }, false);
    const stores = readArray(r, o, 'stores', path, (v, p) => {
        const e = readObject(r, v, p, ['id', ...ANNOT, 'resource', 'capacity', 'release', 'fill', 'structure']);
        if (!e)
            return undefined;
        const sid = readId(r, e, 'id', p);
        const resource = readId(r, e, 'resource', p);
        const capacity = readOrGap(r, e['capacity'], `${p}.capacity`, (x, q) => readRationalValue(r, x, q));
        const storeRule = (k) => {
            const so = readObject(r, e[k], `${p}.${k}`, ['kind', 'rule']);
            if (!so)
                return undefined;
            const kind = readKind(r, so, `${p}.${k}`);
            const rule = readOrGap(r, so['rule'], `${p}.${k}.rule`, (x, q) => readLevelRule(r, x, q));
            return kind && rule ? { kind, rule } : undefined;
        };
        const release = storeRule('release');
        const fill = storeRule('fill');
        return sid && resource && capacity && release && fill
            ? { id: sid, resource, capacity, release, fill, structure: readOptString(r, e, 'structure', p), ...annotations(r, e, p) } : undefined;
    }, false);
    const outsideInputs = readArray(r, o, 'outsideInputs', path, (v, p) => {
        const e = readObject(r, v, p, ['id', 'resource', ...ANNOT]);
        if (!e)
            return undefined;
        const oid = readId(r, e, 'id', p);
        const resource = readId(r, e, 'resource', p);
        return oid && resource ? { id: oid, resource, ...annotations(r, e, p) } : undefined;
    }, false);
    const thresholdSwitches = readArray(r, o, 'thresholdSwitches', path, (v, p) => {
        const e = readObject(r, v, p, ['id', ...ANNOT, 'level', 'threshold', 'direction', 'fromMode', 'toMode']);
        if (!e)
            return undefined;
        const tid = readId(r, e, 'id', p);
        const level = readId(r, e, 'level', p);
        const threshold = readRational(r, e, 'threshold', p);
        const rawDirection = e['direction'];
        const direction = rawDirection === 'rising' || rawDirection === 'falling' ? rawDirection : undefined;
        if (direction === undefined)
            r.error(`${p}.direction`, 'type', "direction is 'rising' or 'falling'");
        const fromMode = e['fromMode'] === undefined ? undefined : readId(r, e, 'fromMode', p);
        const toMode = readId(r, e, 'toMode', p);
        return tid && level && threshold && direction && toMode
            ? { id: tid, level, threshold, direction, fromMode, toMode, ...annotations(r, e, p) } : undefined;
    }, false);
    if (!r.ok || !schemaVersion || !id || !boundary || !governor || !initialMode || !protectedFlow) {
        if (r.ok)
            r.error('$', 'incomplete', 'the model is incomplete');
        return { issues: r.issues };
    }
    return {
        model: {
            schemaVersion, id, ...annotations(r, o, path), resources, boundary, parts, dependencies, governor, levels, indicators,
            settings, modes, initialMode, protectedFlow, routes, stores, outsideInputs, thresholdSwitches,
        },
        issues: r.issues,
    };
}
// ---------------------------------------------------------------- scenario
const SCENARIO_KEYS = ['schemaVersion', 'id', ...ANNOT, 'model', 'steps', 'seed', 'initial', 'inflow', 'outsideInput', 'loads', 'events', 'enable'];
const COMPONENT_KEYS = ['resources', 'boundary', 'parts', 'governor', 'levels', 'settings', 'modes', 'routes', 'stores', 'outsideInputs', 'dependencies'];
function readEntries(r, o, path) {
    return readArray(r, o, 'entries', path, (v, p) => {
        const e = readObject(r, v, p, ['step', 'value']);
        if (!e)
            return undefined;
        const step = readInteger(r, e, 'step', p, 0);
        const value = readOrGap(r, e['value'], `${p}.value`, (x, q) => readRationalValue(r, x, q));
        return step !== undefined && value ? { step, value } : undefined;
    });
}
export function parseScenario(doc) {
    const r = new Reader();
    if (isPlainObject(doc)) {
        for (const k of COMPONENT_KEYS) {
            if (doc[k] !== undefined) {
                r.error(`$.${k}`, 'scenario-not-system', `a scenario is a load applied to a system, not a system: '${k}' belongs in the model`, undefined, 'APP-04');
            }
        }
    }
    const o = readObject(r, doc, '$', [...SCENARIO_KEYS, ...COMPONENT_KEYS]);
    if (!o)
        return { issues: r.issues };
    const path = '$';
    const schemaVersion = readString(r, o, 'schemaVersion', path);
    const id = readId(r, o, 'id', path);
    const model = readId(r, o, 'model', path);
    const steps = readInteger(r, o, 'steps', path, 1);
    const seed = readInteger(r, o, 'seed', path, 0);
    let initial;
    {
        const p = '$.initial';
        const e = readObject(r, o['initial'], p, ['stores', 'readings']);
        if (e) {
            const stores = readArray(r, e, 'stores', p, (v, q) => {
                const so = readObject(r, v, q, ['store', 'content']);
                if (!so)
                    return undefined;
                const store = readId(r, so, 'store', q);
                const content = readOrGap(r, so['content'], `${q}.content`, (x, s) => readRationalValue(r, x, s));
                return store && content ? { store, content } : undefined;
            }, false);
            const readings = readArray(r, e, 'readings', p, (v, q) => {
                const ro = readObject(r, v, q, ['level', 'value']);
                if (!ro)
                    return undefined;
                const level = readId(r, ro, 'level', q);
                const value = readRational(r, ro, 'value', q);
                return level && value ? { level, value } : undefined;
            }, false);
            initial = { stores, readings };
        }
    }
    const inflow = readArray(r, o, 'inflow', path, (v, p) => {
        const e = readObject(r, v, p, ['resource', 'entries']);
        if (!e)
            return undefined;
        const resource = readId(r, e, 'resource', p);
        return resource ? { resource, entries: readEntries(r, e, p) } : undefined;
    });
    const outsideInput = readArray(r, o, 'outsideInput', path, (v, p) => {
        const e = readObject(r, v, p, ['input', 'entries']);
        if (!e)
            return undefined;
        const input = readId(r, e, 'input', p);
        return input ? { input, entries: readEntries(r, e, p) } : undefined;
    }, false);
    const loads = readArray(r, o, 'loads', path, (v, p) => {
        const e = readObject(r, v, p, ['part', 'load', 'entries']);
        if (!e)
            return undefined;
        const part = readId(r, e, 'part', p);
        const load = readId(r, e, 'load', p);
        return part && load ? { part, load, entries: readEntries(r, e, p) } : undefined;
    }, false);
    const events = readArray(r, o, 'events', path, (v, p) => {
        if (!isPlainObject(v)) {
            r.error(p, 'type', 'expected an event object');
            return undefined;
        }
        switch (v['kind']) {
            case 'damage': {
                const e = readObject(r, v, p, ['step', 'kind', 'part', 'note']);
                if (!e)
                    return undefined;
                const step = readInteger(r, e, 'step', p, 0);
                const part = readId(r, e, 'part', p);
                return step !== undefined && part ? { step, kind: 'damage', part, note: readOptString(r, e, 'note', p) } : undefined;
            }
            case 'intervention': {
                const e = readObject(r, v, p, ['step', 'kind', 'setMode', 'replaceSettings', 'setHeld', 'setBand', 'note']);
                if (!e)
                    return undefined;
                const step = readInteger(r, e, 'step', p, 0);
                const setMode = e['setMode'] === undefined ? undefined : readId(r, e, 'setMode', p);
                const replaceSettings = e['replaceSettings'] === undefined ? undefined : readIdList(r, e, 'replaceSettings', p);
                const setHeld = e['setHeld'] === undefined ? undefined : readIdList(r, e, 'setHeld', p);
                const setBand = e['setBand'] === undefined ? undefined : readBand(r, e['setBand'], `${p}.setBand`);
                if (setMode === undefined && replaceSettings === undefined && setHeld === undefined && setBand === undefined) {
                    r.error(p, 'empty-intervention', 'an intervention changes the mode, settings, held levels or a band');
                }
                return step !== undefined ? { step, kind: 'intervention', setMode, replaceSettings, setHeld, setBand, note: readOptString(r, e, 'note', p) } : undefined;
            }
            case 'signal': {
                const e = readObject(r, v, p, ['step', 'kind', 'level', 'condition', 'note']);
                if (!e)
                    return undefined;
                const step = readInteger(r, e, 'step', p, 0);
                const level = readId(r, e, 'level', p);
                const condition = e['condition'];
                if (condition !== 'not-sent' && condition !== 'filtered-on-route') {
                    r.error(`${p}.condition`, 'type', "a signal condition is 'not-sent' or 'filtered-on-route'", 'C7.1b');
                    return undefined;
                }
                return step !== undefined && level ? { step, kind: 'signal', level, condition, note: readOptString(r, e, 'note', p) } : undefined;
            }
            default:
                r.error(`${p}.kind`, 'type', "an event is 'damage', 'intervention' or 'signal'");
                return undefined;
        }
    }, false);
    if (!r.ok || !schemaVersion || !id || !model || steps === undefined || seed === undefined || !initial) {
        if (r.ok)
            r.error('$', 'incomplete', 'the scenario is incomplete');
        return { issues: r.issues };
    }
    return {
        scenario: { schemaVersion, id, ...annotations(r, o, path), model, steps, seed, initial, inflow, outsideInput, loads, events, enable: readIdList(r, o, 'enable', path, false) },
        issues: r.issues,
    };
}
