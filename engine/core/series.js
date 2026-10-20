// A scenario series read at a step: the latest entry at or before the step
// holds until the next. No entry yet, or an entry that is a gap, is refused.
// Shared by the core run and the work extension (decision 11, 2026-10-20).
import { ok, unknownV } from "./refusal.js";
import { isGap } from "./schema/types.js";
export function seriesAt(entries, t, path) {
    let found;
    for (const e of entries)
        if (e.step <= t)
            found = e;
    if (!found)
        return unknownV(path, `no value at step ${t}`);
    const v = found.value;
    return isGap(v) ? unknownV(`${path}[step ${found.step}]`, v.note) : ok(v);
}
