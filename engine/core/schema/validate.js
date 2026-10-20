// Structural validation: the CANON rules that constrain a model as a whole.
// Each check cites its row in docs/rule-register.md. Errors reject the model;
// flags are reported and the model runs.
import * as Q from "../rational.js";
import { deriveLayers } from "../rank.js";
import { parseModel, parseScenario, Reader } from "./parse.js";
import { isGap } from "./types.js";
import { SCHEMA_VERSION } from "../version.js";
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
/** Units of what a measure reads, or undefined where a reference is unknown. */
function measureUnit(model, m) {
    const resUnit = (id) => model.resources.find((r) => r.id === id)?.unit;
    switch (m.of) {
        case 'store-content': {
            const s = model.stores.find((x) => x.id === m.store);
            return s ? resUnit(s.resource) : undefined;
        }
        case 'load':
            return model.parts.find((p) => p.id === m.part)?.loads.find((l) => l.id === m.load)?.unit;
        case 'received':
        case 'entering':
        case 'inflow':
            return resUnit(m.resource);
    }
}
function checkMeasure(r, model, m, path) {
    switch (m.of) {
        case 'store-content':
            if (!model.stores.some((s) => s.id === m.store))
                r.error(`${path}.store`, 'unknown-reference', `no store '${m.store}'`);
            return;
        case 'load': {
            const p = model.parts.find((x) => x.id === m.part);
            if (!p)
                r.error(`${path}.part`, 'unknown-reference', `no part '${m.part}'`);
            else if (!p.loads.some((l) => l.id === m.load))
                r.error(`${path}.load`, 'unknown-reference', `part '${m.part}' declares no load '${m.load}'`);
            return;
        }
        case 'received':
            if (!model.parts.some((x) => x.id === m.part))
                r.error(`${path}.part`, 'unknown-reference', `no part '${m.part}'`);
            if (!model.resources.some((x) => x.id === m.resource))
                r.error(`${path}.resource`, 'unknown-reference', `no resource '${m.resource}'`);
            return;
        case 'entering':
        case 'inflow':
            if (!model.resources.some((x) => x.id === m.resource))
                r.error(`${path}.resource`, 'unknown-reference', `no resource '${m.resource}'`);
    }
}
function checkLevelRule(r, model, rule, path, valueMustBeNonNegative) {
    const values = [];
    if (rule.kind === 'constant')
        values.push(rule.value);
    if (rule.kind === 'step') {
        values.push(rule.below, ...rule.steps.map((s) => s.value));
        if (rule.steps.length === 0)
            r.error(`${path}.steps`, 'bad-rule', 'a step table needs at least one step');
        if (!strictlyIncreasing(rule.steps.map((s) => s.from)))
            r.error(`${path}.steps`, 'bad-rule', "step 'from' values must strictly increase");
    }
    if (rule.kind === 'linear') {
        values.push(...rule.points.map((p) => p.value));
        if (rule.points.length < 2)
            r.error(`${path}.points`, 'bad-rule', 'a piecewise-linear table needs at least two points');
        if (!strictlyIncreasing(rule.points.map((p) => p.at)))
            r.error(`${path}.points`, 'bad-rule', "'at' values must strictly increase");
    }
    if (rule.kind !== 'constant') {
        if (!model.levels.some((l) => l.id === rule.reads)) {
            r.error(`${path}.reads`, 'unknown-reference', `no level '${rule.reads}': settings read sensed levels only`, 'C3.6b, C7.2');
        }
        const alarm = rule.whenSilent?.alarm;
        if (alarm !== undefined && !isGap(alarm))
            values.push(alarm);
    }
    if (valueMustBeNonNegative && values.some((v) => Q.isNegative(v))) {
        r.error(path, 'negative', 'this rule gives a negative amount');
    }
}
function checkRequirementRule(r, part, rule, path, what) {
    const loadIds = new Set(part.loads.map((l) => l.id));
    if (rule.kind === 'constant' && Q.isNegative(rule.value))
        r.error(path, 'negative', `a negative ${what}`);
    if (rule.kind === 'per-unit' && Q.isNegative(rule.per))
        r.error(path, 'negative', `a negative ${what} per unit`);
    if (rule.kind === 'linear') {
        if (Q.isNegative(rule.base))
            r.error(`${path}.base`, 'negative', `a negative ${what} base`);
        rule.terms.forEach((t, i) => {
            if (!loadIds.has(t.load))
                r.error(`${path}.terms[${i}].load`, 'unknown-reference', `part '${part.id}' declares no load '${t.load}'`);
            if (what === 'requirement' && Q.isNegative(t.per)) {
                r.error(`${path}.terms[${i}].per`, 'requirement-monotone', 'requirement falls only when an input the rule reads falls: a negative coefficient lowers it when the input rises (Q-009)', 'C3.12b');
            }
        });
    }
    if (rule.kind === 'table') {
        if (!loadIds.has(rule.load))
            r.error(`${path}.load`, 'unknown-reference', `part '${part.id}' declares no load '${rule.load}'`);
        if (rule.points.length < 2)
            r.error(`${path}.points`, 'bad-rule', 'a table needs at least two points');
        if (!strictlyIncreasing(rule.points.map((p) => p.at)))
            r.error(`${path}.points`, 'bad-rule', "'at' values must strictly increase");
        if (rule.points.some((p) => Q.isNegative(p.value)))
            r.error(`${path}.points`, 'negative', `a negative ${what}`);
        if (what === 'requirement' && !nonDecreasing(rule.points.map((p) => p.value))) {
            r.error(`${path}.points`, 'requirement-monotone', 'requirement falls only when an input the rule reads falls: this table falls while its input rises (Q-009)', 'C3.12b');
        }
    }
}
export function validateModelStructure(model) {
    const r = new Reader();
    if (model.schemaVersion !== SCHEMA_VERSION)
        r.error('$.schemaVersion', 'schema-version', `this engine reads schema ${SCHEMA_VERSION}, not '${model.schemaVersion}'`);
    // ---- ids (one namespace for every component and mapping aid)
    const owners = new Map();
    const claim = (id, what, path) => {
        const prev = owners.get(id);
        if (prev !== undefined) {
            const governorClash = (prev === 'governor' && what === 'part') || (prev === 'part' && what === 'governor');
            if (governorClash)
                r.error(path, 'governor-not-part', `'${id}' is listed as both a part and the governor: the governor is never a part`, 'C2.2c, C3.1c');
            else
                r.error(path, 'duplicate-id', `id '${id}' is used by a ${prev} and a ${what}`);
        }
        else
            owners.set(id, what);
    };
    model.resources.forEach((x, i) => claim(x.id, 'resource', `$.resources[${i}]`));
    claim(model.boundary.id, 'boundary', '$.boundary');
    model.parts.forEach((x, i) => claim(x.id, 'part', `$.parts[${i}]`));
    claim(model.governor.id, 'governor', '$.governor');
    model.levels.forEach((x, i) => claim(x.id, 'level', `$.levels[${i}]`));
    model.indicators.forEach((x, i) => claim(x.id, 'indicator', `$.indicators[${i}]`));
    model.settings.forEach((x, i) => claim(x.id, 'setting', `$.settings[${i}]`));
    model.modes.forEach((x, i) => claim(x.id, 'mode', `$.modes[${i}]`));
    model.routes.forEach((x, i) => claim(x.id, 'route', `$.routes[${i}]`));
    model.stores.forEach((x, i) => claim(x.id, 'store', `$.stores[${i}]`));
    model.outsideInputs.forEach((x, i) => claim(x.id, 'outside input', `$.outsideInputs[${i}]`));
    model.thresholdSwitches.forEach((x, i) => claim(x.id, 'threshold switch', `$.thresholdSwitches[${i}]`));
    const resourceIds = new Set(model.resources.map((x) => x.id));
    const partById = new Map(model.parts.map((p) => [p.id, p]));
    const isGovernor = (id) => id === model.governor.id;
    const notAPart = (id, path, role) => {
        if (isGovernor(id))
            r.error(path, 'governor-not-part', `the governor cannot be ${role}: it does no work and is never a part`, 'C2.2c, C3.1');
        else if (!partById.has(id))
            r.error(path, 'unknown-reference', `no part '${id}'`);
    };
    // ---- boundary and top (C2.1, C2.3d)
    const top = model.boundary.top;
    if (isGap(top)) {
        r.flag('$.boundary.top', 'gap', `the top is an information gap (${top.note}); every result that depends on it is refused`, 'C2.3d');
    }
    else if (isGovernor(top)) {
        r.error('$.boundary.top', 'governor-not-part', 'the governor cannot be the top: the top is a part', 'C2.2c, C2.3d');
    }
    else if (!partById.has(top)) {
        r.error('$.boundary.top', 'one-top', `the top '${top}' is not a part of the model`, 'C2.3d');
    }
    else if (partById.get(top)?.setsOwnAccess) {
        r.flag('$.boundary.top', 'self-set-access', 'the top is marked as setting its own access: a separate case, not computed', 'C3.5');
    }
    // ---- parts
    model.parts.forEach((p, i) => {
        const path = `$.parts[${i}]`;
        if (!isGap(p.units) && (!Q.isInteger(p.units) || Q.isNegative(p.units))) {
            r.error(`${path}.units`, 'units', 'units are a whole, non-negative count in this phase', 'C3.10');
        }
        const loads = new Set();
        p.loads.forEach((l, j) => {
            if (loads.has(l.id))
                r.error(`${path}.loads[${j}]`, 'duplicate-id', `load '${l.id}' is declared twice`);
            loads.add(l.id);
        });
        for (const [key, list] of [['requirement', p.requirement], ['upkeep', p.upkeep]]) {
            const seen = new Set();
            list.forEach((e, j) => {
                const q = `${path}.${key}[${j}]`;
                if (!resourceIds.has(e.resource))
                    r.error(`${q}.resource`, 'unknown-reference', `no resource '${e.resource}'`);
                if (seen.has(e.resource))
                    r.error(q, 'duplicate', `${key} for '${e.resource}' is given twice`);
                seen.add(e.resource);
                if (!isGap(e.rule))
                    checkRequirementRule(r, p, e.rule, `${q}.rule`, key);
            });
        }
        for (const u of p.upkeep) {
            const q = p.requirement.find((x) => x.resource === u.resource);
            if (!q) {
                r.error(`${path}.upkeep`, 'upkeep-without-requirement', `upkeep for '${u.resource}' but no requirement for it`, 'C3.11b');
            }
            else if (!isGap(u.rule) && !isGap(q.rule) && u.rule.kind === 'constant' && q.rule.kind === 'constant' && Q.gt(u.rule.value, q.rule.value)) {
                r.error(`${path}.upkeep`, 'upkeep-exceeds-requirement', `upkeep for '${u.resource}' (${Q.toCanonical(u.rule.value)}) exceeds the requirement (${Q.toCanonical(q.rule.value)}): requirement is upkeep plus work (decision Q-023)`, 'C3.11b');
            }
        }
        if (!isGap(p.rank) && p.rank.layer !== undefined && p.setsOwnAccess) {
            r.flag(`${path}.rank`, 'self-set-access', 'a separate case is excluded from ranking; its declared rank is ignored', 'C3.5');
        }
        // P-LOAD-01 dials (approved form): checked whenever present; read only where a scenario enables P-LOAD-01.
        const dials = p.loadDials;
        const loss = dials?.unitLossUnderShortfall;
        if (loss !== undefined && !isGap(loss)) {
            for (const k of Object.keys(loss.parameters).sort()) {
                if (!p.upkeep.some((u) => u.resource === k)) {
                    r.error(`${path}.loadDials.unitLossUnderShortfall.parameters.${k}`, 'load-dial', `'${k}' must be a resource for which the part states upkeep: units are lost for upkeep not covered`, 'C3.13d', 'P-LOAD-01');
                }
                else if (Q.isNegative(loss.parameters[k])) {
                    r.error(`${path}.loadDials.unitLossUnderShortfall.parameters.${k}`, 'negative', 'a negative rate');
                }
            }
            if (Object.keys(loss.parameters).length === 0)
                r.error(`${path}.loadDials.unitLossUnderShortfall`, 'load-dial', 'the unit-loss dial names at least one resource', 'C3.13d', 'P-LOAD-01');
        }
        const rebuild = dials?.unitRebuilding;
        if (rebuild !== undefined && !isGap(rebuild)) {
            const per = rebuild.parameters['perStep'];
            if (per === undefined || Q.isNegative(per))
                r.error(`${path}.loadDials.unitRebuilding.parameters`, 'load-dial', 'the rebuild dial states perStep, the most units rebuilt in a step (not negative)', 'C3.13d', 'P-LOAD-01');
            const costs = Object.keys(rebuild.parameters).filter((k) => k !== 'perStep').sort();
            if (costs.length === 0)
                r.error(`${path}.loadDials.unitRebuilding.parameters`, 'load-dial', 'the rebuild dial names at least one resource and its cost per unit rebuilt', 'C3.13d', 'P-LOAD-01');
            for (const k of costs) {
                if (!p.requirement.some((q) => q.resource === k)) {
                    r.error(`${path}.loadDials.unitRebuilding.parameters.${k}`, 'load-dial', `'${k}' must be a resource the part requires`, 'C3.13d', 'P-LOAD-01');
                }
                else if (!Q.isPositive(rebuild.parameters[k])) {
                    r.error(`${path}.loadDials.unitRebuilding.parameters.${k}`, 'load-dial', 'a cost per unit rebuilt is positive', 'C3.13d', 'P-LOAD-01');
                }
            }
        }
        if (p.setsOwnAccess) {
            r.flag(path, 'self-set-access', `part '${p.id}' sets its own access: a separate case, excluded from ranking and not computed (Q-014)`, 'C3.5');
            if (p.draws === undefined) {
                r.error(`${path}.draws`, 'missing-field', 'a separate case states the resources it draws (or an explicit gap), so results for them can be refused', 'C3.5');
            }
            else if (!isGap(p.draws)) {
                for (const d of p.draws)
                    if (!resourceIds.has(d))
                        r.error(`${path}.draws`, 'unknown-reference', `no resource '${d}'`);
            }
        }
        else if (p.draws !== undefined) {
            r.error(`${path}.draws`, 'draws-not-separate', "'draws' is only for a part that sets its own access", 'C3.5');
        }
    });
    // ---- dependencies and layers (C4.3a)
    model.dependencies.forEach((d, i) => {
        const path = `$.dependencies[${i}]`;
        notAPart(d.part, `${path}.part`, 'in a dependency');
        notAPart(d.feeds, `${path}.feeds`, 'in a dependency');
        if (d.part === d.feeds)
            r.error(path, 'dependency', 'a part cannot feed itself');
    });
    const layers = deriveLayers(model);
    model.parts.forEach((p, i) => {
        if (p.setsOwnAccess || isGap(p.rank))
            return;
        const derived = layers.layer.get(p.id);
        if (p.rank.layer !== undefined && derived !== undefined && p.rank.layer !== derived) {
            r.error(`$.parts[${i}].rank.layer`, 'rank-layer', `declared layer ${p.rank.layer} but the dependencies put '${p.id}' in layer ${derived} (rank runs from the top down by dependency)`, 'C4.3a');
        }
    });
    for (const id of layers.unreached) {
        r.flag(`$.parts.${id}`, 'rank-unreached', `part '${id}' has no dependency path to the top, so it sits in the bottom layer (decision Q-017); the trace flags it if it keeps its access while higher-ranked parts are cut`, 'C4.3a');
    }
    // ---- governor (C2.2)
    const levelById = new Map(model.levels.map((l) => [l.id, l]));
    const bandLevels = new Set();
    model.governor.bands.forEach((b, i) => {
        const path = `$.governor.bands[${i}]`;
        if (!levelById.has(b.level))
            r.error(`${path}.level`, 'unknown-reference', `no level '${b.level}': bands are on sensed levels`, 'C2.2a');
        if (bandLevels.has(b.level))
            r.error(path, 'band', `two bands on level '${b.level}'`);
        bandLevels.add(b.level);
        checkBand(r, b, path);
    });
    const settingById = new Map(model.settings.map((s) => [s.id, s]));
    const controlled = new Set(model.governor.controls.settings);
    model.governor.controls.settings.forEach((s, i) => {
        if (!settingById.has(s))
            r.error(`$.governor.controls.settings[${i}]`, 'unknown-reference', `no setting '${s}'`);
    });
    const controlledStores = new Set(model.governor.controls.stores);
    model.governor.controls.stores.forEach((s, i) => {
        if (!model.stores.some((x) => x.id === s))
            r.error(`$.governor.controls.stores[${i}]`, 'unknown-reference', `no store '${s}'`);
    });
    const controlledRoutes = new Set(model.governor.controls.routes);
    model.governor.controls.routes.forEach((s, i) => {
        if (!model.routes.some((x) => x.id === s))
            r.error(`$.governor.controls.routes[${i}]`, 'unknown-reference', `no route '${s}'`);
    });
    // ---- levels (C3.1a, C7.1)
    model.levels.forEach((l, i) => {
        const path = `$.levels[${i}]`;
        if (!isGap(l.producedBy)) {
            if (isGovernor(l.producedBy)) {
                r.error(`${path}.producedBy`, 'governor-not-part', 'the governor produces no level: sensing is work, done by parts', 'C2.2c, C3.1b');
            }
            else if (!partById.has(l.producedBy)) {
                r.error(`${path}.producedBy`, 'level-producer', `the producing part '${l.producedBy}' is not a part of the model`, 'C3.1a, C7.1a');
            }
            else if (partById.get(l.producedBy)?.setsOwnAccess) {
                r.flag(`${path}.producedBy`, 'self-set-access', 'produced by a separate case: its readings are refused (Q-014)', 'C3.5');
            }
        }
        if (l.whenProducerShort !== undefined && !isGap(l.whenProducerShort) && l.whenProducerShort.kind === 'stops-when-short' && !isGap(l.producedBy)) {
            const producer = partById.get(l.producedBy);
            const needed = new Set(producer?.requirement.map((q) => q.resource) ?? []);
            const seen = new Set();
            l.whenProducerShort.above.forEach((a, j) => {
                const q = `${path}.whenProducerShort.above[${j}]`;
                if (!needed.has(a.resource))
                    r.error(q, 'sending-dial', `'${a.resource}' is not a resource the producing part '${l.producedBy}' requires`, 'C3.1b', 'PROP-SENSE-01');
                if (seen.has(a.resource))
                    r.error(q, 'sending-dial', `'${a.resource}' is listed twice`, 'C3.1b', 'PROP-SENSE-01');
                if (Q.isNegative(a.amount))
                    r.error(q, 'negative', 'a negative amount');
                seen.add(a.resource);
            });
            for (const res of needed) {
                if (!seen.has(res)) {
                    r.error(`${path}.whenProducerShort`, 'sending-dial', `the dial states no amount for '${res}', which the producing part requires: state one for every resource it requires (decision Q-004)`, 'C3.1b', 'PROP-SENSE-01');
                }
            }
        }
        if (!isGap(l.route) && l.route.kind === 'shared-flow' && !resourceIds.has(l.route.resource)) {
            r.error(`${path}.route.resource`, 'unknown-reference', `no resource '${l.route.resource}'`);
        }
        if (!isGap(l.measures)) {
            checkMeasure(r, model, l.measures, `${path}.measures`);
            const u = measureUnit(model, l.measures);
            if (u !== undefined && u !== l.unit) {
                r.error(`${path}.unit`, 'resource-mismatch', `level unit '${l.unit}' differs from the unit of what it measures ('${u}')`, 'C1, C3.4b');
            }
        }
    });
    // ---- settings (C3.6, C3.7, C3.8n, C3.11a)
    model.settings.forEach((s, i) => {
        const path = `$.settings[${i}]`;
        notAPart(s.part, `${path}.part`, 'given access');
        if (!resourceIds.has(s.resource))
            r.error(`${path}.resource`, 'unknown-reference', `no resource '${s.resource}'`);
        if (s.kind === 'governor-set' && !controlled.has(s.id)) {
            r.error(`${path}.kind`, 'setting-kind', `governor-set setting '${s.id}' is not among the settings the governor controls`, 'C3.6a, C3.8n');
        }
        if (s.kind === 'built-in' && controlled.has(s.id)) {
            r.error(`${path}.kind`, 'setting-kind', `built-in setting '${s.id}' is listed as controlled by the governor: a built-in setting is not set by the governor`, 'C3.7');
        }
        if (!isGap(s.rule))
            checkLevelRule(r, model, s.rule, `${path}.rule`, true);
        const sp = partById.get(s.part);
        if (sp && !sp.setsOwnAccess && !sp.requirement.some((q) => q.resource === s.resource)) {
            r.error(path, 'setting-without-requirement', `setting '${s.id}' gives '${s.part}' access to '${s.resource}', but the part states no requirement for it (write 0 if it requires none)`, 'C3.12a');
        }
        if (partById.get(s.part)?.setsOwnAccess) {
            r.flag(path, 'self-set-access', `setting for '${s.part}', which sets its own access: not used`, 'C3.5');
        }
    });
    // ---- modes (C3.6a, C3.9, C4.4c)
    const modeIds = new Set(model.modes.map((m) => m.id));
    if (!modeIds.has(model.initialMode))
        r.error('$.initialMode', 'unknown-reference', `no mode '${model.initialMode}'`);
    model.modes.forEach((m, i) => checkMode(r, model, m, `$.modes[${i}]`, bandLevels));
    // ---- protected flow (C2.4)
    const pf = model.protectedFlow.resource;
    if (isGap(pf)) {
        r.flag('$.protectedFlow.resource', 'gap', `the protected flow's resource is an information gap (${pf.note})`, 'C2.4');
    }
    else if (!resourceIds.has(pf)) {
        r.error('$.protectedFlow.resource', 'unknown-reference', `no resource '${pf}'`);
    }
    else if (!isGap(top) && partById.has(top) && !partById.get(top)?.requirement.some((q) => q.resource === pf)) {
        r.error('$.protectedFlow', 'protected-flow', `the top '${top}' has no requirement for '${pf}', so the protected flow has nothing to be measured against`, 'C2.4');
    }
    // ---- routes (C2.5, C3.4a)
    const routeTo = new Set();
    model.routes.forEach((rt, i) => {
        const path = `$.routes[${i}]`;
        if (!resourceIds.has(rt.resource))
            r.error(`${path}.resource`, 'unknown-reference', `no resource '${rt.resource}'`);
        if (isGovernor(rt.to))
            r.error(`${path}.to`, 'governor-not-part', 'no route runs to the governor: it draws nothing', 'C2.2c');
        else if (!partById.has(rt.to))
            r.error(`${path}.to`, 'unknown-reference', `routes run to parts; '${rt.to}' is not a part`, 'C2.5');
        const key = `${rt.to}|${rt.resource}`;
        if (routeTo.has(key))
            r.error(path, 'route-limit', `a second route of '${rt.resource}' to '${rt.to}': this phase computes one route per part per resource (engineering limit, not a CANON rule)`);
        routeTo.add(key);
        if (rt.kind === 'governor-set' && !controlledRoutes.has(rt.id))
            r.error(`${path}.kind`, 'setting-kind', `governor-set route capacity '${rt.id}' is not among the routes the governor controls`, 'C3.6a, C3.8n');
        if (rt.kind === 'built-in' && controlledRoutes.has(rt.id))
            r.error(`${path}.kind`, 'setting-kind', `built-in route capacity '${rt.id}' is listed as controlled by the governor`, 'C3.7');
        if (!isGap(rt.capacity))
            checkLevelRule(r, model, rt.capacity, `${path}.capacity`, true);
    });
    // ---- stores (C2.6)
    model.stores.forEach((s, i) => {
        const path = `$.stores[${i}]`;
        if (!resourceIds.has(s.resource))
            r.error(`${path}.resource`, 'unknown-reference', `no resource '${s.resource}'`);
        else if (model.resources.find((x) => x.id === s.resource)?.storable === false) {
            r.error(`${path}.resource`, 'store-not-storable', `store '${s.id}' holds '${s.resource}', which the mapping says cannot be held from one step to the next`, 'C2.6');
        }
        if (!isGap(s.capacity) && Q.isNegative(s.capacity))
            r.error(`${path}.capacity`, 'negative', 'a negative capacity');
        const gov = [s.release, s.fill].some((x) => x.kind === 'governor-set');
        if (gov && !controlledStores.has(s.id))
            r.error(path, 'setting-kind', `store '${s.id}' has a governor-set rule but is not among the stores the governor controls`, 'C3.8n');
        if (!gov && controlledStores.has(s.id))
            r.error(path, 'setting-kind', `store '${s.id}' is listed as controlled by the governor but its rules are built in`, 'C3.7');
        for (const k of ['release', 'fill']) {
            const rule = s[k].rule;
            if (!isGap(rule))
                checkLevelRule(r, model, rule, `${path}.${k}.rule`, true);
        }
    });
    model.outsideInputs.forEach((x, i) => {
        if (!resourceIds.has(x.resource))
            r.error(`$.outsideInputs[${i}].resource`, 'unknown-reference', `no resource '${x.resource}'`);
    });
    // ---- indicators (C3.3)
    const heldSomewhere = new Set(model.modes.flatMap((m) => m.held));
    model.indicators.forEach((ind, i) => {
        const path = `$.indicators[${i}]`;
        if ('level' in ind.watches && !levelById.has(ind.watches.level))
            r.error(`${path}.watches.level`, 'unknown-reference', `no level '${ind.watches.level}'`);
        if ('measure' in ind.watches)
            checkMeasure(r, model, ind.watches.measure, `${path}.watches.measure`);
        if (isGap(ind.kind))
            return;
        if (ind.kind === 'protected-flow' && !('protectedFlow' in ind.watches)) {
            r.error(`${path}.kind`, 'indicator-kind', "an indicator of kind 'protected-flow' watches { protectedFlow: true }", 'C3.3');
        }
        if (ind.kind === 'held-level') {
            if (!('level' in ind.watches))
                r.error(`${path}.kind`, 'indicator-kind', "an indicator of kind 'held-level' watches a level", 'C3.3');
            else if (!heldSomewhere.has(ind.watches.level)) {
                r.error(`${path}.kind`, 'indicator-kind', `level '${ind.watches.level}' is held in no mode, so it is not a level the governor holds`, 'C3.3');
            }
        }
        if (ind.kind === 'neither' && 'protectedFlow' in ind.watches) {
            r.error(`${path}.kind`, 'indicator-kind', "an indicator that watches the protected flow is of kind 'protected-flow'", 'C3.3');
        }
    });
    // ---- threshold switches (C4.4n1)
    model.thresholdSwitches.forEach((t, i) => {
        const path = `$.thresholdSwitches[${i}]`;
        if (!levelById.has(t.level))
            r.error(`${path}.level`, 'unknown-reference', `no level '${t.level}'`);
        if (!modeIds.has(t.toMode))
            r.error(`${path}.toMode`, 'unknown-reference', `no mode '${t.toMode}'`);
        if (t.fromMode !== undefined && !modeIds.has(t.fromMode))
            r.error(`${path}.fromMode`, 'unknown-reference', `no mode '${t.fromMode}'`);
        const from = model.modes.find((m) => m.id === t.fromMode);
        const to = model.modes.find((m) => m.id === t.toMode);
        if (from && to && sameHeld(from, to) && samePositions(model, from, to)) {
            r.flag(path, 'switch-not-mode-change', `threshold switch '${t.id}' changes only settings: CANON 4 says a threshold switch changes the order or which levels are held, so the run labels it an arrangement revision`, 'C4.4n1');
        }
    });
    return r.issues;
}
function sameHeld(a, b) {
    return [...a.held].sort().join('|') === [...b.held].sort().join('|');
}
/** Positions within layers as declared at mapping (PROP-RANK-01): a mode's order, else the part's rank. */
export function positionsOf(model, m) {
    const out = new Map();
    for (const p of model.parts) {
        if (p.setsOwnAccess)
            continue;
        const o = m.order?.find((x) => x.part === p.id);
        out.set(p.id, o ? String(o.position) : isGap(p.rank) ? 'gap' : isGap(p.rank.position) ? 'gap' : String(p.rank.position));
    }
    return out;
}
function samePositions(model, a, b) {
    const pa = positionsOf(model, a);
    const pb = positionsOf(model, b);
    return [...pa.keys()].every((k) => pa.get(k) === pb.get(k));
}
function checkBand(r, b, path) {
    if (!isGap(b.lower) && !isGap(b.upper) && Q.gt(b.lower, b.upper)) {
        r.error(path, 'band', 'the lower limit is above the upper limit', 'C2.2a');
    }
    if (b.held !== undefined && !isGap(b.held)) {
        if ((!isGap(b.lower) && Q.lt(b.held, b.lower)) || (!isGap(b.upper) && Q.gt(b.held, b.upper))) {
            r.error(`${path}.held`, 'band', 'a held value lies inside its band', 'C2.2n1');
        }
    }
}
function checkMode(r, model, m, path, bandLevels) {
    const settingById = new Map(model.settings.map((s) => [s.id, s]));
    m.held.forEach((l, j) => {
        if (!model.levels.some((x) => x.id === l))
            r.error(`${path}.held[${j}]`, 'unknown-reference', `no level '${l}'`);
        else if (!bandLevels.has(l))
            r.error(`${path}.held[${j}]`, 'band-missing', `mode holds level '${l}' but the governor has no band on it`, 'C2.2a');
    });
    const inForce = new Map();
    m.settings.forEach((sid, j) => {
        const s = settingById.get(sid);
        if (!s) {
            r.error(`${path}.settings[${j}]`, 'unknown-reference', `no setting '${sid}'`);
            return;
        }
        const key = `${s.part}|${s.resource}`;
        const prev = inForce.get(key);
        if (prev !== undefined) {
            r.error(`${path}.settings[${j}]`, 'mode-settings', `settings '${prev}' and '${sid}' both give '${s.part}' access to '${s.resource}': access is set as a whole, one setting per part per resource`, 'C3.11a');
        }
        inForce.set(key, sid);
    });
    for (const p of model.parts) {
        if (p.setsOwnAccess)
            continue;
        for (const q of p.requirement) {
            if (!inForce.has(`${p.id}|${q.resource}`)) {
                r.error(path, 'missing-setting', `no setting in force gives '${p.id}' access to '${q.resource}', which it requires`, 'C3.6b');
            }
        }
    }
    m.order?.forEach((o, j) => {
        if (!model.parts.some((p) => p.id === o.part))
            r.error(`${path}.order[${j}]`, 'unknown-reference', `no part '${o.part}'`);
    });
}
/**
 * `suppliedLoads` (internal; never passed by run()): loads, keyed 'part|load',
 * that a coupling supplies (P-COUPLE-01). Each must have no series in the
 * scenario, so that it has one source; every other declared load still needs
 * exactly one series.
 */
export function validateScenarioAgainst(model, s, suppliedLoads = new Set()) {
    const r = new Reader();
    if (s.schemaVersion !== SCHEMA_VERSION)
        r.error('$.schemaVersion', 'schema-version', `this engine reads schema ${SCHEMA_VERSION}, not '${s.schemaVersion}'`);
    if (s.model !== model.id)
        r.error('$.model', 'scenario-model', `scenario is for model '${s.model}', not '${model.id}'`);
    const checkEntries = (entries, path, nonNegative) => {
        if (entries.length === 0 || entries[0]?.step !== 0)
            r.error(path, 'series-start', 'every series starts at step 0');
        for (let i = 1; i < entries.length; i++) {
            if (entries[i].step <= entries[i - 1].step)
                r.error(`${path}[${i}]`, 'series-order', 'series steps must strictly increase');
        }
        entries.forEach((e, i) => {
            if (e.step >= s.steps)
                r.flag(`${path}[${i}]`, 'series-after-end', `entry at step ${e.step} is after the last step`);
            if (nonNegative && !isGap(e.value) && Q.isNegative(e.value))
                r.error(`${path}[${i}].value`, 'negative', 'a negative amount');
        });
    };
    for (const res of model.resources) {
        const series = s.inflow.filter((x) => x.resource === res.id);
        if (series.length !== 1)
            r.error('$.inflow', 'inflow-missing', `exactly one inflow series is needed for '${res.id}' (write 0 where nothing enters)`, 'C1.1');
    }
    s.inflow.forEach((x, i) => {
        if (!model.resources.some((q) => q.id === x.resource))
            r.error(`$.inflow[${i}].resource`, 'unknown-reference', `no resource '${x.resource}'`);
        checkEntries(x.entries, `$.inflow[${i}].entries`, true);
    });
    for (const oi of model.outsideInputs) {
        if (s.outsideInput.filter((x) => x.input === oi.id).length !== 1)
            r.error('$.outsideInput', 'outside-input-missing', `exactly one series is needed for outside input '${oi.id}'`, 'C2.7');
    }
    s.outsideInput.forEach((x, i) => {
        if (!model.outsideInputs.some((q) => q.id === x.input))
            r.error(`$.outsideInput[${i}].input`, 'unknown-reference', `no outside input '${x.input}'`);
        checkEntries(x.entries, `$.outsideInput[${i}].entries`, true);
    });
    for (const key of [...suppliedLoads].sort()) {
        const [part, load] = key.split('|');
        if (!model.parts.some((p) => p.id === part && p.loads.some((l) => l.id === load))) {
            r.error('$.loads', 'unknown-reference', `part '${part}' declares no load '${load}' to supply`);
        }
        else if (s.loads.some((x) => x.part === part && x.load === load)) {
            r.error('$.loads', 'load-supplied', `load '${load}' on '${part}' is supplied by the coupling, so the scenario must not also give it a series`, undefined, 'P-COUPLE-01');
        }
    }
    for (const p of model.parts) {
        for (const l of p.loads) {
            if (suppliedLoads.has(`${p.id}|${l.id}`))
                continue;
            if (s.loads.filter((x) => x.part === p.id && x.load === l.id).length !== 1) {
                r.error('$.loads', 'load-missing', `exactly one series is needed for load '${l.id}' on '${p.id}'`, 'C3.12a');
            }
        }
    }
    s.loads.forEach((x, i) => {
        const part = model.parts.find((p) => p.id === x.part);
        if (!part || !part.loads.some((l) => l.id === x.load))
            r.error(`$.loads[${i}]`, 'unknown-reference', `part '${x.part}' declares no load '${x.load}'`);
        // Loads are non-negative (decision 2026-10-20, schema 0.4.0).
        checkEntries(x.entries, `$.loads[${i}].entries`, true);
    });
    for (const st of model.stores) {
        const init = s.initial.stores.filter((x) => x.store === st.id);
        if (init.length !== 1)
            r.error('$.initial.stores', 'initial-store', `exactly one initial content is needed for store '${st.id}'`, 'C2.6');
        const c = init[0]?.content;
        if (c !== undefined && !isGap(c) && Q.isNegative(c))
            r.error('$.initial.stores', 'negative', `store '${st.id}' starts below zero`);
        if (c !== undefined && !isGap(c) && !isGap(st.capacity) && Q.gt(c, st.capacity))
            r.error('$.initial.stores', 'store-capacity', `store '${st.id}' starts above its capacity`);
    }
    s.initial.stores.forEach((x, i) => {
        if (!model.stores.some((q) => q.id === x.store))
            r.error(`$.initial.stores[${i}].store`, 'unknown-reference', `no store '${x.store}'`);
    });
    s.initial.readings.forEach((x, i) => {
        const l = model.levels.find((q) => q.id === x.level);
        if (!l)
            r.error(`$.initial.readings[${i}].level`, 'unknown-reference', `no level '${x.level}'`);
        else if (isGap(l.measures) || !['received', 'entering', 'inflow'].includes(l.measures.of)) {
            r.error(`$.initial.readings[${i}]`, 'initial-reading', `level '${x.level}' does not measure the step before, so it needs no initial reading`);
        }
    });
    for (const l of model.levels) {
        if (!isGap(l.measures) && ['received', 'entering', 'inflow'].includes(l.measures.of) && !s.initial.readings.some((x) => x.level === l.id)) {
            r.flag('$.initial.readings', 'initial-reading-missing', `level '${l.id}' measures the step before; with no initial reading it is refused at step 0`);
        }
    }
    const modeIds = new Set(model.modes.map((m) => m.id));
    s.enable.forEach((id, i) => {
        if (id.startsWith('P-IPF-'))
            r.error(`$.enable[${i}]`, 'proposal-disabled', `${id} is disabled and cannot be enabled`, undefined, id);
        else if (id !== 'P-LOAD-01')
            r.error(`$.enable[${i}]`, 'unknown-proposal', `only P-LOAD-01 can be enabled by a scenario, not '${id}'`);
    });
    if (s.enable.includes('P-LOAD-01') && !model.parts.some((p) => p.loadDials?.unitLossUnderShortfall !== undefined || p.loadDials?.unitRebuilding !== undefined)) {
        r.flag('$.enable', 'load-dials-missing', 'P-LOAD-01 is enabled but no part sets its dials, so it changes nothing', undefined, 'P-LOAD-01');
    }
    s.events.forEach((e, i) => {
        const path = `$.events[${i}]`;
        if (e.step >= s.steps)
            r.error(`${path}.step`, 'event-after-end', `event at step ${e.step} is after the last step`);
        if (e.kind === 'damage' && !model.parts.some((p) => p.id === e.part))
            r.error(`${path}.part`, 'unknown-reference', `no part '${e.part}'`);
        if (e.kind === 'signal' && !model.levels.some((l) => l.id === e.level))
            r.error(`${path}.level`, 'unknown-reference', `no level '${e.level}'`);
        if (e.kind === 'intervention') {
            if (e.setMode !== undefined && !modeIds.has(e.setMode))
                r.error(`${path}.setMode`, 'unknown-reference', `no mode '${e.setMode}'`);
            e.replaceSettings?.forEach((sid, j) => {
                if (!model.settings.some((x) => x.id === sid))
                    r.error(`${path}.replaceSettings[${j}]`, 'unknown-reference', `no setting '${sid}'`);
            });
            const bandLevels = new Set(model.governor.bands.map((b) => b.level));
            e.setHeld?.forEach((l, j) => {
                if (!model.levels.some((x) => x.id === l))
                    r.error(`${path}.setHeld[${j}]`, 'unknown-reference', `no level '${l}'`);
                else if (!bandLevels.has(l))
                    r.error(`${path}.setHeld[${j}]`, 'band-missing', `the governor has no band on '${l}'`, 'C2.2a');
            });
            if (e.setBand !== undefined) {
                if (!model.levels.some((x) => x.id === e.setBand?.level))
                    r.error(`${path}.setBand.level`, 'unknown-reference', `no level '${e.setBand.level}'`);
                checkBand(r, e.setBand, `${path}.setBand`);
            }
        }
    });
    return r.issues;
}
/** Parse and validate a model document. `ok` is false if any issue is an error. */
export function validateModel(doc) {
    const parsed = parseModel(doc);
    if (!parsed.model)
        return { ok: false, issues: parsed.issues };
    const issues = [...parsed.issues, ...validateModelStructure(parsed.model)];
    const ok = !issues.some((i) => i.severity === 'error');
    return { ok, issues, model: ok ? parsed.model : undefined };
}
function scenarioValidation(doc, model, suppliedLoads) {
    const parsed = parseScenario(doc);
    if (!parsed.scenario)
        return { ok: false, issues: parsed.issues };
    const issues = [...parsed.issues, ...validateScenarioAgainst(model, parsed.scenario, suppliedLoads)];
    const ok = !issues.some((i) => i.severity === 'error');
    return { ok, issues, scenario: ok ? parsed.scenario : undefined };
}
/** Parse and validate a scenario document against a valid model. */
export function validateScenario(doc, model) {
    return scenarioValidation(doc, model, new Set());
}
/**
 * Validate a scenario for a coupled run (internal: not on the package entry
 * point; P-COUPLE-01, CF-D09). The loads a coupling supplies, keyed
 * 'part|load', must have no series; every other declared load needs exactly
 * one. A scenario that lacks a supplied load's series stays invalid for
 * validateScenario and run().
 */
export function validateCoupledScenario(doc, model, suppliedLoads) {
    return scenarioValidation(doc, model, suppliedLoads);
}
