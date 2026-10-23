// The within-step draw: who takes what from the shared flow of one resource.
// CANON does not give it (C3.4b, C4.2; Q-001, Q-002), so the core defines only
// this interface and has no default. A policy lives under src/proposals/, and
// every run names the policy's proposal id in its stamp. Without a policy the
// draw is refused (unspecified allocation policy) and everything else is
// still computed.
//
// The core checks every policy result against the limits CANON does state:
// realised flow never above access or route capacity (C2.5n), nothing taken
// that did not enter (C1.1), stores within their room (C2.6); and against
// decision Q-002: a part draws up to its access, even beyond its requirement,
// so where the committed draws fit within what entered, each part receives its
// committed draw. A result that breaks one is refused for that resource; the
// policy's numbers are not used.
//
// No look-ahead: the draw is the arithmetic of the shared flow in this step,
// not the governor. It sees this step's arrival because the flow divides what
// actually arrives; nothing it computes reaches the governor except through a
// level in a later step.
import * as Q from "./rational.js";
import { attempt, mergeRefusals, ok, refuse, refused } from "./refusal.js";
import { policyBrokeLimit } from "./unspecified.js";
/** The version of PROP-TOP-01's evaluation, recorded in each unknown-top record. */
export const UNKNOWN_TOP_VERSION = '0.1.0';
/** Check a policy's result. Returns the unused amount, or the refusal for a broken limit. */
export function checkDraw(policy, input, result) {
    const fail = (detail) => ({ refusal: policyBrokeLimit(policy.proposalId, input.resource, detail) });
    const r = input.resource;
    const wantParts = input.parts.map((p) => p.part).join('\u0000');
    if (wantParts !== result.received.map((x) => x.part).join('\u0000'))
        return fail('received must list exactly the drawing parts, in id order');
    if (input.stores.map((s) => s.store).join('\u0000') !== result.filled.map((x) => x.store).join('\u0000'))
        return fail('filled must list exactly the stores, in id order');
    let taken = Q.ZERO;
    for (let i = 0; i < input.parts.length; i++) {
        const p = input.parts[i];
        const amount = result.received[i].amount;
        if (amount.resource !== r)
            return fail(`part '${p.part}' received '${amount.resource}', not '${r}'`);
        if (Q.isNegative(amount.value))
            return fail(`part '${p.part}' received a negative amount`);
        if (Q.gt(amount.value, p.access.value))
            return fail(`part '${p.part}' received ${Q.toCanonical(amount.value)}, above its access ${Q.toCanonical(p.access.value)} (C2.5n)`);
        if (p.routeCapacity && Q.gt(amount.value, p.routeCapacity.value)) {
            return fail(`part '${p.part}' received ${Q.toCanonical(amount.value)}, above its route capacity ${Q.toCanonical(p.routeCapacity.value)} (C2.5n)`);
        }
        taken = Q.add(taken, amount.value);
    }
    for (let i = 0; i < input.stores.length; i++) {
        const s = input.stores[i];
        const amount = result.filled[i].amount;
        if (amount.resource !== r)
            return fail(`store '${s.store}' filled with '${amount.resource}', not '${r}'`);
        if (Q.isNegative(amount.value))
            return fail(`store '${s.store}' filled by a negative amount`);
        if (Q.gt(amount.value, s.fillRoom.value))
            return fail(`store '${s.store}' filled above its room this step (C2.6)`);
        taken = Q.add(taken, amount.value);
    }
    const unused = Q.sub(input.entering.value, taken);
    if (Q.isNegative(unused))
        return fail(`parts and stores took ${Q.toCanonical(taken)}, more than entered (${Q.toCanonical(input.entering.value)}) (C1.1)`);
    const committed = input.parts.map((p) => (p.routeCapacity ? Q.min(p.access.value, p.routeCapacity.value) : p.access.value));
    if (Q.le(Q.sum(committed), input.entering.value)) {
        for (let i = 0; i < input.parts.length; i++) {
            const got = result.received[i].amount.value;
            if (!Q.eq(got, committed[i])) {
                return fail(`enough entered for every committed draw, but part '${input.parts[i].part}' received ${Q.toCanonical(got)}, not its committed draw ${Q.toCanonical(committed[i])} (decision Q-002: a part draws up to its access)`);
            }
        }
    }
    return { unused };
}
function sameDraw(a, b) {
    const same = (x, y, id) => x.length === y.length && x.every((e, i) => {
        const o = y[i];
        return o !== undefined && id(o) === id(e) && Q.eq(o.amount.value, e.amount.value);
    });
    return same(a.result.received, b.result.received, (e) => e.part) && same(a.result.filled, b.result.filled, (e) => e.store) && Q.eq(a.unused, b.unused);
}
/**
 * PROP-TOP-01 (an engine proposal, not a CANON rule; decision Q3, 2026-10-22):
 * one resource's draw while the top is an information gap. `input` is the
 * draw as the core gives it, with no part marked as the top. The candidate
 * tops are each claiming part, by id, then a top elsewhere in the boundary
 * (no claiming part marked): one case among the others, never a default. A
 * policy that declares 'evaluate-admissible-tops' is called once for each,
 * with only `isTop` varying, and each result is checked as any draw is. The
 * draw is stated only where every candidate gives a valid result and all are
 * the same: every receipt, every fill and the unused amount. Otherwise it is
 * refused for the top (`topGap`), with whatever the policy refused; or, where
 * the policy refused alike under every candidate, with those refusals alone,
 * since they do not depend on the top. An undeclared policy is not called.
 */
export function drawUnknownTop(policy, input, topGap) {
    const committed = input.parts.map((p) => (p.routeCapacity ? Q.min(p.access.value, p.routeCapacity.value) : p.access.value));
    const committedDrawsFit = Q.le(Q.sum(committed), input.entering.value);
    const record = (o) => ({
        proposal: 'PROP-TOP-01', version: UNKNOWN_TOP_VERSION, top: 'unknown', policy: policy.proposalId, committedDrawsFit, ...o,
    });
    if (policy.unknownTop !== 'evaluate-admissible-tops') {
        return { drawn: refused([topGap]), record: record({ candidates: [], identical: null, result: 'refused', reason: 'policy-not-declared' }) };
    }
    const tops = [...input.parts.map((p) => p.part), null];
    const outcomes = tops.map((top) => {
        const variant = { ...input, parts: input.parts.map((p) => ({ ...p, isTop: p.part === top })) };
        return attempt(() => {
            const result = policy.draw(variant);
            const checked = checkDraw(policy, variant, result);
            if ('refusal' in checked)
                refuse(checked.refusal);
            return { result, unused: checked.unused };
        });
    });
    const candidates = tops.map((top, i) => ({ top, result: outcomes[i]?.ok ? 'valid' : 'refused' }));
    const valid = [];
    const refusals = [];
    for (const o of outcomes) {
        if (o.ok)
            valid.push(o.v);
        else
            refusals.push(o.refusals);
    }
    const first = valid[0];
    const identical = first === undefined ? null : valid.every((x) => sameDraw(x, first));
    if (refusals.length === 0) {
        if (identical === true && first !== undefined)
            return { drawn: ok(first), record: record({ candidates, identical, result: 'computed', reason: null }) };
        return { drawn: refused([topGap]), record: record({ candidates, identical, result: 'refused', reason: 'results-differ' }) };
    }
    const ids = (rs) => rs.map((r) => r.id).join('\u0000');
    const alike = refusals[0] ?? [];
    if (valid.length === 0 && refusals.every((rs) => ids(rs) === ids(alike))) {
        return { drawn: refused(alike), record: record({ candidates, identical, result: 'refused', reason: 'refused-alike' }) };
    }
    return { drawn: refused(mergeRefusals([topGap], ...refusals)), record: record({ candidates, identical, result: 'refused', reason: 'candidate-refused' }) };
}
