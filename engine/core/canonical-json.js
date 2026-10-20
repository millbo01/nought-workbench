// Canonical JSON: object keys sorted by UTF-16 code unit, no whitespace,
// undefined members omitted. Every exact value the core writes into a trace is
// a string; numbers in input documents are written in their ECMAScript string
// form, which is exactly specified. Arrays keep their order; the core sorts by
// id before it writes them. JSON.stringify's string escaping is exactly
// specified, so the output is byte-identical on every conforming runtime.
export function canonicalJson(value) {
    return write(value, '$');
}
function compareKeys(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function write(value, path) {
    if (value === null)
        return 'null';
    switch (typeof value) {
        case 'boolean':
            return value ? 'true' : 'false';
        case 'string':
            return JSON.stringify(value);
        case 'number':
            if (!Number.isFinite(value)) {
                throw new TypeError(`canonicalJson: ${path} is ${value}, which has no JSON form`);
            }
            return Object.is(value, -0) ? '0' : String(value);
        case 'object': {
            if (Array.isArray(value)) {
                return `[${value.map((v, i) => write(v, `${path}[${i}]`)).join(',')}]`;
            }
            const entries = Object.keys(value)
                .filter((k) => value[k] !== undefined)
                .sort(compareKeys)
                .map((k) => `${JSON.stringify(k)}:${write(value[k], `${path}.${k}`)}`);
            return `{${entries.join(',')}}`;
        }
        default:
            throw new TypeError(`canonicalJson: ${path} has type ${typeof value}, which has no canonical form`);
    }
}
