// C4.3a: rank runs from the top down by dependency. Layer 0 is the top; layer k
// holds the parts whose work feeds a part in layer k-1 and no part nearer the top.
// A part with no dependency path to the top sits in the bottom layer: the
// deepest layer reached from the top, and at least layer 1 (decision Q-017).
// Position within a layer has no CANON rule (C4.3b, Q-006); the position
// documented at mapping is used (PROP-RANK-01).
import { isGap } from "./schema/types.js";
function byId(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
export function deriveLayers(model) {
    const separate = model.parts.filter((p) => p.setsOwnAccess).map((p) => p.id).sort(byId);
    const ranked = new Set(model.parts.filter((p) => !p.setsOwnAccess).map((p) => p.id));
    const layer = new Map();
    const top = model.boundary.top;
    if (!isGap(top) && ranked.has(top)) {
        layer.set(top, 0);
        // Breadth-first from the top over "part feeds X" edges, in id order.
        const feedersOf = new Map();
        for (const d of model.dependencies) {
            if (!ranked.has(d.part) || !ranked.has(d.feeds))
                continue;
            const list = feedersOf.get(d.feeds) ?? [];
            list.push(d.part);
            feedersOf.set(d.feeds, list);
        }
        let frontier = [top];
        let k = 0;
        while (frontier.length > 0) {
            k += 1;
            const next = new Set();
            for (const fed of frontier.slice().sort(byId)) {
                for (const feeder of (feedersOf.get(fed) ?? []).slice().sort(byId)) {
                    if (!layer.has(feeder)) {
                        layer.set(feeder, k);
                        next.add(feeder);
                    }
                }
            }
            frontier = [...next];
        }
    }
    const unreached = [...ranked].filter((id) => !layer.has(id)).sort(byId);
    const bottom = Math.max(1, ...layer.values());
    if (!isGap(top) && ranked.has(top))
        for (const id of unreached)
            layer.set(id, bottom);
    return { layer, bottom, unreached, separate };
}
