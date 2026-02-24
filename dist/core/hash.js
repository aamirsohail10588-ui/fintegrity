"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashString = hashString;
exports.hashObject = hashObject;
exports.hashTransaction = hashTransaction;
const crypto_1 = require("crypto");
function hashString(input) {
    const hash = (0, crypto_1.createHash)("sha256");
    hash.update(input, "utf8");
    return hash.digest("hex");
}
function hashObject(input) {
    const stableString = JSON.stringify(sortObject(input));
    return hashString(stableString);
}
function sortObject(obj) {
    const sortedKeys = Object.keys(obj).sort();
    const result = {};
    for (const key of sortedKeys) {
        const value = obj[key];
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            result[key] = sortObject(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
function hashTransaction(tx) {
    const normalized = {
        reference: tx.reference,
        entries: tx.entries
            .map((e) => ({
            accountId: e.accountId,
            debit: e.debit,
            credit: e.credit,
        }))
            .sort((a, b) => a.accountId.localeCompare(b.accountId)),
    };
    return hashObject(normalized);
}
