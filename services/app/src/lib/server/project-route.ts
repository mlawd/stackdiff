export function normalizeProjectRouteParam(value: string): string {
  let normalized = value.trim();
  if (!normalized) {
    return '';
  }

  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) {
        break;
      }

      normalized = decoded.trim();
    } catch {
      break;
    }
  }

  return normalized;
}
