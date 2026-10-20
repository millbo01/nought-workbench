// The catalogue of refusals for calculations CANON does not give a rule for,
// or that the mapping cannot support. Answered questions (docs/decisions.md)
// keep their ids here, as the log does. Each returns a typed Refusal naming the
// register row and the open question (docs/open-questions.md); none supplies a
// rule. Callers put the refusal inside the result.
export const OPEN_QUESTIONS = {
    'Q-001': 'The within-step draw: who takes what from the shared flow when committed access exceeds what arrives',
    'Q-002': 'Whether a part draws up to its access where that exceeds its requirement',
    'Q-003': 'How much a store releases in a step, and what fills it',
    'Q-004': 'What a producing part sends when it is short',
    'Q-005': 'When sensing happens within a step',
    'Q-006': 'Position within a layer from access and requirement; how a built-in part\'s place moves',
    'Q-007': 'What a dependency does: the effect of a feeding part\'s shortfall on the part it feeds',
    'Q-008': 'Whether the top\'s need (CANON 2) is its requirement (CANON 3)',
    'Q-009': 'Requirement rules that fall while an input rises',
    'Q-010': 'Routes from a store or an outside input to a part, beside the one shared flow',
    'Q-011': 'What a gate is: resource held back versus resource unused',
    'Q-012': 'How a built-in setting reads a level, including a silent one',
    'Q-013': 'What a threshold switch reads, and how it reads silence read as alarm',
    'Q-014': 'How a part that sets its own access is computed',
    'Q-015': 'How damage enters a part\'s physical state and how repair lowers it',
    'Q-016': 'Unit loss under shortfall and unit rebuilding',
    'Q-017': 'The rank of a part with no dependency path to the top',
    'Q-018': 'Whether moving a band within a mode is a mode change',
    'Q-019': 'Whether what is left after every part and store has drawn carries to the next step',
    'Q-020': 'In CANON 1, whether "another\'s" is another part\'s access or what it receives',
    'Q-021': 'Route capacity and store rules: kinds, and whether changing them changes the mode',
    'Q-022': 'How settings respond to silence read as alarm',
    'Q-023': 'Whether upkeep is part of requirement',
    'Q-024': 'Intake: CANON 3 names it among the governor\'s means; the engine takes inflow as scenario input',
    'Q-025': 'Whether a built-in setting that reads a level its own part produces is the part setting its own access',
    'Q-026': 'Whether a "level the governor holds" (indicator kind) means held in the current mode or in any mode',
    'Q-027': 'Mapped outflows or losses: whether and how resource leaving other than to parts is mapped',
    'Q-028': 'Arrangement revisions beside CANON 4\'s "access settings change only when the mode changes"',
    'Q-029': 'Silence read as no intervention: the governor does not act, formalised as the earlier value standing',
    'Q-030': 'Equivalents in the Unified Core Spec catalogue for the engine\'s own PROP- proposals',
    'Q-031': 'Whether P-ALLOC-01 dividing this step\'s arrival is the arithmetic of the flow, not governor look-ahead',
};
function r(category, subject, message, canon, question, proposal) {
    return { id: `${category} ${question ?? ''} ${subject}`.replace(/\s+/g, ' ').trim(), category, message, canon, question, proposal };
}
export function noDrawPolicy(resource) {
    return r('unspecified-allocation-policy', `no policy: ${resource}`, `no allocation policy was given for '${resource}'; the core has none, because who takes what from the shared flow is not given`, 'CANON 3 (C3.4b), CANON 4 (C4.2)', 'Q-001');
}
export function policyBrokeLimit(policy, resource, detail) {
    return r('unspecified-allocation-policy', `${policy} broke a limit: ${resource}`, `allocation policy ${policy} returned a result for '${resource}' that breaks a CANON limit: ${detail}`, 'CANON 1 (C1.1), CANON 2 (C2.5n, C2.6)', 'Q-001');
}
/** Decision Q-004: with no sending dial, the level is refused rather than guessed (PROP-SENSE-01). */
export function noSendingDial(level, part, why) {
    return {
        ...r('unknown-prerequisite', `sending dial of ${level}`, `level '${level}': ${why}, and the level has no sending dial (whenProducerShort) saying what '${part}' sends when short (decision Q-004)`, 'CANON 3 (C3.1b), CANON 7 (C7.1b)', 'Q-004', 'PROP-SENSE-01'),
        path: `$.levels.${level}.whenProducerShort`,
    };
}
export function placeAfterRequirementChange(part, resource) {
    return r('unsupported-rule', `place of ${part}`, `built-in part '${part}': its requirement for '${resource}' changed, which can move its place in the order; the rule that gives the new place is not given`, 'CANON 3 (C3.7), CANON 4 (C4.3b)', 'Q-006');
}
export function builtInReadingSilence(rule, level) {
    return r('unsupported-rule', `${rule} reading ${level}`, `built-in rule '${rule}' reads level '${level}', which is silent at the governor; how a built-in setting reads such a level is not given`, 'CANON 3 (C3.6b, C3.7), CANON 7 (C7.1b)', 'Q-012');
}
export function thresholdSwitchOnAlarmSilence(sw, level) {
    return r('unmapped-transition', `switch ${sw}`, `threshold switch '${sw}' reads level '${level}', which is silent and read as alarm; whether it has crossed is not mapped`, 'CANON 4 (C4.4n1)', 'Q-013');
}
export function conflictingSwitches(switches) {
    return r('unmapped-transition', `switches ${switches.join(',')}`, `threshold switches ${switches.join(', ')} cross in the same step towards different modes; the mapping does not say which applies`, 'CANON 4 (C4.4n1)', 'Q-013');
}
export function changeOnUnknownArrangement() {
    return r('invalid-settings-change', 'change on an unknown arrangement', 'an intervention changed settings or held levels while the arrangement in force was unknown, so the arrangement after it is unknown too; an intervention that sets a whole declared mode can apply', 'CANON 3 (C3.6a, C3.9)');
}
export function separateCase(part, what) {
    return r('unsupported-rule', `separate case ${part}: ${what}`, `part '${part}' sets its own access (${what}): a separate case, which is not computed`, 'CANON 3 (C3.5)', 'Q-014');
}
export function damageDynamics(part) {
    return r('unsupported-rule', `damage to ${part}`, `damage to part '${part}': how damage enters its physical state, how much it raises its requirement and how repair lowers it are not given (P-LOAD-01's damage dial is not defined)`, 'CANON 3 (C3.13c)', 'Q-015', 'P-LOAD-01');
}
export function unitsAfterDamage(part) {
    return r('unsupported-rule', `units of ${part} after damage`, `units of part '${part}' after damage are not given (P-LOAD-01's damage dial is not defined)`, 'CANON 3 (C3.13c)', 'Q-015', 'P-LOAD-01');
}
export function unitsAfterShortfall(part) {
    return r('unsupported-rule', `units of ${part} after shortfall`, `units of part '${part}' after a step in which it was short: unit loss under shortfall is given only by P-LOAD-01, which this run does not enable or this part has no dials for`, 'CANON 3 (C3.13d), CANON 7 (C7.3)', 'Q-016', 'P-LOAD-01');
}
export function unitRebuilding(part) {
    return r('unsupported-rule', `rebuilding ${part}`, `rebuilding units of part '${part}' from what is left once every part has drawn is given only by P-LOAD-01, which this run does not enable or this part has no dials for`, 'CANON 3 (C3.13d)', 'Q-016', 'P-LOAD-01');
}
export function scarcityPreconditionNotMet(resource, which) {
    return r('scarcity-precondition-not-met', `${resource}: ${which}`, `CANON 1's ledger for '${resource}' (the gap met from stores, from outside, or left unmet) is stated only at a fully used inflow with no part above its requirement; here ${which}`, 'CANON 1 (C1.2, C1.3, C1.5, C1.6)');
}
