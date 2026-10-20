// Evaluation of declarative rules. A rule on a sensed level gives a value at
// each reading (C3.6b); a requirement rule reads a part's loads (C3.12a).
// A reading outside a linear table's declared range is refused as an unknown
// prerequisite, never extrapolated.
//
// Silence never produces a value. A rule reading a silent level:
//   - read as no intervention: the governor does not act, so the value the rule
//     gave in the step before stands (Q-029); with no earlier value it is refused;
//   - read as alarm: the response the mapping states (PROP-SILENCE-01), or refused;
//   - a built-in rule: refused (Q-012).
import { need, refuse, unknownPrerequisite } from "./refusal.js";
import * as Q from "./rational.js";
import { isGap } from "./schema/types.js";
import { builtInReadingSilence } from "./unspecified.js";
function interpolate(points, x, path) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Q.lt(x, first.at) || Q.gt(x, last.at)) {
        refuse(unknownPrerequisite(path, `reading ${Q.toCanonical(x)} lies outside the declared range ${Q.toCanonical(first.at)} to ${Q.toCanonical(last.at)}`));
    }
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (Q.le(x, b.at)) {
            const share = Q.div(Q.sub(x, a.at), Q.sub(b.at, a.at));
            return Q.add(a.value, Q.mul(Q.sub(b.value, a.value), share));
        }
    }
    return last.value;
}
/**
 * Evaluate a rule on a sensed level. `read` gives what the rule's reader
 * receives from the level (or leaves with its refusals); `earlier` gives the
 * value this rule gave in the step before, used only when the level is
 * silent and silence is read as no intervention.
 */
export function evalLevelRule(rule, kind, ruleId, path, read, earlier) {
    if (rule.kind === 'constant')
        return rule.value;
    const reading = read(rule.reads);
    if (reading.kind === 'silent') {
        if (kind === 'built-in')
            refuse(builtInReadingSilence(ruleId, rule.reads));
        if (reading.readAs === 'no-intervention')
            return need(earlier());
        const v = rule.whenSilent?.alarm;
        if (v === undefined) {
            refuse(unknownPrerequisite(`${path}.whenSilent.alarm`, `level '${rule.reads}' is silent, read as alarm, and the rule states no response to that (PROP-SILENCE-01)`));
        }
        if (isGap(v))
            refuse(unknownPrerequisite(`${path}.whenSilent.alarm`, v.note));
        return v;
    }
    const x = reading.value;
    if (rule.kind === 'step') {
        let value = rule.below;
        for (const s of rule.steps)
            if (Q.ge(x, s.from))
                value = s.value;
        return value;
    }
    return interpolate(rule.points, x, `${path}.points`);
}
/** Evaluate a requirement or upkeep rule. `load` gives a load's value this step (or leaves with its refusals). */
export function evalPartRule(rule, path, load, units) {
    switch (rule.kind) {
        case 'constant':
            return rule.value;
        case 'linear': {
            let v = rule.base;
            for (const t of rule.terms)
                v = Q.add(v, Q.mul(t.per, load(t.load)));
            return v;
        }
        case 'table':
            return interpolate(rule.points, load(rule.load), `${path}.points`);
        case 'per-unit':
            return Q.mul(rule.per, units());
    }
}
/** The loads a rule reads (for the run-time check of C3.12b). */
export function loadsRead(rule) {
    if (rule.kind === 'linear')
        return rule.terms.map((t) => t.load);
    if (rule.kind === 'table')
        return [rule.load];
    return [];
}
/** The level a rule reads, if any. */
export function levelRead(rule) {
    return rule.kind === 'constant' ? null : rule.reads;
}
