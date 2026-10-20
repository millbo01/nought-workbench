// Engine metadata. The canon fingerprint must match spec/fingerprint.json and the
// bytes of the spec files; tests/fingerprint.test.ts checks all three agree.
export const ENGINE_VERSION = '0.4.0';
export const SCHEMA_VERSION = '0.4.0';
export const CANON_FINGERPRINT = {
    canon: {
        file: 'spec/CANON.md',
        sha256: 'dd3a6ccaa20db6760364320617447824794134190249d1e974ea126fde351266',
    },
    application: {
        file: 'spec/APPLICATION.md',
        sha256: 'e6673fbe240170bd660a9c95bddfedc5e8842170d6c54dc852ff4ff942df0f1d',
    },
};
export function engineMeta() {
    return {
        engineVersion: ENGINE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        canonFingerprint: {
            canon: CANON_FINGERPRINT.canon.sha256,
            application: CANON_FINGERPRINT.application.sha256,
        },
    };
}
