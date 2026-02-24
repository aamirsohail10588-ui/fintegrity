"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeHeader = normalizeHeader;
const SynonymRegistry_1 = require("./SynonymRegistry");
function normalizeHeader(header) {
    let normalized = header
        .toLowerCase()
        .trim()
        .replace(/[_\-.]/g, " ")
        .replace(/\s+/g, " ");
    const tokens = normalized.split(" ");
    const expandedTokens = tokens.map((token) => {
        return SynonymRegistry_1.SYNONYM_REGISTRY[token] ?? token;
    });
    normalized = expandedTokens.join(" ");
    normalized = normalized
        .replace(/amount/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return normalized;
}
