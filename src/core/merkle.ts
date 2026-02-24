import { hashString } from "./hash";
import { canonicalStringify } from "./canonicalStringify";

/**
 * Deterministically builds leaf hashes from replayed state.
 * state = Record<accountId, balance>
 */
export function buildLeafHashes(
  entityId: string,
  version: number,
  state: Record<string, number>,
): string[] {
  const leaves: string[] = [];

  const accounts = Object.keys(state).sort();

  for (const accountId of accounts) {
    const balance = state[accountId];

    const canonicalRow = canonicalStringify({
      entityId,
      version,
      accountId,
      balance,
    });

    leaves.push(hashString(canonicalRow));
  }

  return leaves.sort();
}

/**
 * Builds Merkle root from leaf hashes.
 * If odd number of leaves, duplicate last leaf.
 */
export function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    throw new Error("[MERKLE] Cannot build root from empty leaves");
  }

  let level = [...leaves];

  while (level.length > 1) {
    const nextLevel: string[] = [];

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;

      const combined = left + right;
      nextLevel.push(hashString(combined));
    }

    level = nextLevel;
  }

  return level[0];
}
