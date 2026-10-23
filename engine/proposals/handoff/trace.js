// P-HANDOFF-01: the handover trace. It is always delivered with the base,
// work and backlog traces (and the coupling trace, in a coupled run) of the
// pass it explains, and bound to them by their hashes. It says, per step and
// handover, what the upstream account completed, what was handed over, what
// the downstream account admitted, and what is in transit at the close. The
// downstream admissions are generated from upstream completions, never
// independent inputs: the backlog attachment the delivered traces read is
// derived from the mapped one, and its digest is labelled derived here, as is
// the derived coupling attachment that names it. Arrays are sorted by id.
import { canonicalJson } from "../../core/canonical-json.js";
import { sha256OfString } from "../../core/sha256.js";
export const HANDOFF_VERSION = '0.1.0';
/** SHA-256 of the canonical handover trace. */
export function handoffTraceHash(trace) {
    return sha256OfString(canonicalJson(trace));
}
