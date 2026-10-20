// Schema 0.4.0: the parsed, typed form of a model and a scenario.
// Component and field names use CANON's terms (row IDs from docs/rule-register.md).
// Fields marked DRAFT have a meaning CANON does not fix; they are logged in
// docs/open-questions.md and may change without a schema version bump until fixed.
export function isGap(x) {
    return typeof x === 'object' && x !== null && x.gap === true;
}
