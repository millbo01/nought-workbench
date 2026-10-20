// Exceptions are kept for two cases only:
//   - a model, scenario or run configuration that cannot be initialised safely
//     (ModelInvalidError, ConfigurationError);
//   - a failure of the engine's own invariants, which is a defect
//     (AccountingError; ResourceMismatchError from arithmetic across resources).
// A calculation the engine cannot make is never an exception: it is a typed
// refusal inside the result (refusal.ts).
/** Arithmetic or comparison across two resources (no universal currency). */
export class ResourceMismatchError extends Error {
    left;
    right;
    constructor(operation, left, right) {
        super(`${operation} across resources is not defined: '${left}' and '${right}'`);
        this.name = 'ResourceMismatchError';
        this.left = left;
        this.right = right;
    }
}
/** An internal accounting identity failed. Always a defect in the engine. */
export class AccountingError extends Error {
    constructor(detail) {
        super(`accounting identity failed: ${detail}`);
        this.name = 'AccountingError';
    }
}
/** A model or scenario failed validation, so it cannot be initialised. */
export class ModelInvalidError extends Error {
    issues;
    constructor(what, issues) {
        const errors = issues.filter((i) => i.severity === 'error');
        super(`${what} is not valid (${errors.length} error${errors.length === 1 ? '' : 's'}):\n` +
            errors.map((i) => `  ${i.path}: [${i.code}] ${i.message}`).join('\n'));
        this.name = 'ModelInvalidError';
        this.issues = issues;
    }
}
/** The run was configured with something that may not be enabled (for example a disabled proposal). */
export class ConfigurationError extends Error {
    constructor(detail) {
        super(`run configuration refused: ${detail}`);
        this.name = 'ConfigurationError';
    }
}
