// Refusals. A calculation the engine cannot make returns a typed refusal inside
// the result, with a stable category, and every independent result that can
// still be computed is returned beside it. Nothing that depends on a refusal is
// defaulted: it is refused too, carrying the same refusals.
//
// Internally, `need` short-circuits out of a computation and `attempt` turns
// that back into a refused value. The short-circuit never leaves the core: no
// caller sees an exception for a refused calculation. Exceptions are kept for a
// model or scenario that cannot be initialised, and for the engine's own
// invariant failures (defects).
export const REFUSAL_CATEGORIES = [
    'unknown-prerequisite', 'invalid-resource-topology', 'unsupported-rule', 'unspecified-allocation-policy',
    'scarcity-precondition-not-met', 'invalid-settings-change', 'unmapped-transition',
];
/** Internal short-circuit carrying refusals. Not an Error, never exported. */
class Short {
    refusals;
    constructor(refusals) {
        this.refusals = refusals;
    }
}
export function ok(v) {
    return { ok: true, v };
}
export function refused(refusals) {
    return { ok: false, refusals: mergeRefusals(refusals) };
}
export function mergeRefusals(...lists) {
    const byId = new Map();
    for (const list of lists)
        for (const r of list)
            if (!byId.has(r.id))
                byId.set(r.id, r);
    return [...byId.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((k) => byId.get(k));
}
/** Leave the enclosing `attempt` with these refusals. */
export function refuse(...refusals) {
    throw new Short(refusals);
}
/** The value, or leave the enclosing `attempt` carrying its refusals. */
export function need(x) {
    if (x.ok)
        return x.v;
    throw new Short(x.refusals);
}
/** Run a computation that may need refused values. Any other exception is a defect and passes through. */
export function attempt(fn) {
    try {
        return ok(fn());
    }
    catch (e) {
        if (e instanceof Short)
            return refused(e.refusals);
        throw e;
    }
}
export function refusalsOf(...values) {
    return mergeRefusals(...values.map((x) => (x.ok ? [] : x.refusals)));
}
/** A needed value is unknown: an explicit gap in the mapping or scenario, or data that does not cover the case. */
export function unknownPrerequisite(path, note) {
    return { id: `unknown-prerequisite ${path}`, category: 'unknown-prerequisite', message: `unknown at ${path}: ${note}`, path };
}
/** Shorthand: a refused value for an unknown prerequisite. */
export function unknownV(path, note) {
    return refused([unknownPrerequisite(path, note)]);
}
