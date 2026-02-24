import { SYNONYM_REGISTRY } from "./SynonymRegistry";

export function normalizeHeader(header: string): string {
  let normalized = header
    .toLowerCase()
    .trim()
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ");

  const tokens = normalized.split(" ");

  const expandedTokens = tokens.map((token) => {
    return SYNONYM_REGISTRY[token] ?? token;
  });

  normalized = expandedTokens.join(" ");

  normalized = normalized
    .replace(/amount/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}
