// P-WORK-01 and P-DEP-01: the work trace. It is separate from the base run's
// trace and bound to it by that trace's hash, the model and attachment digests
// and the proposal versions. Every value is in its work's own unit, never a
// resource unit, except `available`, copied from the base trace. A refused
// value lists the ids of its refusals, described once in `refusals`; ids the
// work extension creates start `work/`, and ids carried from the base trace
// are kept (decision 9). Arrays are sorted by id.
import { canonicalJson } from "../../core/canonical-json.js";
import { sha256OfString } from "../../core/sha256.js";
export const WORK_VERSION = '0.1.0';
/** SHA-256 of the canonical work trace. */
export function workTraceHash(trace) {
    return sha256OfString(canonicalJson(trace));
}
