// Exact rational numbers on BigInt. Every quantity in the core is exact, so the
// accounting identities hold exactly (never to a tolerance) and no rounding rule
// is ever needed. A rounding rule would fix which part gets a leftover unit,
// which is an allocation rule CANON does not give.
function absBig(x) {
    return x < 0n ? -x : x;
}
function gcd(a, b) {
    let x = absBig(a);
    let y = absBig(b);
    while (y !== 0n) {
        const r = x % y;
        x = y;
        y = r;
    }
    return x;
}
export function rational(n, d = 1n) {
    if (d === 0n)
        throw new RangeError('rational: denominator is zero');
    let nn = n;
    let dd = d;
    if (dd < 0n) {
        nn = -nn;
        dd = -dd;
    }
    const g = gcd(nn, dd);
    return g === 1n ? { n: nn, d: dd } : { n: nn / g, d: dd / g };
}
export const ZERO = { n: 0n, d: 1n };
export const ONE = { n: 1n, d: 1n };
export function fromInteger(i) {
    if (!Number.isSafeInteger(i))
        throw new RangeError(`rational: ${i} is not a safe integer`);
    return { n: BigInt(i), d: 1n };
}
const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
const FRACTION = /^([+-]?\d+)\/(\d+)$/;
/**
 * Parse a decimal string ("12.5", "-3", "1e-3"), a fraction ("3/4") or a finite
 * number. A number is read through its ECMAScript string form, which is exactly
 * specified, so 0.1 means one tenth on every runtime.
 */
export function parseRational(input) {
    if (typeof input === 'number') {
        if (!Number.isFinite(input))
            throw new RangeError(`rational: ${input} is not finite`);
        return parseRational(String(input));
    }
    const s = input.trim();
    const f = FRACTION.exec(s);
    if (f)
        return rational(BigInt(f[1]), BigInt(f[2]));
    const m = DECIMAL.exec(s);
    if (!m)
        throw new RangeError(`rational: cannot read '${input}' as a number`);
    const sign = m[1] === '-' ? -1n : 1n;
    const intPart = m[2];
    const fracPart = m[3] ?? '';
    const exp = m[4] === undefined ? 0 : Number(m[4]);
    if (!Number.isSafeInteger(exp) || Math.abs(exp) > 10000) {
        throw new RangeError(`rational: exponent out of range in '${input}'`);
    }
    let n = BigInt(intPart + fracPart) * sign;
    let d = 10n ** BigInt(fracPart.length);
    if (exp > 0)
        n *= 10n ** BigInt(exp);
    if (exp < 0)
        d *= 10n ** BigInt(-exp);
    return rational(n, d);
}
export function add(a, b) {
    return a.d === b.d ? rational(a.n + b.n, a.d) : rational(a.n * b.d + b.n * a.d, a.d * b.d);
}
export function sub(a, b) {
    return a.d === b.d ? rational(a.n - b.n, a.d) : rational(a.n * b.d - b.n * a.d, a.d * b.d);
}
export function mul(a, b) {
    return rational(a.n * b.n, a.d * b.d);
}
export function div(a, b) {
    if (b.n === 0n)
        throw new RangeError('rational: division by zero');
    return rational(a.n * b.d, a.d * b.n);
}
export function neg(a) {
    return { n: -a.n, d: a.d };
}
export function cmp(a, b) {
    const l = a.n * b.d;
    const r = b.n * a.d;
    return l < r ? -1 : l > r ? 1 : 0;
}
export function eq(a, b) {
    return a.n === b.n && a.d === b.d;
}
export function lt(a, b) {
    return cmp(a, b) < 0;
}
export function le(a, b) {
    return cmp(a, b) <= 0;
}
export function gt(a, b) {
    return cmp(a, b) > 0;
}
export function ge(a, b) {
    return cmp(a, b) >= 0;
}
export function min(a, b) {
    return le(a, b) ? a : b;
}
export function max(a, b) {
    return ge(a, b) ? a : b;
}
export function isZero(a) {
    return a.n === 0n;
}
export function isNegative(a) {
    return a.n < 0n;
}
export function isPositive(a) {
    return a.n > 0n;
}
export function isInteger(a) {
    return a.d === 1n;
}
/** The positive part: a where a > 0, else zero. */
export function positivePart(a) {
    return a.n > 0n ? a : ZERO;
}
export function sum(items) {
    let s = ZERO;
    for (const x of items)
        s = add(s, x);
    return s;
}
/** Canonical string: "n" for integers, "n/d" otherwise, always in lowest terms. */
export function toCanonical(a) {
    return a.d === 1n ? a.n.toString() : `${a.n.toString()}/${a.d.toString()}`;
}
/** Decimal string for display only, rounded half away from zero to `places` digits. */
export function toDecimal(a, places) {
    if (!Number.isSafeInteger(places) || places < 0)
        throw new RangeError('rational: bad places');
    const scale = 10n ** BigInt(places);
    const negative = a.n < 0n;
    const absN = absBig(a.n);
    let q = (absN * scale) / a.d;
    const rem = (absN * scale) % a.d;
    if (rem * 2n >= a.d)
        q += 1n;
    const digits = q.toString().padStart(places + 1, '0');
    const whole = places === 0 ? digits : digits.slice(0, digits.length - places);
    const frac = places === 0 ? '' : `.${digits.slice(digits.length - places)}`;
    const out = `${whole}${frac}`;
    return negative && q !== 0n ? `-${out}` : out;
}
