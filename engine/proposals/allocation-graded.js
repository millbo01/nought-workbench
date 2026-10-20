// P-ALLOC-01: the graded overcommitment rule (the Unified Core Spec's id; it
// was PROP-DRAW-01 in engine 0.1.0). A proposal, not a CANON rule, and never a
// default: a run uses it only when it is passed in, and every result produced
// with it lists P-ALLOC-01 in its stamp. See docs/proposals.md.
//
// James's working position (2026-10-20): when committed access exceeds what
// arrives, lower-ranked parts lose more, and the grading comes from the
// settings (access rules), not from a strict queue. Formalised here as:
//   (a) a part's committed draw is its access, capped by its route;
//   (b) where the committed draws fit within what entered, each part receives
//       its committed draw, even beyond its requirement (Q-002); stores fill
//       from what is left, in proportion to their room;
//   (c) where they do not fit, the excess is taken from the parts other than
//       the top in proportion to committed draw times the grading declared
//       with each part's setting (proposalData["P-ALLOC-01"].grading), with
//       no part taken below zero; the top is lowered only once every other
//       part's draw is at zero (C4.2: "limiting everyone else's access first").
import { quantity } from "../core/quantity.js";
import * as Q from "../core/rational.js";
import { deriveLayers } from "../core/rank.js";
import { attempt, refuse, unknownPrerequisite } from "../core/refusal.js";
import { isGap } from "../core/schema/types.js";
export const P_ALLOC_01 = 'P-ALLOC-01';
function gradingOf(data, setting) {
    const entry = data?.[P_ALLOC_01];
    const g = typeof entry === 'object' && entry !== null ? entry['grading'] : undefined;
    if (typeof g !== 'string' && typeof g !== 'number') {
        refuse(unknownPrerequisite(`$.settings.${setting}.proposalData.${P_ALLOC_01}.grading`, 'P-ALLOC-01 needs a grading on every setting of a part other than the top'));
    }
    const r = Q.parseRational(g);
    if (!Q.isPositive(r)) {
        refuse(unknownPrerequisite(`$.settings.${setting}.proposalData.${P_ALLOC_01}.grading`, 'P-ALLOC-01 gradings are positive'));
    }
    return r;
}
function draw(input) {
    const res = input.resource;
    const committed = input.parts.map((p) => (p.routeCapacity ? Q.min(p.access.value, p.routeCapacity.value) : p.access.value));
    const total = Q.sum(committed);
    const available = input.entering.value;
    const cut = committed.map(() => Q.ZERO);
    if (Q.le(total, available)) {
        const left = Q.sub(available, total);
        const room = input.stores.map((s) => s.fillRoom.value);
        const roomTotal = Q.sum(room);
        const filled = room.map((x) => (Q.le(roomTotal, left) || Q.isZero(roomTotal) ? x : Q.div(Q.mul(left, x), roomTotal)));
        return {
            received: input.parts.map((p, i) => ({ part: p.part, amount: quantity(res, committed[i]) })),
            filled: input.stores.map((s, i) => ({ store: s.store, amount: quantity(res, filled[i]) })),
        };
    }
    let remaining = Q.sub(total, available);
    const weight = input.parts.map((p, i) => (p.isTop || Q.isZero(committed[i]) ? Q.ZERO : Q.mul(committed[i], gradingOf(p.settingData, p.setting))));
    let free = input.parts.map((_, i) => i).filter((i) => Q.isPositive(weight[i]));
    while (Q.isPositive(remaining) && free.length > 0) {
        const w = Q.sum(free.map((i) => weight[i]));
        const proposed = new Map(free.map((i) => [i, Q.div(Q.mul(remaining, weight[i]), w)]));
        const capped = free.filter((i) => Q.ge(proposed.get(i), committed[i]));
        if (capped.length === 0) {
            for (const i of free)
                cut[i] = proposed.get(i);
            remaining = Q.ZERO;
        }
        else {
            for (const i of capped) {
                cut[i] = committed[i];
                remaining = Q.sub(remaining, committed[i]);
            }
            free = free.filter((i) => !capped.includes(i));
        }
    }
    if (Q.isPositive(remaining)) {
        const t = input.parts.findIndex((p) => p.isTop);
        if (t >= 0)
            cut[t] = Q.min(remaining, committed[t]);
    }
    return {
        received: input.parts.map((p, i) => ({ part: p.part, amount: quantity(res, Q.sub(committed[i], cut[i])) })),
        filled: input.stores.map((s) => ({ store: s.store, amount: quantity(res, Q.ZERO) })),
    };
}
/** P-ALLOC-01 as an allocation policy. Pass it explicitly; the core never uses it by default. */
export const gradedAllocation = {
    proposalId: P_ALLOC_01,
    readsRequirement: false,
    readsRank: false,
    draw,
};
/**
 * Proposal checks for P-ALLOC-01's data (flags, never errors): every setting of
 * a part other than the top carries a positive grading, and within each mode and
 * resource a lower-ranked part's grading is no smaller than a higher-ranked one's
 * ("lower-ranked parts lose more").
 */
export function checkGradedAllocationData(model) {
    const issues = [];
    const top = isGap(model.boundary.top) ? null : model.boundary.top;
    const layers = deriveLayers(model).layer;
    const settingById = new Map(model.settings.map((s) => [s.id, s]));
    for (const s of model.settings) {
        if (s.part === top)
            continue;
        const g = attempt(() => gradingOf(s.proposalData, s.id));
        if (!g.ok)
            issues.push({ severity: 'flag', code: 'grading', path: `$.settings.${s.id}`, message: g.refusals.map((x) => x.message).join('; '), proposal: P_ALLOC_01 });
    }
    for (const m of model.modes) {
        const rows = m.settings.map((id) => settingById.get(id)).filter((s) => s !== undefined && s.part !== top).map((s) => {
            const part = model.parts.find((p) => p.id === s.part);
            const override = m.order?.find((o) => o.part === s.part)?.position;
            const pos = override ?? (part && !isGap(part.rank) && !isGap(part.rank.position) ? part.rank.position : undefined);
            const graded = attempt(() => gradingOf(s.proposalData, s.id));
            const g = graded.ok ? graded.v : undefined;
            return { s, layer: layers.get(s.part), pos, g };
        });
        for (const a of rows) {
            for (const b of rows) {
                if (a.s.resource !== b.s.resource || a.g === undefined || b.g === undefined || a.layer === undefined || b.layer === undefined)
                    continue;
                const aLower = a.layer > b.layer || (a.layer === b.layer && a.pos !== undefined && b.pos !== undefined && a.pos > b.pos);
                if (aLower && Q.lt(a.g, b.g)) {
                    issues.push({
                        severity: 'flag', code: 'grading-order', path: `$.modes.${m.id}`,
                        message: `'${a.s.part}' ranks below '${b.s.part}' for '${a.s.resource}' but has a smaller grading, so it would lose less`,
                        proposal: P_ALLOC_01,
                    });
                }
            }
        }
    }
    return issues;
}
