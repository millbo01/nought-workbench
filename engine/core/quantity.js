// A quantity always carries its resource. Arithmetic across resources is a type
// error where the resources are known at compile time (NoInfer stops TypeScript
// widening R to a union) and a ResourceMismatchError at run time.
// No universal currency: nothing here converts one resource into another.
import { ResourceMismatchError } from "./errors.js";
import * as Q from "./rational.js";
export function quantity(resource, value) {
    return { resource, value };
}
export function zeroOf(resource) {
    return { resource, value: Q.ZERO };
}
function same(op, a, b) {
    if (a.resource !== b.resource)
        throw new ResourceMismatchError(op, a.resource, b.resource);
}
export function qAdd(a, b) {
    same('addition', a, b);
    return { resource: a.resource, value: Q.add(a.value, b.value) };
}
export function qSub(a, b) {
    same('subtraction', a, b);
    return { resource: a.resource, value: Q.sub(a.value, b.value) };
}
export function qMin(a, b) {
    same('comparison', a, b);
    return Q.le(a.value, b.value) ? a : b;
}
export function qMax(a, b) {
    same('comparison', a, b);
    return Q.ge(a.value, b.value) ? a : b;
}
export function qCmp(a, b) {
    same('comparison', a, b);
    return Q.cmp(a.value, b.value);
}
export function qLe(a, b) {
    return qCmp(a, b) <= 0;
}
/** The share a/b of two quantities of one resource: a pure number. */
export function qRatio(a, b) {
    same('division', a, b);
    return Q.div(a.value, b.value);
}
/** Scale a quantity by a pure number. */
export function qScale(a, factor) {
    return { resource: a.resource, value: Q.mul(a.value, factor) };
}
export function qPositivePart(a) {
    return { resource: a.resource, value: Q.positivePart(a.value) };
}
export function qSum(resource, items) {
    let s = zeroOf(resource);
    for (const x of items)
        s = qAdd(s, x);
    return s;
}
export function qIsZero(a) {
    return Q.isZero(a.value);
}
export function qIsNegative(a) {
    return Q.isNegative(a.value);
}
