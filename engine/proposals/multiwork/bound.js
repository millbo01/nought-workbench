// P-MULTIWORK-01: what can be established about the work owed to an arranged
// part without knowing how its balance is shared. Each step no more than the
// balance can be used, so the shared resource needed for the obligations owed
// at the end of a step is at least what was owed at its start, plus what the
// step admitted, less the balance; and never below 0. In exact rationals:
//   opening_0   = sum over the counted accounts of B_0 x recipe / yield (exact)
//   admitted_t  = sum of N_t x recipe / yield
//   closing_t  >= max(0, opening_t + admitted_t - balance_t) = opening_t+1
// The bound holds only where every input is established:
//   - every counted account's claims are known (eligibility, closure, zero withdrawals, opening, admissions);
//   - every counted work's recipe for the shared resource and its yield are known, with the yield above 0;
//   - the step's admissions and balance are known. Admissions handed over from a work whose output is refused are
//     not known, so the bound stops there; once refused it stays refused, with no restart.
// Works without an account still draw on the balance, which keeps the bound
// valid. Each obligation is counted in the one account that holds it, so
// nothing handed from one counted account to another is counted twice. Where
// every closing balance is known, what is owed is reported beside the bound,
// and a value below the bound is a defect (AccountingError).
import { AccountingError } from "../../core/errors.js";
import * as Q from "../../core/rational.js";
import { isGap } from "../../core/schema/types.js";
import { backlogTraceHash } from "../backlog/trace.js";
import { workTraceHash } from "../work/trace.js";
import { MULTIWORK_PROPOSAL } from "./attachment.js";
import { MULTIWORK_VERSION } from "./trace.js";
const fromTV = (x) => (x === undefined ? { ok: false, ids: [] } : 'refused' in x ? { ok: false, ids: x.refused } : { ok: true, v: Q.parseRational(x.v) });
const idsOf = (...xs) => [...new Set(xs.flatMap((x) => (x.ok ? [] : x.ids)))].sort();
export function outstandingBounds(work, multiwork, workTrace, backlogTrace) {
    const own = new Map();
    const known = new Map([...workTrace.refusals, ...backlogTrace.refusals].map((r) => [r.id, r]));
    const used = new Map();
    const tv = (x, t) => {
        if (x.ok)
            return { t: 'computed', v: Q.toCanonical(x.v) };
        for (const id of x.ids) {
            const u = used.get(id);
            if (u) {
                u.last = Math.max(u.last, t);
                u.values += 1;
            }
            else
                used.set(id, { first: t, last: t, values: 1 });
        }
        return { t: 'computed', refused: [...x.ids] };
    };
    const ownRefusal = (id, message) => {
        if (!own.has(id))
            own.set(id, { category: 'unknown-prerequisite', message, first: 0, last: 0, values: 0 });
        return { ok: false, ids: [id] };
    };
    const conditions = [];
    const counted = multiwork.attachment.parts.map((pa) => {
        const accounts = backlogTrace.stamp.accounts.filter((a) => a.part === pa.part && pa.works.some((w) => w.work === a.work)).sort((a, b) => (a.account < b.account ? -1 : 1));
        const notes = [];
        const rate = new Map();
        for (const a of accounts) {
            for (const c of a.claims)
                if (c.status === 'unknown')
                    notes.push(`account '${a.account}': the claim '${c.claim}' is unknown`);
            const w = work.works.find((x) => x.part === pa.part && x.work === a.work);
            const per = w?.recipe.find((e) => e.resource === pa.resource)?.perWorkUnit;
            if (!w || per === undefined) {
                notes.push(`work '${a.work}' does not use '${pa.resource}'`);
                continue;
            }
            if (isGap(w.yield))
                notes.push(`work '${a.work}': its yield is not known`);
            else if (Q.isZero(w.yield))
                notes.push(`work '${a.work}': its yield is 0, so its obligations never clear`);
            else
                rate.set(a.account, Q.div(per, w.yield));
        }
        if (accounts.length === 0)
            notes.push('no account holds the obligations of these works');
        const holds = notes.length === 0;
        conditions.push({ part: pa.part, resource: pa.resource, accounts: accounts.map((a) => a.account), holds, notes });
        const gate = holds ? null
            : ownRefusal(`multiwork/unknown-prerequisite outstanding bound ${pa.part}`, `part '${pa.part}': the bound on what is owed is not established: ${notes.join('; ')}`);
        return { pa, accounts: accounts.map((a) => a.account), rate, gate };
    });
    const steps = backlogTrace.steps.map((s) => ({ step: s.step, outstanding: [] }));
    for (const c of counted) {
        if (c.accounts.length === 0)
            continue;
        let opening = null;
        backlogTrace.steps.forEach((s, t) => {
            const records = c.accounts.map((id) => s.accounts.find((a) => a.account === id));
            const inHours = (field) => {
                if (c.gate)
                    return c.gate;
                const xs = records.map((r) => fromTV(r?.[field]));
                if (!xs.every((x) => x.ok))
                    return { ok: false, ids: idsOf(...xs) };
                return { ok: true, v: Q.sum(xs.map((x, i) => Q.mul(x.v, c.rate.get(c.accounts[i])))) };
            };
            const start = opening ?? inHours('openingBalance');
            const admitted = inHours('admissions');
            const balance = c.gate ?? fromTV(workTrace.steps[t]?.allocations?.find((a) => a.part === c.pa.part)?.balance);
            const closingAtLeast = start.ok && admitted.ok && balance.ok ? { ok: true, v: Q.positivePart(Q.sub(Q.add(start.v, admitted.v), balance.v)) } : { ok: false, ids: idsOf(start, admitted, balance) };
            const closing = c.gate ? null : inHours('closingBalance');
            if (closing?.ok && closingAtLeast.ok && Q.lt(closing.v, closingAtLeast.v)) {
                throw new AccountingError(`P-MULTIWORK-01: what is owed to part '${c.pa.part}' at step ${t} is below its established lower bound`);
            }
            steps[t].outstanding.push({
                part: c.pa.part, resource: c.pa.resource, accounts: c.accounts,
                openingAtLeast: tv(start, t), admitted: tv(admitted, t), balance: tv(balance, t), closingAtLeast: tv(closingAtLeast, t),
                closing: closing === null || !closing.ok ? null : tv(closing, t),
            });
            opening = closingAtLeast;
        });
    }
    for (const [id, o] of own)
        used.set(id, used.get(id) ?? { first: o.first, last: o.last, values: o.values });
    const refusals = [...used.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, u]) => {
        const k = known.get(id);
        const o = own.get(id);
        return k ? { ...k, firstStep: u.first, lastStep: u.last, values: u.values }
            : { id, category: o?.category ?? 'unknown-prerequisite', message: o?.message ?? id, proposal: MULTIWORK_PROPOSAL.id, firstStep: u.first, lastStep: u.last, values: u.values };
    });
    return {
        stamp: {
            multiworkVersion: MULTIWORK_VERSION,
            proposal: { id: MULTIWORK_PROPOSAL.id, version: MULTIWORK_PROPOSAL.version },
            attachment: { id: multiwork.attachment.id, version: multiwork.attachment.attachmentVersion, sha256: multiwork.sha256 },
            work: { traceSha256: workTraceHash(workTrace) },
            backlog: { traceSha256: backlogTraceHash(backlogTrace) },
        },
        conditions,
        steps,
        refusals,
    };
}
