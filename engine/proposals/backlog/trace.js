// P-LOAD-02, tracking only: the backlog trace. It is separate from the base and
// work traces and bound to both by their hashes, and to the model, work
// attachment and backlog attachment by their digests. Every quantity is in the
// account's obligation unit, which is its work's unit. A value is modelled from
// declared inputs and modelled work, never an observed count. A refused value
// lists the ids of its refusals, described once in `refusals`; ids the ledger
// creates start `backlog/`, and ids carried from the work trace are kept.
// Arrays are sorted by id.
import { canonicalJson } from "../../core/canonical-json.js";
import { sha256OfString } from "../../core/sha256.js";
export const BACKLOG_VERSION = '0.1.0';
/** SHA-256 of the canonical backlog trace. */
export function backlogTraceHash(trace) {
    return sha256OfString(canonicalJson(trace));
}
