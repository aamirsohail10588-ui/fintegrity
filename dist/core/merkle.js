"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLeafHashes = buildLeafHashes;
exports.buildMerkleRoot = buildMerkleRoot;
const hash_1 = require("./hash");
const canonicalStringify_1 = require("./canonicalStringify");
/**
 * Deterministically builds leaf hashes from replayed state.
 * state = Record<accountId, balance>
 */
function buildLeafHashes(entityId, version, state) {
    const leaves = [];
    const accounts = Object.keys(state).sort();
    for (const accountId of accounts) {
        const balance = state[accountId];
        const canonicalRow = (0, canonicalStringify_1.canonicalStringify)({
            entityId,
            version,
            accountId,
            balance,
        });
        leaves.push((0, hash_1.hashString)(canonicalRow));
    }
    return leaves.sort();
}
/**
 * Builds Merkle root from leaf hashes.
 * If odd number of leaves, duplicate last leaf.
 */
function buildMerkleRoot(leaves) {
    if (leaves.length === 0) {
        throw new Error("[MERKLE] Cannot build root from empty leaves");
    }
    let level = [...leaves];
    while (level.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < level.length; i += 2) {
            const left = level[i];
            const right = level[i + 1] ?? left;
            const combined = left + right;
            nextLevel.push((0, hash_1.hashString)(combined));
        }
        level = nextLevel;
    }
    return level[0];
}
