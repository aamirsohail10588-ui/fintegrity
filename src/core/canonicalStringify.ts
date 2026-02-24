export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();

    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      result[key] = sortRecursively((value as Record<string, unknown>)[key]);
    }

    return result;
  }

  return value;
}
