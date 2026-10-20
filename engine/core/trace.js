// The result trace. A run is a sequence of steps grouped into snapshots: a new
// snapshot starts at a mode change (the order or the held levels change) or at
// an arrangement revision (another fixed setting changes). A setting acting on
// a changed sensed level starts neither. Every value is tagged input, computed
// or sensed; a refused value lists the ids of its refusals, described once in
// `refusals`. Arrays are sorted by id.
import { canonicalJson } from "./canonical-json.js";
import { sha256OfString } from "./sha256.js";
export function canonicalTrace(trace) {
    return canonicalJson(trace);
}
/** SHA-256 of the canonical trace: the determinism fingerprint of a run. */
export function traceHash(trace) {
    return sha256OfString(canonicalJson(trace));
}
