// Escapes text for HTML element content and quoted attribute values. Every database
// value interpolated into server-rendered HTML must go through this.
export function escapeHtml(value: unknown): string {
  return textOf(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Dates as ISO timestamps (a locale string would depend on the host) and JSON values as
// JSON (plain String() would print "[object Object]")
function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as string | number | boolean | bigint);
}
