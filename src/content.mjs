export function truncateContent(value, maxChars) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const truncated = normalized.length > maxChars;
  const text = truncated ? normalized.slice(0, maxChars) : normalized;

  return {
    text,
    contentLength: text.length,
    truncated,
  };
}
