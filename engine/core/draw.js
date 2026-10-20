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
import { policyBrokeLimit } from "./unspecified.js";
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
