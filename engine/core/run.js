// The step loop. Each step (PROP-STEP-01):
//   1. scenario events for the step: damage, interventions, signal conditions;
//   2. sensing: each level's true value as at the start of the step, what its
//      producing part sends, and whether it is delivered to a held band with a
//      rule or switch to act on it (C7.1);
//   3. threshold switches on delivered levels (C4.4n1), except in a step where
//      an intervention changed the arrangement;
//   4. settings give access from delivered levels (C3.6b); route capacities,
//      store release and fill limits likewise. Silence never gives a value;
//   5. requirement and upkeep from each part's rules and loads (C3.12a);
//   6. the recorded order (C4.3; PROP-RANK-01);
//   7. per resource, the draw from the one shared flow (C3.4b), by the given
//      allocation policy, checked against CANON's limits;
//   8. accounting: shortfall as a count at each part (C3.4c), upkeep covered
//      first (C3.11b), stores, the reconciliation, CANON 1's ledger, flags.
//      The true state is recorded whether or not any level senses it (C7.2).
// No look-ahead: the governor's rules read only `readLevel` (delivered levels,
// sensed from the state at the start of the step) and the values they gave in
// the step before. Nothing computed from this step's true state reaches them.
// A calculation that cannot be made is refused inside the result, with typed
// refusals, and everything computed from it is refused too.
import { canonicalJson } from "./canonical-json.js";
import { checkDraw, drawUnknownTop, UNKNOWN_TOP_VERSION } from "./draw.js";
import { AccountingError, ConfigurationError, ModelInvalidError } from "./errors.js";
import { quantity } from "./quantity.js";
import * as Q from "./rational.js";
import { deriveLayers } from "./rank.js";
import { attempt, mergeRefusals, need, ok, refuse, refused, unknownPrerequisite, unknownV } from "./refusal.js";
import { evalLevelRule, evalPartRule, levelRead, loadsRead } from "./rules.js";
import { isGap } from "./schema/types.js";
import { validateModel, validateScenario } from "./schema/validate.js";
import { seriesAt } from "./series.js";
import { sha256OfString } from "./sha256.js";
import * as U from "./unspecified.js";
import { engineMeta } from "./version.js";
/** Proposals built into the core loop, in force for every run (docs/proposals.md). */
export const CORE_PROPOSALS = ['PROP-FLOW-01', 'PROP-RANK-01', 'PROP-ROUTE-01', 'PROP-STEP-01'];
/** Proposals that may not be enabled in this engine (docs/proposals.md). */
export const DISABLED_PROPOSALS = ['P-IPF-01', 'P-IPF-02', 'P-IPF-03', 'P-IPF-04', 'P-IPF-05', 'P-IPF-06'];
/** Proposals a scenario may enable (off by default): P-LOAD-01, approved 2026-10-20. */
export const SCENARIO_PROPOSALS = ['P-LOAD-01'];
const PREV_STEP = new Set(['received', 'entering', 'inflow']);
function byId(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function k2(a, b) {
    return `${a}|${b}`;
}
function sameSet(a, b) {
    return a.size === b.size && [...a].every((x) => b.has(x));
}
/** C3.9 with the Unified Core Spec's arrangement revision (Q-028). */
function classify(prev, next) {
    if (prev === next)
        return null;
    if (next === null)
        return prev === null ? null : 'unmapped';
    if (prev === null)
        return 'unclassified';
    const positionsSame = [...prev.positions.keys()].every((k) => {
        const a = prev.positions.get(k);
        const b = next.positions.get(k);
        return (isGap(a) && isGap(b)) || a === b;
    });
    if (!sameSet(prev.held, next.held) || !positionsSame)
        return 'mode-change';
    const settingsSame = prev.settings.size === next.settings.size &&
        [...prev.settings.entries()].every(([k, s]) => next.settings.get(k)?.id === s.id);
    return settingsSame ? null : 'arrangement-revision';
}
/** Collects every refusal with the steps it applies to. */
class Refusals {
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
/**
 * Parse, validate and run. Throws only when the run cannot be initialised:
 * ModelInvalidError for an invalid model or scenario, ConfigurationError for a
 * disabled proposal. Every calculation it cannot make is refused in the result.
 */
export function run(modelDoc, scenarioDoc, options = {}) {
    const mv = validateModel(modelDoc);
    if (!mv.ok || !mv.model)
        throw new ModelInvalidError('model', mv.issues);
    const sv = validateScenario(scenarioDoc, mv.model);
    if (!sv.ok || !sv.scenario)
        throw new ModelInvalidError('scenario', sv.issues);
    checkDrawPolicy(options);
    return runValidated(mv.model, sv.scenario, options, {
        model: sha256OfString(canonicalJson(modelDoc)),
        scenario: sha256OfString(canonicalJson(scenarioDoc)),
    });
}
/** Throws ConfigurationError for an allocation policy that may not be one: a disabled proposal, or one a scenario enables. */
export function checkDrawPolicy(options) {
    const pid = options.drawPolicy?.proposalId;
    if (pid !== undefined && DISABLED_PROPOSALS.includes(pid)) {
        throw new ConfigurationError(`${pid} is disabled in this engine and cannot be used as the allocation policy`);
    }
    if (pid !== undefined && SCENARIO_PROPOSALS.includes(pid)) {
        throw new ConfigurationError(`${pid} is not an allocation policy: a scenario enables it with "enable": ["${pid}"]`);
    }
}
export function startRun(model, scenario, options, hashes) {
    const policy = options.drawPolicy ?? null;
    const notes = new Refusals();
    const layers = deriveLayers(model);
    const partById = new Map(model.parts.map((p) => [p.id, p]));
    const modeById = new Map(model.modes.map((m) => [m.id, m]));
    const resourceById = new Map(model.resources.map((r) => [r.id, r]));
    const resources = model.resources.map((r) => r.id).sort(byId);
    const ranked = model.parts.filter((p) => !p.setsOwnAccess).map((p) => p.id).sort(byId);
    const separate = model.parts.filter((p) => p.setsOwnAccess).sort((a, b) => byId(a.id, b.id));
    const stores = model.stores.slice().sort((a, b) => byId(a.id, b.id));
    const routes = model.routes.slice().sort((a, b) => byId(a.id, b.id));
    const switches = model.thresholdSwitches.slice().sort((a, b) => byId(a.id, b.id));
    const levels = model.levels.slice().sort((a, b) => byId(a.id, b.id));
    const top = model.boundary.top;
    const topId = isGap(top) ? null : top;
    const pfRes = model.protectedFlow.resource;
    const pfResId = isGap(pfRes) ? null : pfRes;
    const tv = (tag, v, step) => v.ok ? { t: tag, v: Q.toCanonical(v.v) } : { t: tag, refused: notes.note(v.refusals, step) };
    const sumV = (vs) => attempt(() => Q.sum(vs.map((x) => need(x))));
    const modeFrom = (m) => {
        const settings = new Map();
        for (const sid of m.settings) {
            const s = model.settings.find((x) => x.id === sid);
            settings.set(k2(s.part, s.resource), s);
        }
        const positions = new Map();
        for (const id of ranked) {
            const p = partById.get(id);
            const override = m.order?.find((o) => o.part === id);
            positions.set(id, override ? override.position : isGap(p.rank) ? p.rank : p.rank.position);
        }
        return { id: m.id, base: m.id, held: new Set(m.held), settings, positions };
    };
    /** The rules and switches in force that read each level (its expected recipients). */
    const readersOf = (a) => {
        const out = new Map();
        const add = (level, who) => {
            if (level === null)
                return;
            const list = out.get(level) ?? [];
            list.push(who);
            out.set(level, list);
        };
        if (a === null)
            return out;
        for (const s of a.settings.values())
            if (!isGap(s.rule))
                add(levelRead(s.rule), `setting:${s.id}`);
        for (const s of stores) {
            if (!isGap(s.release.rule))
                add(levelRead(s.release.rule), `store-release:${s.id}`);
            if (!isGap(s.fill.rule))
                add(levelRead(s.fill.rule), `store-fill:${s.id}`);
        }
        for (const r of routes)
            if (!isGap(r.capacity))
                add(levelRead(r.capacity), `route:${r.id}`);
        for (const sw of switches)
            if (sw.fromMode === undefined || sw.fromMode === a.base)
                add(sw.level, `switch:${sw.id}`);
        for (const list of out.values())
            list.sort(byId);
        return out;
    };
    // ---------------------------------------------------------------- state carried between steps
    let arrangement = modeFrom(modeById.get(model.initialMode));
    let unknownArrangement = [];
    const bands = new Map(model.governor.bands.map((b) => [b.level, b]));
    let storeContent = new Map();
    for (const s of stores) {
        const c = scenario.initial.stores.find((x) => x.store === s.id)?.content;
        storeContent.set(s.id, c === undefined ? unknownV(`$.initial.stores.${s.id}`, 'no initial content')
            : isGap(c) ? unknownV(`$.initial.stores.${s.id}`, c.note) : ok(c));
    }
    let units = new Map();
    for (const id of ranked) {
        const u = partById.get(id).units;
        units.set(id, isGap(u) ? unknownV(`$.parts.${id}.units`, u.note) : ok(u));
    }
    let prevReceived = new Map();
    let prevEntering = new Map();
    let prevInflow = new Map();
    let prevShort = new Map();
    let prevShortfall = new Map();
    // P-LOAD-01: units lost under its rule and not yet rebuilt.
    const pLoad = scenario.enable.includes('P-LOAD-01');
    let lostOutstanding = new Map(ranked.map((id) => [id, ok(Q.ZERO)]));
    /** The part's P-LOAD-01 dials, null where P-LOAD-01 does not apply to it, or refused where they are incomplete. */
    const loadDialsOf = (id) => {
        const d = partById.get(id).loadDials;
        if (!pLoad || d === undefined || (d.unitLossUnderShortfall === undefined && d.unitRebuilding === undefined))
            return null;
        const path = `$.parts.${id}.loadDials`;
        if (d.unitLossUnderShortfall === undefined || d.unitRebuilding === undefined) {
            return unknownV(path, 'P-LOAD-01 needs both the unit-loss and the rebuild dial');
        }
        if (isGap(d.unitLossUnderShortfall))
            return unknownV(`${path}.unitLossUnderShortfall`, d.unitLossUnderShortfall.note);
        if (isGap(d.unitRebuilding))
            return unknownV(`${path}.unitRebuilding`, d.unitRebuilding.note);
        return ok({ loss: d.unitLossUnderShortfall, rebuild: d.unitRebuilding });
    };
    let prevAccess = new Map();
    let prevDelivered = null;
    /** What each governor-facing rule gave in the step before, keyed by what it sets (the earlier value silence leaves standing). */
    let prevRuleValue = new Map();
    let prevRequirement = new Map();
    let prevLoads = new Map();
    const damaged = new Map();
    let orderRefusals = [];
    const snapshots = [];
    const steps = [];
    const modesUsed = new Set();
    let snapStart = 0;
    let snapInfo = { mode: arrangement.id, startedBy: 'initial', change: 'initial' };
    const closeSnapshot = (toStep) => {
        snapshots.push({ index: snapshots.length, fromStep: snapStart, toStep, ...snapInfo });
    };
    const loadSeries = (part, load) => scenario.loads.find((x) => x.part === part && x.load === load)?.entries ?? [];
    let nextStep = 0;
    const stepAt = (t, inputs) => {
        if (t !== nextStep || t >= scenario.steps)
            throw new Error(`run: step ${t} taken out of order (expected ${nextStep} of ${scenario.steps}; a defect)`);
        nextStep += 1;
        const flags = [];
        const events = scenario.events.filter((e) => e.step === t);
        const given = inputs?.loads;
        const loadAt = (part, load) => given?.get(k2(part, load)) ?? seriesAt(loadSeries(part, load), t, `$.loads.${part}.${load}`);
        const atStepStart = arrangement;
        // ---------------------------------------------------------------- 1. events
        for (const e of events) {
            if (e.kind === 'damage' && !damaged.has(e.part))
                damaged.set(e.part, U.damageDynamics(e.part));
        }
        let intervened = false;
        for (const e of events) {
            if (e.kind !== 'intervention')
                continue;
            intervened = true;
            const before = arrangement;
            if (e.setMode !== undefined) {
                arrangement = modeFrom(modeById.get(e.setMode));
                unknownArrangement = [];
            }
            if (e.replaceSettings !== undefined || e.setHeld !== undefined) {
                const current = arrangement;
                if (current === null) {
                    unknownArrangement = mergeRefusals(unknownArrangement, [U.changeOnUnknownArrangement()]);
                }
                else {
                    const settings = new Map(current.settings);
                    for (const sid of e.replaceSettings ?? []) {
                        const s = model.settings.find((x) => x.id === sid);
                        settings.set(k2(s.part, s.resource), s);
                    }
                    const next = {
                        ...current, id: `${current.base}~step${t}`, settings,
                        held: e.setHeld !== undefined ? new Set(e.setHeld) : current.held,
                    };
                    arrangement = next;
                }
            }
            if (e.setBand !== undefined) {
                bands.set(e.setBand.level, e.setBand);
                flags.push({ code: 'band-moved', subject: e.setBand.level, detail: 'a band was moved by intervention; under CANON 3 this is not a mode change (Q-018)', canon: 'C3.9' });
            }
            else if (classify(before, arrangement) === null) {
                flags.push({ code: 'intervention-no-change', subject: arrangement?.id ?? '(unknown)', detail: 'the intervention left the arrangement unchanged' });
            }
        }
        const notSent = new Set(events.filter((e) => e.kind === 'signal' && e.condition === 'not-sent').map((e) => e.level));
        const filtered = new Set(events.filter((e) => e.kind === 'signal' && e.condition === 'filtered-on-route').map((e) => e.level));
        // ---------------------------------------------------------------- 2. sensing (C7.1)
        const measureValue = (m, levelId) => {
            if (PREV_STEP.has(m.of) && t === 0) {
                const init = levelId === null ? undefined : scenario.initial.readings.find((x) => x.level === levelId);
                return init ? ok(init.value) : unknownV('$.initial.readings', `'${levelId ?? m.of}' measures the step before, and step 0 has none`);
            }
            switch (m.of) {
                case 'store-content': return storeContent.get(m.store);
                case 'load': return loadAt(m.part, m.load);
                case 'received': return prevReceived.get(k2(m.part, m.resource))
                    ?? unknownV(`measure received ${m.part} ${m.resource}`, `'${m.part}' has no requirement or setting for '${m.resource}', so nothing it receives is computed`);
                case 'entering': return prevEntering.get(m.resource);
                case 'inflow': return prevInflow.get(m.resource);
            }
        };
        const measureTag = (m) => (m.of === 'load'
            ? (given?.has(k2(m.part, m.load)) ? 'computed' : 'input')
            : t === 0 && (m.of === 'store-content' || PREV_STEP.has(m.of)) ? 'input' : 'computed');
        const sense = (l, a, readers) => {
            const definite = isGap(l.measures) ? unknownV(`$.levels.${l.id}.measures`, l.measures.note) : measureValue(l.measures, l.id);
            const definiteTag = isGap(l.measures) ? 'computed' : measureTag(l.measures);
            let neverSentBecause = null;
            const sentOrNull = attempt(() => {
                if (isGap(l.producedBy))
                    refuse(unknownPrerequisite(`$.levels.${l.id}.producedBy`, l.producedBy.note));
                const producer = partById.get(l.producedBy);
                if (producer.setsOwnAccess)
                    refuse(U.separateCase(producer.id, `the sensing of level '${l.id}'`));
                const u = units.get(producer.id);
                // Units unknown only because of an earlier shortfall (Q-016): the sending dial covers that case too.
                const unitsAfterShortfall = !u.ok && u.refusals.every((x) => x.question === 'Q-016');
                const wasShort = t > 0 ? need(prevShort.get(producer.id)) : false;
                if (wasShort || unitsAfterShortfall) {
                    // PROP-SENSE-01 (decision Q-004): the mapping's dial says what a short producing part sends.
                    const dial = l.whenProducerShort;
                    if (dial === undefined) {
                        refuse(U.noSendingDial(l.id, producer.id, wasShort ? `its producing part '${producer.id}' was short in the step before`
                            : `the units of its producing part '${producer.id}' are unknown after an earlier shortfall`));
                    }
                    if (isGap(dial))
                        refuse(unknownPrerequisite(`$.levels.${l.id}.whenProducerShort`, dial.note));
                    if (dial.kind === 'stops-when-short' && wasShort) {
                        for (const a of dial.above) {
                            if (Q.gt(need(prevShortfall.get(k2(producer.id, a.resource))), a.amount)) {
                                neverSentBecause = 'dial';
                                return null;
                            }
                        }
                    }
                    if (u.ok && Q.isZero(u.v)) {
                        neverSentBecause = 'no-units';
                        return null;
                    }
                }
                else if (Q.isZero(need(u))) {
                    neverSentBecause = 'no-units';
                    return null;
                }
                if (notSent.has(l.id)) {
                    neverSentBecause = 'scenario';
                    return null;
                }
                return need(definite);
            });
            const held = a !== null && a.held.has(l.id);
            const recipients = readers.get(l.id) ?? [];
            const silent = isGap(l.missingSignal)
                ? unknownV(`$.levels.${l.id}.missingSignal`, l.missingSignal.note)
                : ok({ kind: 'silent', readAs: l.missingSignal });
            const base = { definite, definiteTag, recipients, held };
            if (!sentOrNull.ok) {
                const no = refused(sentOrNull.refusals);
                return { ...base, signal: 'refused', notActionable: null, basis: null, basisDetail: null, sent: no, delivered: no, inBand: null, reading: refused(sentOrNull.refusals) };
            }
            if (sentOrNull.v === null) {
                const fromScenario = neverSentBecause === 'scenario';
                return {
                    ...base, signal: 'never-sent', notActionable: null,
                    basis: fromScenario ? 'scenario-event' : 'mapping',
                    basisDetail: fromScenario ? 'signal event: not sent'
                        : neverSentBecause === 'dial' ? `the producing part's shortfall in the step before exceeded the amount its sending dial states (PROP-SENSE-01)`
                            : 'the producing part has no units',
                    sent: null, delivered: null, inBand: null, reading: silent,
                };
            }
            const value = sentOrNull.v;
            const sent = ok(value);
            if (isGap(l.route)) {
                const no = unknownV(`$.levels.${l.id}.route`, l.route.note);
                return { ...base, signal: 'refused', notActionable: null, basis: null, basisDetail: null, sent, delivered: no, inBand: null, reading: refused(no.ok ? [] : no.refusals) };
            }
            if (filtered.has(l.id)) {
                return { ...base, signal: 'sent-not-actionable', notActionable: 'route-or-filtering', basis: 'scenario-event', basisDetail: 'signal event: filtered on its route', sent, delivered: null, inBand: null, reading: silent };
            }
            if (a === null) {
                const no = refused(unknownArrangement);
                return { ...base, signal: 'refused', notActionable: null, basis: null, basisDetail: null, sent, delivered: no, inBand: null, reading: refused(unknownArrangement) };
            }
            if (!held) {
                return { ...base, signal: 'sent-not-actionable', notActionable: 'no-held-band-or-action', basis: 'mapping', basisDetail: 'no band is held on this level in this mode', sent, delivered: null, inBand: null, reading: silent };
            }
            const b = bands.get(l.id);
            const inBand = b && !isGap(b.lower) && !isGap(b.upper) ? Q.ge(value, b.lower) && Q.le(value, b.upper) : null;
            if (recipients.length === 0) {
                return { ...base, signal: 'sent-not-actionable', notActionable: 'no-held-band-or-action', basis: 'mapping', basisDetail: 'a band is held but no rule or switch in force reads it', sent, delivered: sent, inBand, reading: ok({ kind: 'value', value }) };
            }
            return { ...base, signal: 'produced-and-delivered', notActionable: null, basis: null, basisDetail: null, sent, delivered: sent, inBand, reading: ok({ kind: 'value', value }) };
        };
        const senseAll = () => {
            const readers = readersOf(arrangement);
            return new Map(levels.map((l) => [l.id, sense(l, arrangement, readers)]));
        };
        let sensed = senseAll();
        // ---------------------------------------------------------------- 3. threshold switches (C4.4n1)
        // An intervention that changes the arrangement fixes it for its own step; switches resume
        // from the next step (PROP-STEP-01), so an intervention and a switch never contend in one step.
        let switched = null;
        const current = arrangement;
        const setByIntervention = intervened && classify(atStepStart, arrangement) !== null;
        if (current !== null && prevDelivered !== null && !setByIntervention) {
            const fired = [];
            const problems = [];
            for (const sw of switches) {
                if (sw.fromMode !== undefined && sw.fromMode !== current.base)
                    continue;
                const level = model.levels.find((l) => l.id === sw.level);
                const prev = prevDelivered.get(sw.level);
                const cur = sensed.get(sw.level).delivered;
                const crossed = attempt(() => {
                    if (prev === null || prev === undefined || cur === null) {
                        // A missing signal never gives a value. Read as no intervention, the governor does not act.
                        if (isGap(level.missingSignal))
                            refuse(unknownPrerequisite(`$.levels.${level.id}.missingSignal`, level.missingSignal.note));
                        if (level.missingSignal === 'no-intervention')
                            return false;
                        refuse(U.thresholdSwitchOnAlarmSilence(sw.id, sw.level));
                    }
                    const p = need(prev);
                    const c = need(cur);
                    return sw.direction === 'rising'
                        ? Q.lt(p, sw.threshold) && Q.ge(c, sw.threshold)
                        : Q.gt(p, sw.threshold) && Q.le(c, sw.threshold);
                });
                if (!crossed.ok)
                    problems.push([...crossed.refusals]);
                else if (crossed.v)
                    fired.push(sw);
            }
            if (problems.length > 0) {
                arrangement = null;
                unknownArrangement = mergeRefusals(...problems);
                switched = '';
            }
            else if (fired.length > 0) {
                const destinations = [...new Set(fired.map((f) => f.toMode))];
                if (destinations.length > 1) {
                    arrangement = null;
                    unknownArrangement = [U.conflictingSwitches(fired.map((f) => f.id))];
                    switched = '';
                }
                else if (destinations[0] !== current.base) {
                    arrangement = modeFrom(modeById.get(destinations[0]));
                    switched = fired.map((f) => f.id).join(',');
                }
            }
            if (switched !== null)
                sensed = senseAll();
        }
        // ---------------------------------------------------------------- snapshots (C3.9; Q-028)
        if (t === 0) {
            snapInfo = { mode: arrangement?.id ?? null, startedBy: 'initial', change: 'initial' };
        }
        else if (intervened || switched !== null) {
            const change = classify(atStepStart, arrangement);
            if (change !== null) {
                closeSnapshot(t - 1);
                snapStart = t;
                snapInfo = {
                    mode: arrangement?.id ?? null, startedBy: switched !== null ? 'threshold-switch' : 'intervention', change,
                    switch: switched ? switched : undefined,
                };
                orderRefusals = [];
            }
        }
        const mode = arrangement;
        const modeRefusals = unknownArrangement;
        if (mode)
            modesUsed.add(mode.id);
        // ---------------------------------------------------------------- 4. settings, routes, stores (C3.6b)
        const readLevel = (levelId) => need(sensed.get(levelId).reading);
        const ruleValue = new Map();
        const governed = (key, rule, kind, ruleId, path) => {
            const v = attempt(() => {
                if (isGap(rule))
                    refuse(unknownPrerequisite(path, rule.note));
                const earlier = () => prevRuleValue.get(key)
                    ?? unknownV(path, 'the level it reads is silent and read as no intervention, so the governor does not act, and there is no earlier value (Q-029)');
                return evalLevelRule(rule, kind, ruleId, path, readLevel, earlier);
            });
            ruleValue.set(key, v);
            return v;
        };
        const pairs = [];
        for (const id of ranked) {
            for (const q of partById.get(id).requirement)
                pairs.push({ part: id, resource: q.resource });
        }
        pairs.sort((a, b) => byId(a.part, b.part) || byId(a.resource, b.resource));
        const settingOf = (part, res) => mode?.settings.get(k2(part, res));
        const access = new Map();
        for (const pr of pairs) {
            const s = settingOf(pr.part, pr.resource);
            const key = `access|${k2(pr.part, pr.resource)}`;
            if (!mode)
                access.set(k2(pr.part, pr.resource), refused(modeRefusals));
            else if (!s)
                access.set(k2(pr.part, pr.resource), unknownV(`mode ${mode.id}`, `no setting in force for '${pr.part}' and '${pr.resource}'`));
            else
                access.set(k2(pr.part, pr.resource), governed(key, s.rule, s.kind, s.id, `$.settings.${s.id}.rule`));
        }
        const resourceRefusals = new Map();
        const refuseResource = (res, refusals) => {
            resourceRefusals.set(res, mergeRefusals(resourceRefusals.get(res) ?? [], refusals));
        };
        const routeCap = new Map();
        for (const rt of routes) {
            routeCap.set(k2(rt.to, rt.resource), governed(`route|${rt.id}`, rt.capacity, rt.kind, rt.id, `$.routes.${rt.id}.capacity`));
        }
        for (const p of separate) {
            const draws = p.draws === undefined || isGap(p.draws) ? resources : p.draws;
            for (const res of draws)
                refuseResource(res, [U.separateCase(p.id, `its access to '${res}'`)]);
        }
        const release = new Map();
        const fillRoom = new Map();
        for (const s of stores) {
            const content = storeContent.get(s.id);
            const asked = governed(`release|${s.id}`, s.release.rule, s.release.kind, `${s.id}.release`, `$.stores.${s.id}.release.rule`);
            // A store cannot release more than it holds: physical, not the governor reading the true state.
            const rel = attempt(() => Q.min(need(asked), need(content)));
            release.set(s.id, rel);
            const limit = governed(`fill|${s.id}`, s.fill.rule, s.fill.kind, `${s.id}.fill`, `$.stores.${s.id}.fill.rule`);
            fillRoom.set(s.id, attempt(() => {
                if (isGap(s.capacity))
                    refuse(unknownPrerequisite(`$.stores.${s.id}.capacity`, s.capacity.note));
                return Q.min(need(limit), Q.add(Q.sub(s.capacity, need(content)), need(rel)));
            }));
        }
        // ---------------------------------------------------------------- 5. requirement and upkeep (C3.12)
        const requirement = new Map();
        const upkeep = new Map();
        const loadsNow = new Map();
        for (const id of ranked)
            for (const l of partById.get(id).loads)
                loadsNow.set(k2(id, l.id), loadAt(id, l.id));
        for (const pr of pairs) {
            const part = partById.get(pr.part);
            const entry = part.requirement.find((q) => q.resource === pr.resource);
            const key = k2(pr.part, pr.resource);
            const loadFn = (load) => need(loadsNow.get(k2(pr.part, load)));
            const unitsFn = () => need(units.get(pr.part));
            const req = attempt(() => {
                const d = damaged.get(pr.part);
                if (d)
                    refuse(d);
                if (isGap(entry.rule))
                    refuse(unknownPrerequisite(`$.parts.${pr.part}.requirement.${pr.resource}`, entry.rule.note));
                return evalPartRule(entry.rule, `$.parts.${pr.part}.requirement.${pr.resource}`, loadFn, unitsFn);
            });
            requirement.set(key, req);
            const up = part.upkeep.find((q) => q.resource === pr.resource);
            if (up) {
                upkeep.set(key, attempt(() => {
                    if (isGap(up.rule))
                        refuse(unknownPrerequisite(`$.parts.${pr.part}.upkeep.${pr.resource}`, up.rule.note));
                    return evalPartRule(up.rule, `$.parts.${pr.part}.upkeep.${pr.resource}`, loadFn, unitsFn);
                }));
            }
            // C3.12b at run time: requirement falls only when an input the rule reads falls.
            const prev = prevRequirement.get(key);
            if (t > 0 && prev?.ok && req.ok && !isGap(entry.rule)) {
                if (Q.lt(req.v, prev.v)) {
                    const fell = loadsRead(entry.rule).some((l) => {
                        const a = prevLoads.get(k2(pr.part, l));
                        const b = loadsNow.get(k2(pr.part, l));
                        return a?.ok === true && b?.ok === true && Q.lt(b.v, a.v);
                    });
                    if (!fell)
                        throw new AccountingError(`requirement of '${pr.part}' for '${pr.resource}' fell while no input it reads fell (C3.12b)`);
                }
                const s = settingOf(pr.part, pr.resource);
                // The top never changes within a boundary (C4.4a), so only parts below it can move.
                if (!Q.eq(req.v, prev.v) && s?.kind === 'built-in' && pr.part !== topId) {
                    if (topId === null) {
                        // With the top unknown the order is refused because the top is not known; the part may be the top, whose place never moves.
                        flags.push({ code: 'built-in-requirement-changed', subject: pr.part, detail: `requirement for '${pr.resource}' changed under a built-in setting: its place may move (Q-006), unless it is the top, which is an information gap and whose place never moves (C4.4a)`, canon: 'C3.7' });
                    }
                    else {
                        orderRefusals = mergeRefusals(orderRefusals, [U.placeAfterRequirementChange(pr.part, pr.resource)]);
                        flags.push({ code: 'built-in-requirement-changed', subject: pr.part, detail: `requirement for '${pr.resource}' changed under a built-in setting: its place may move (Q-006)`, canon: 'C3.7' });
                    }
                }
            }
        }
        // ---------------------------------------------------------------- 6. order (C4.3; PROP-RANK-01), after requirement so a built-in part's change shows in its own step
        const orderV = attempt(() => {
            if (!mode)
                refuse(...modeRefusals);
            if (orderRefusals.length > 0)
                refuse(...orderRefusals);
            const entries = ranked.map((id) => {
                const layer = layers.layer.get(id);
                if (layer === undefined)
                    refuse(unknownPrerequisite('$.boundary.top', 'the top is an information gap, so no layers can be derived'));
                const pos = mode.positions.get(id);
                if (isGap(pos))
                    refuse(unknownPrerequisite(`$.parts.${id}.rank.position`, pos.note));
                return { part: id, layer, position: pos };
            });
            return entries.sort((a, b) => a.layer - b.layer || a.position - b.position || byId(a.part, b.part));
        });
        const inflowV = new Map();
        const outsideV = new Map();
        const releaseV = new Map();
        const enteringV = new Map();
        const drawn = new Map();
        // PROP-TOP-01: how each resource's draw was settled while the top is an information gap (never with a known top).
        const unknownTopOf = new Map();
        for (const res of resources) {
            const series = scenario.inflow.find((x) => x.resource === res);
            const inflow = seriesAt(series.entries, t, `$.inflow.${res}`);
            inflowV.set(res, inflow);
            const outside = sumV(model.outsideInputs.filter((o) => o.resource === res).sort((a, b) => byId(a.id, b.id))
                .map((o) => seriesAt(scenario.outsideInput.find((x) => x.input === o.id).entries, t, `$.outsideInput.${o.id}`)));
            outsideV.set(res, outside);
            const storesOfRes = stores.filter((s) => s.resource === res);
            const rel = sumV(storesOfRes.map((s) => release.get(s.id)));
            releaseV.set(res, rel);
            const entering = attempt(() => Q.add(Q.add(need(inflow), need(outside)), need(rel)));
            enteringV.set(res, entering);
            const drawing = ranked.filter((id) => settingOf(id, res) !== undefined);
            if (topId === null) {
                // Replaced below once the draw is reached; until then something it needs was refused.
                unknownTopOf.set(res, {
                    proposal: 'PROP-TOP-01', version: UNKNOWN_TOP_VERSION, top: 'unknown', policy: policy?.proposalId ?? null,
                    candidates: [], identical: null, committedDrawsFit: null, result: 'refused', reason: 'prerequisite-refused',
                });
            }
            drawn.set(res, attempt(() => {
                const rr = resourceRefusals.get(res);
                if (rr && rr.length > 0)
                    refuse(...rr);
                if (!mode)
                    refuse(...modeRefusals);
                if (policy === null)
                    refuse(U.noDrawPolicy(res));
                const order = policy.readsRank ? need(orderV) : [];
                const parts = drawing.map((id) => {
                    const key = k2(id, res);
                    const s = settingOf(id, res);
                    const rc = routeCap.get(key);
                    const rk = order.find((o) => o.part === id);
                    return {
                        part: id,
                        isTop: id === topId,
                        access: quantity(res, need(access.get(key))),
                        routeCapacity: rc === undefined ? null : quantity(res, need(rc)),
                        requirement: policy.readsRequirement ? quantity(res, need(requirement.get(key))) : null,
                        rank: policy.readsRank && rk ? { layer: rk.layer, position: rk.position } : null,
                        setting: s.id,
                        settingData: s.proposalData,
                    };
                });
                const drawStores = storesOfRes.map((s) => ({ store: s.id, fillRoom: quantity(res, need(fillRoom.get(s.id))) }));
                const input = { resource: res, entering: quantity(res, need(entering)), parts, stores: drawStores };
                if (isGap(top)) {
                    // PROP-TOP-01 (decision Q3, 2026-10-22): the draw is stated only where it is the same under every candidate top.
                    const u = drawUnknownTop(policy, input, unknownPrerequisite('$.boundary.top', top.note));
                    unknownTopOf.set(res, u.record);
                    const d = need(u.drawn);
                    return {
                        received: new Map(d.result.received.map((x) => [x.part, x.amount.value])),
                        filled: new Map(d.result.filled.map((x) => [x.store, x.amount.value])),
                        unused: d.unused,
                    };
                }
                const result = policy.draw(input);
                const checked = checkDraw(policy, input, result);
                if ('refusal' in checked)
                    refuse(checked.refusal);
                return {
                    received: new Map(result.received.map((x) => [x.part, x.amount.value])),
                    filled: new Map(result.filled.map((x) => [x.store, x.amount.value])),
                    unused: checked.unused,
                };
            }));
        }
        // ---------------------------------------------------------------- 8. accounting and records
        const received = new Map();
        const shortfall = new Map();
        const upkeepShortOf = new Map();
        const partRecords = [];
        for (const pr of pairs) {
            const key = k2(pr.part, pr.resource);
            const d = drawn.get(pr.resource);
            const s = settingOf(pr.part, pr.resource);
            const rec = !d.ok ? refused(d.refusals) : s && d.v.received.has(pr.part) ? ok(d.v.received.get(pr.part))
                : unknownV(`mode ${mode?.id ?? '(unknown)'}`, `no setting in force for '${pr.part}' and '${pr.resource}'`);
            received.set(key, rec);
            const req = requirement.get(key);
            const sf = attempt(() => Q.positivePart(Q.sub(need(req), need(rec))));
            shortfall.set(key, sf);
            const ex = attempt(() => Q.positivePart(Q.sub(need(rec), need(req))));
            const up = upkeep.get(key);
            const covered = up === undefined ? undefined : attempt(() => Q.min(need(rec), need(up)));
            const remainder = covered === undefined ? undefined : attempt(() => Q.sub(need(rec), need(covered)));
            // Decision Q-023: requirement is upkeep plus work.
            const workReq = up === undefined ? undefined : attempt(() => {
                const whole = need(req);
                const u = need(up);
                if (Q.gt(u, whole)) {
                    refuse(unknownPrerequisite(`$.parts.${pr.part}.upkeep.${pr.resource}`, 'upkeep exceeds requirement in a step, but requirement is upkeep plus work (decision Q-023): the rules disagree'));
                }
                return Q.sub(whole, u);
            });
            const upkeepShort = workReq === undefined ? undefined : attempt(() => {
                need(workReq);
                return Q.sub(need(up), need(covered));
            });
            const workShort = workReq === undefined ? undefined : attempt(() => Q.positivePart(Q.sub(need(workReq), need(remainder))));
            if (upkeepShort !== undefined)
                upkeepShortOf.set(key, upkeepShort);
            const acc = access.get(key);
            const rc = routeCap.get(key);
            let bound = null;
            if (rec.ok && acc.ok && (rc === undefined || rc.ok)) {
                const cap = rc === undefined ? acc.v : Q.min(acc.v, rc.v);
                bound = Q.eq(rec.v, cap) ? (rc !== undefined && Q.lt(rc.v, acc.v) ? 'route' : 'access') : 'neither';
            }
            if (ex.ok && Q.isPositive(ex.v)) {
                flags.push({ code: 'excess-received', subject: pr.part, detail: `received ${Q.toCanonical(ex.v)} of '${pr.resource}' beyond its requirement (C1.3's condition does not hold)`, canon: 'C1.3, C1.4d' });
            }
            partRecords.push({
                part: pr.part, resource: pr.resource, setting: s?.id ?? null,
                access: tv('computed', acc, t),
                routeCapacity: rc === undefined ? null : tv('computed', rc, t),
                realisedFlow: tv('computed', rec, t),
                received: tv('computed', rec, t),
                requirement: tv('computed', req, t),
                shortfall: tv('computed', sf, t),
                excess: tv('computed', ex, t),
                upkeep: up === undefined ? null : tv('computed', up, t),
                upkeepCovered: covered === undefined ? null : tv('computed', covered, t),
                remainderForWork: remainder === undefined ? null : tv('computed', remainder, t),
                workRequirement: workReq === undefined ? null : tv('computed', workReq, t),
                upkeepShortfall: upkeepShort === undefined ? null : tv('computed', upkeepShort, t),
                workShortfall: workShort === undefined ? null : tv('computed', workShort, t),
                bound,
            });
        }
        // ---------------------------------------------------------------- P-LOAD-01 (approved 2026-10-20), only where the scenario enables it
        // Loss: units lost = min(units, the largest over the dial's resources of rate x upkeep shortfall).
        // Rebuilding: from what is left after every part drew and every store filled, at most perStep units
        // of those lost so far, at the dial's cost per unit; parts claiming one resource share what is left in
        // proportion to their claims. Units are unit equivalents (exact rationals).
        const lossOf = new Map();
        const rebuiltOf = new Map();
        const spendOf = new Map(resources.map((r) => [r, ok(Q.ZERO)]));
        const loadParts = ranked.filter((id) => loadDialsOf(id) !== null);
        if (pLoad && loadParts.length > 0) {
            const wantOf = new Map();
            for (const id of loadParts) {
                const dv = loadDialsOf(id);
                const loss = attempt(() => {
                    const d = need(dv);
                    if (damaged.has(id))
                        refuse(U.unitsAfterDamage(id));
                    let worst = Q.ZERO;
                    for (const r of Object.keys(d.loss.parameters).sort(byId)) {
                        const us = upkeepShortOf.get(k2(id, r));
                        if (us === undefined)
                            refuse(unknownPrerequisite(`$.parts.${id}.loadDials.unitLossUnderShortfall.parameters.${r}`, `no upkeep shortfall is computed for '${r}'`));
                        worst = Q.max(worst, Q.mul(d.loss.parameters[r], need(us)));
                    }
                    return Q.min(need(units.get(id)), worst);
                });
                lossOf.set(id, loss);
                wantOf.set(id, attempt(() => Q.min(Q.add(need(lostOutstanding.get(id)), need(loss)), need(dv).rebuild.parameters['perStep'])));
            }
            const costOf = (id, r) => {
                const dv = loadDialsOf(id);
                if (dv === null || !dv.ok || r === 'perStep')
                    return undefined;
                return dv.v.rebuild.parameters[r];
            };
            const shareOf = new Map();
            for (const res of resources) {
                const claimants = loadParts.filter((id) => costOf(id, res) !== undefined);
                if (claimants.length === 0)
                    continue;
                const d = drawn.get(res);
                shareOf.set(res, attempt(() => {
                    const left = need(d).unused;
                    const claims = claimants.map((id) => [id, Q.mul(costOf(id, res), need(wantOf.get(id)))]);
                    const total = Q.sum(claims.map((c) => c[1]));
                    return new Map(claims.map(([id, c]) => [id, Q.le(total, left) ? c : Q.div(Q.mul(left, c), total)]));
                }));
            }
            for (const id of loadParts) {
                const dv = loadDialsOf(id);
                rebuiltOf.set(id, attempt(() => {
                    let n = need(wantOf.get(id));
                    for (const r of Object.keys(need(dv).rebuild.parameters).filter((k) => k !== 'perStep').sort(byId)) {
                        const share = need(shareOf.get(r)).get(id);
                        n = Q.min(n, Q.div(share, costOf(id, r)));
                    }
                    return n;
                }));
            }
            for (const res of resources) {
                const claimants = loadParts.filter((id) => costOf(id, res) !== undefined);
                spendOf.set(res, attempt(() => Q.sum(claimants.map((id) => Q.mul(need(rebuiltOf.get(id)), costOf(id, res))))));
            }
        }
        const storeFill = new Map();
        const nextContent = new Map();
        const storeRecords = [];
        for (const s of stores) {
            const d = drawn.get(s.resource);
            const fill = d.ok ? (d.v.filled.has(s.id) ? ok(d.v.filled.get(s.id)) : unknownV(`fill ${s.id}`, 'the allocation returned no fill')) : refused(d.refusals);
            storeFill.set(s.id, fill);
            const content = storeContent.get(s.id);
            const rel = release.get(s.id);
            const end = attempt(() => Q.add(Q.sub(need(content), need(rel)), need(fill)));
            if (end.ok && (Q.isNegative(end.v) || (!isGap(s.capacity) && Q.gt(end.v, s.capacity)))) {
                throw new AccountingError(`store '${s.id}' at step ${t} ends outside 0 to capacity`);
            }
            nextContent.set(s.id, end);
            storeRecords.push({
                store: s.id, resource: s.resource,
                start: tv(t === 0 ? 'input' : 'computed', content, t),
                release: tv('computed', rel, t),
                fillRoom: tv('computed', fillRoom.get(s.id), t),
                fill: tv('computed', fill, t),
                end: tv('computed', end, t),
            });
        }
        const resourceRecords = [];
        for (const res of resources) {
            const d = drawn.get(res);
            const ofRes = pairs.filter((p) => p.resource === res);
            const storesOfRes = stores.filter((s) => s.resource === res);
            const total = (m) => sumV(ofRes.map((p) => m.get(k2(p.part, p.resource))));
            const excessTotal = attempt(() => Q.sum(ofRes.map((p) => Q.positivePart(Q.sub(need(received.get(k2(p.part, res))), need(requirement.get(k2(p.part, res))))))));
            const totalReq = total(requirement);
            const totalShort = total(shortfall);
            const receivedTotal = total(received);
            const fillTotal = sumV(storesOfRes.map((s) => storeFill.get(s.id)));
            // What was left after every part drew and every store filled; rebuilding (P-LOAD-01) is paid from it.
            const leftover = d.ok ? ok(d.v.unused) : refused(d.refusals);
            const spend = spendOf.get(res);
            const unused = attempt(() => Q.sub(need(leftover), need(spend)));
            const opening = sumV(storesOfRes.map((s) => storeContent.get(s.id)));
            const closing = sumV(storesOfRes.map((s) => nextContent.get(s.id)));
            const outflows = ok(Q.ZERO); // none can be mapped in this schema (Q-027)
            const inflow = inflowV.get(res);
            const outside = outsideV.get(res);
            const rel = releaseV.get(res);
            const entering = enteringV.get(res);
            const all = [opening, inflow, outside, rel, entering, receivedTotal, fillTotal, spend, unused, closing];
            if (all.every((x) => x.ok)) {
                const v = (x) => x.v;
                if (Q.isNegative(v(unused)))
                    throw new AccountingError(`rebuilding of '${res}' at step ${t} spent more than was left`);
                // Within the step: entering = received + filled + outflows + rebuilding + unused (C1.1).
                if (!Q.eq(v(entering), Q.add(Q.add(Q.add(Q.add(v(receivedTotal), v(fillTotal)), v(outflows)), v(spend)), v(unused))))
                    throw new AccountingError(`flow of '${res}' at step ${t}`);
                // Across the step, store release counted once: opening + inflow + outside = received + outflows + rebuilding + unused + closing.
                if (!Q.eq(Q.add(Q.add(v(opening), v(inflow)), v(outside)), Q.add(Q.add(Q.add(Q.add(v(receivedTotal), v(outflows)), v(spend)), v(unused)), v(closing)))) {
                    throw new AccountingError(`reconciliation of '${res}' at step ${t}`);
                }
            }
            // CANON 1's ledger, only where its conditions hold.
            const precondition = attempt(() => {
                const problems = [];
                if (Q.isPositive(need(leftover)))
                    problems.push(U.scarcityPreconditionNotMet(res, 'inflow not fully used'));
                if (Q.isPositive(need(excessTotal)))
                    problems.push(U.scarcityPreconditionNotMet(res, 'a part received beyond its requirement'));
                if (problems.length > 0)
                    refuse(...problems);
                return true;
            });
            const ledger = (f) => attempt(() => {
                need(precondition);
                return f();
            });
            const gap = ledger(() => Q.sub(need(totalReq), need(inflow)));
            const fromStores = ledger(() => Q.sub(need(rel), need(fillTotal)));
            const fromOutside = ledger(() => need(outside));
            const unmet = ledger(() => need(totalShort));
            if (gap.ok && fromStores.ok && fromOutside.ok && unmet.ok && !Q.eq(gap.v, Q.add(Q.add(fromStores.v, fromOutside.v), unmet.v))) {
                throw new AccountingError(`CANON 1 ledger of '${res}' at step ${t}`);
            }
            if (leftover.ok && Q.isPositive(leftover.v)) {
                flags.push({ code: 'inflow-not-fully-used', subject: res, detail: `${Q.toCanonical(leftover.v)} entered and was neither received nor stored`, canon: 'C1.2, C1.3' });
                if (totalShort.ok && Q.isPositive(totalShort.v)) {
                    flags.push({ code: 'residual-while-short', subject: res, detail: 'resource was left in the flow while a part was short (the case of CANON 1\'s gate exception; Q-011)', canon: 'C1.4c' });
                }
            }
            if (fillTotal.ok && Q.isPositive(fillTotal.v)) {
                const heldBack = partRecords.some((p) => p.resource === res && (p.bound === 'access' || p.bound === 'route') && 'v' in p.shortfall && p.shortfall.v !== '0');
                if (heldBack)
                    flags.push({ code: 'stored-while-short', subject: res, detail: 'a store filled while a part was short with its access or route bound (Q-011)', canon: 'C1.4c' });
            }
            resourceRecords.push({
                resource: res,
                storable: resourceById.get(res).storable,
                openingStock: tv(t === 0 ? 'input' : 'computed', opening, t),
                inflow: tv('input', inflow, t),
                outsideInput: tv('input', outside, t),
                storeRelease: tv('computed', rel, t),
                entering: tv('computed', entering, t),
                receipts: ofRes.map((p) => ({ part: p.part, amount: tv('computed', received.get(k2(p.part, res)), t) })),
                receivedByParts: tv('computed', receivedTotal, t),
                storeFill: tv('computed', fillTotal, t),
                mappedOutflows: tv('computed', outflows, t),
                rebuilding: tv('computed', spend, t),
                unused: tv('computed', unused, t),
                closingStock: tv('computed', closing, t),
                totalRequirement: tv('computed', totalReq, t),
                totalShortfall: tv('computed', totalShort, t),
                totalExcess: tv('computed', excessTotal, t),
                scarcityLedger: {
                    gap: tv('computed', gap, t), metFromStores: tv('computed', fromStores, t),
                    metFromOutside: tv('computed', fromOutside, t), leftUnmet: tv('computed', unmet, t),
                },
                // Only while the top is an information gap: a known-top record has no such member.
                ...(topId === null ? { unknownTop: unknownTopOf.get(res) } : {}),
            });
        }
        // Shortness per part this step (any resource), and units for the next step (C3.13d, C7.3).
        const shortNow = new Map();
        for (const id of ranked) {
            shortNow.set(id, attempt(() => {
                const unknown = [];
                for (const pr of pairs.filter((p) => p.part === id)) {
                    const sf = shortfall.get(k2(id, pr.resource));
                    if (sf.ok && Q.isPositive(sf.v))
                        return true;
                    if (!sf.ok)
                        unknown.push([...sf.refusals]);
                }
                if (unknown.length > 0)
                    refuse(...mergeRefusals(...unknown));
                return false;
            }));
        }
        const unitRecords = [];
        const nextUnits = new Map();
        const nextLost = new Map();
        for (const id of ranked) {
            const u = units.get(id);
            const dv = loadDialsOf(id);
            const loss = lossOf.get(id);
            const rebuilt = rebuiltOf.get(id);
            unitRecords.push({
                part: id, units: tv(t === 0 ? 'input' : 'computed', u, t),
                lost: loss === undefined ? null : tv('computed', loss, t),
                rebuilt: rebuilt === undefined ? null : tv('computed', rebuilt, t),
            });
            if (loss !== undefined && rebuilt !== undefined) {
                // P-LOAD-01: lost units leave and rebuilt units return from the next step.
                nextUnits.set(id, attempt(() => Q.add(Q.sub(need(u), need(loss)), need(rebuilt))));
                nextLost.set(id, attempt(() => Q.sub(Q.add(need(lostOutstanding.get(id)), need(loss)), need(rebuilt))));
                continue;
            }
            nextUnits.set(id, attempt(() => {
                const n = need(u);
                if (damaged.has(id))
                    refuse(U.unitsAfterDamage(id));
                if (need(shortNow.get(id)))
                    refuse(dv !== null && !dv.ok ? dv.refusals[0] : U.unitsAfterShortfall(id));
                return n;
            }));
            nextLost.set(id, lostOutstanding.get(id));
        }
        // The protected flow (C2.4) and indicators (C3.3).
        const pfKey = topId !== null && pfResId !== null ? k2(topId, pfResId) : null;
        const pfMissing = topId === null ? unknownV('$.boundary.top', top.note) : unknownV('$.protectedFlow.resource', pfRes.note);
        const pfRecord = {
            resource: pfResId, top: topId,
            received: tv('computed', pfKey ? received.get(pfKey) : pfMissing, t),
            need: tv('computed', pfKey ? requirement.get(pfKey) : pfMissing, t),
            shortfall: tv('computed', pfKey ? shortfall.get(pfKey) : pfMissing, t),
        };
        if (pfKey && pfResId !== null) {
            const topShort = shortfall.get(pfKey);
            if (topShort.ok && Q.isPositive(topShort.v)) {
                const notShort = pairs.filter((p) => p.resource === pfResId && p.part !== topId).filter((p) => {
                    const sf = shortfall.get(k2(p.part, p.resource));
                    return sf.ok && Q.isZero(sf.v);
                }).map((p) => p.part);
                if (notShort.length > 0) {
                    const supportsShortBefore = ranked.filter((id) => layers.layer.get(id) === 1 && prevShort.get(id)?.ok && prevShort.get(id).v);
                    flags.push({
                        code: 'top-short-another-not', subject: topId,
                        detail: `the top is short of '${pfResId}' while ${notShort.join(', ')} ${notShort.length === 1 ? 'is' : 'are'} not` +
                            (supportsShortBefore.length > 0
                                ? `; support parts short in the step before: ${supportsShortBefore.join(', ')} (the case CANON 4's dependency-lag note describes; dependencies have no effect in this engine, Q-007)`
                                : '; no support part was short in the step before'),
                        canon: 'C4.1b, C4.4n2', proposal: 'APP-08',
                    });
                }
            }
        }
        // Decision Q-017: a part with no path to the top sits in the bottom layer; flag it where it keeps its
        // access while a part ranked above it is cut. Only under a known top: where the layers are not derived,
        // no part is unreached (rank.ts).
        const committedOf = (key) => attempt(() => {
            const rc = routeCap.get(key);
            return rc === undefined ? need(access.get(key)) : Q.min(need(access.get(key)), need(rc));
        });
        const lowered = (key) => {
            if (t === 0)
                return false;
            const a = access.get(key);
            const b = prevAccess.get(key);
            return a.ok && b?.ok ? Q.lt(a.v, b.v) : null;
        };
        const positionOf = (id) => (orderV.ok ? orderV.v.find((o) => o.part === id)?.position ?? null : null);
        for (const u of layers.unreached) {
            for (const res of resources) {
                const key = k2(u, res);
                // Only a resource the part draws (it states a requirement on it): it has no access to any other.
                if (!received.has(key))
                    continue;
                const rec = received.get(key);
                const cap = committedOf(key);
                if (!rec?.ok || !cap.ok || !Q.eq(rec.v, cap.v) || lowered(key) !== false)
                    continue;
                const cutAbove = ranked.filter((h) => {
                    if (h === u || !received.has(k2(h, res)))
                        return false;
                    const lh = layers.layer.get(h);
                    const lu = layers.layer.get(u);
                    const ph = positionOf(h);
                    const pu = positionOf(u);
                    const above = lh < lu || (lh === lu && ph !== null && pu !== null && ph < pu);
                    if (!above)
                        return false;
                    const hr = received.get(k2(h, res));
                    const hc = committedOf(k2(h, res));
                    return (hr.ok && hc.ok && Q.lt(hr.v, hc.v)) || lowered(k2(h, res)) === true;
                });
                if (cutAbove.length > 0) {
                    flags.push({
                        code: 'unreached-part-kept-access', subject: u,
                        detail: `'${u}' has no dependency path to the top (bottom layer) and kept its access to '${res}' while ${cutAbove.join(', ')} ${cutAbove.length === 1 ? 'was' : 'were'} cut (decision Q-017)`,
                        canon: 'C4.3a',
                    });
                }
            }
        }
        const indicatorRecords = model.indicators.slice().sort((a, b) => byId(a.id, b.id)).map((ind) => {
            const kind = isGap(ind.kind) ? null : ind.kind;
            if ('protectedFlow' in ind.watches)
                return { indicator: ind.id, kind, value: pfRecord.received, sensed: null };
            if ('level' in ind.watches) {
                const st = sensed.get(ind.watches.level);
                return { indicator: ind.id, kind, value: tv(st.definiteTag, st.definite, t), sensed: st.delivered === null ? null : tv('sensed', st.delivered, t) };
            }
            return { indicator: ind.id, kind, value: tv(measureTag(ind.watches.measure), measureValue(ind.watches.measure, null), t), sensed: null };
        });
        const bandTV = (x) => (isGap(x) ? tv('input', unknownV('$.governor.bands', x.note), t) : { t: 'input', v: Q.toCanonical(x) });
        const levelRecords = levels.map((l) => {
            const st = sensed.get(l.id);
            if (st.held && st.delivered === null) {
                flags.push({ code: 'held-level-silent', subject: l.id, detail: `the governor holds this level and nothing reached it (${st.signal}${st.notActionable ? `, ${st.notActionable}` : ''})`, canon: 'C7.1b' });
            }
            if (st.inBand === false)
                flags.push({ code: 'held-level-out-of-band', subject: l.id, detail: 'the delivered level is outside its band', canon: 'C2.2b' });
            const b = st.held ? bands.get(l.id) : undefined;
            return {
                level: l.id,
                producedBy: isGap(l.producedBy) ? null : l.producedBy,
                definite: tv(st.definiteTag, st.definite, t),
                signal: st.signal,
                notActionable: st.notActionable,
                basis: st.basis,
                basisDetail: st.basisDetail,
                sent: st.sent === null ? null : tv('sensed', st.sent, t),
                expectedRecipients: st.recipients,
                observedDelivery: st.delivered === null ? null : tv('sensed', st.delivered, t),
                band: b ? { lower: bandTV(b.lower), upper: bandTV(b.upper), held: b.held === undefined ? null : bandTV(b.held) } : null,
                inBand: st.inBand,
            };
        });
        const order = orderV.ok ? { entries: orderV.v } : { refused: notes.note(orderV.refusals, t) };
        flags.sort((a, b) => byId(a.code, b.code) || byId(a.subject, b.subject) || byId(a.detail, b.detail));
        const stepRecord = {
            step: t, mode: mode?.id ?? null, snapshot: snapshots.length, order, levels: levelRecords, parts: partRecords,
            resources: resourceRecords, stores: storeRecords, units: unitRecords, protectedFlow: pfRecord,
            indicators: indicatorRecords, flags,
        };
        steps.push(stepRecord);
        // ---------------------------------------------------------------- carry to the next step
        prevReceived = received;
        prevEntering = enteringV;
        prevInflow = inflowV;
        prevShort = shortNow;
        prevShortfall = shortfall;
        prevAccess = access;
        prevDelivered = new Map(levels.map((l) => [l.id, sensed.get(l.id).delivered]));
        prevRuleValue = ruleValue;
        prevRequirement = requirement;
        prevLoads = loadsNow;
        storeContent = nextContent;
        units = nextUnits;
        lostOutstanding = nextLost;
        return stepRecord;
    };
    const finish = (finishOptions) => {
        if (nextStep !== scenario.steps)
            throw new Error(`run: finished after ${nextStep} of ${scenario.steps} steps (a defect)`);
        closeSnapshot(scenario.steps - 1);
        const usesLevels = model.settings.some((s) => !isGap(s.rule) && s.rule.kind !== 'constant') ||
            model.routes.some((r) => !isGap(r.capacity) && r.capacity.kind !== 'constant') ||
            model.stores.some((s) => [s.release.rule, s.fill.rule].some((x) => !isGap(x) && x.kind !== 'constant'));
        const proposals = new Set(CORE_PROPOSALS);
        if (policy)
            proposals.add(policy.proposalId);
        // PROP-TOP-01 is in force in every run whose top is an information gap and whose policy declares it.
        if (topId === null && policy?.unknownTop === 'evaluate-admissible-tops')
            proposals.add('PROP-TOP-01');
        if (model.stores.length > 0)
            proposals.add('PROP-STORE-01');
        if (usesLevels)
            proposals.add('PROP-SILENCE-01');
        if (model.levels.some((l) => l.whenProducerShort !== undefined))
            proposals.add('PROP-SENSE-01');
        if (pLoad)
            proposals.add('P-LOAD-01');
        for (const p of finishOptions?.proposals ?? [])
            proposals.add(p);
        const summary = notes.summary();
        return {
            stamp: {
                ...engineMeta(),
                mapping: { id: model.id, sha256: hashes.model },
                scenario: { id: scenario.id, sha256: hashes.scenario },
                seed: scenario.seed,
                steps: scenario.steps,
                allocationPolicy: policy?.proposalId ?? null,
                proposals: [...proposals].sort(byId),
                modesUsed: [...modesUsed].sort(byId),
                refusals: summary.map((s) => ({ id: s.id, category: s.category, question: s.question, proposal: s.proposal })),
            },
            snapshots,
            steps,
            refusals: summary,
            questions: notes.questions(),
        };
    };
    return { step: stepAt, finish, describe: (id) => notes.refusal(id) };
}
/** Run validated documents: every step in order, then the trace. */
export function runValidated(model, scenario, options, hashes) {
    const cursor = startRun(model, scenario, options, hashes);
    for (let t = 0; t < scenario.steps; t++)
        cursor.step(t);
    return cursor.finish();
}
