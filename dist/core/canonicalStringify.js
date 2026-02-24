"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalStringify = canonicalStringify;
function canonicalStringify(value) {
    return JSON.stringify(sortRecursively(value));
}
function sortRecursively(value) {
    if (Array.isArray(value)) {
        return value.map(sortRecursively);
    }
    if (value !== null && typeof value === "object") {
        const sortedKeys = Object.keys(value).sort();
        const result = {};
        for (const key of sortedKeys) {
            result[key] = sortRecursively(value[key]);
        }
        return result;
    }
    return value;
}
