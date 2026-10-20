// P-COUPLE-01: the coupling trace. A coupled run's base trace is always
// delivered with it, and it is bound to the base, work and backlog traces by
// their hashes; the base stamp names P-COUPLE-01, and nothing in the base,
// work or backlog trace names the coupling trace, so no fingerprint is
// circular (CF-D04). It records, per step and binding, the generated load
// G_t = D_t, tagged computed: a value computed under a mapped assertion, never
// sensed (F.5). Its stamp carries each binding's claim, evidence grade and
// conditions (CF-D03), the static guard (CF-D07), the preflight impact
// (CF-D06), and the digest of the effective scenario a replay reads, labelled
// derived (CF-D05). Its refusal paths say where each refusal behind a refused
// generated load appears in the four traces (CF-D06). Arrays are sorted by id.
import { canonicalJson } from "../../core/canonical-json.js";
import { sha256OfString } from "../../core/sha256.js";
export const COUPLE_VERSION = '0.1.0';
/** SHA-256 of the canonical coupling trace. */
export function couplingTraceHash(trace) {
    return sha256OfString(canonicalJson(trace));
}
