import { CANONICAL_FIELDS, CanonicalField } from "./constants";
import { HEADER_KEYWORDS } from "./HeaderSemanticMap";
import { normalizeHeader } from "./HeaderNormalizer";

export interface HeaderSuggestion {
  original: string;
  normalized: string;
  bestMatch: CanonicalField | null;
  confidence: number; // 0–100
}

function scoreMatch(normalized: string, keyword: string): number {
  const headerTokens = normalized.split(" ");
  const keywordTokens = keyword.split(" ");

  let matchCount = 0;

  for (const token of keywordTokens) {
    if (headerTokens.includes(token)) {
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;

  const coverage = matchCount / keywordTokens.length;

  if (coverage === 1) return 100;
  if (coverage >= 0.75) return 90;
  if (coverage >= 0.5) return 75;
  return 60;
}

export function suggestHeaderMapping(
  incomingHeaders: string[],
): HeaderSuggestion[] {
  return incomingHeaders.map((header) => {
    const normalized = normalizeHeader(header);

    let bestField: CanonicalField | null = null;
    let bestScore = 0;

    for (const field of CANONICAL_FIELDS) {
      const keywords = HEADER_KEYWORDS[field];

      for (const keyword of keywords) {
        const normalizedKeyword = normalizeHeader(keyword);
        const score = scoreMatch(normalized, normalizedKeyword);

        if (score > bestScore) {
          bestScore = score;
          bestField = field;
        }
      }
    }

    let finalField = bestScore > 0 ? bestField : null;
    let finalScore = bestScore;

    // ----------------------------
    // Disambiguation Rules (India)
    // ----------------------------

    if (finalField && normalized.includes("voucher")) {
      // Voucher Date should map to date
      if (normalized.includes("date")) {
        finalField = "date";
        finalScore = 100;
      }

      // Voucher Number should map to invoice/reference
      if (normalized.includes("number")) {
        finalField = "invoice";
        finalScore = 95;
      }
    }

    if (normalized.includes("reference") && normalized.includes("number")) {
      finalField = "invoice";
      finalScore = 95;
    }

    if (normalized.includes("transaction") && normalized.includes("type")) {
      finalField = "type";
      finalScore = 100;
    }

    return {
      original: header,
      normalized,
      bestMatch: finalField,
      confidence: finalScore,
    };
  });
}
