// Types a browser or app may show in place; anything else is offered as a download
const INLINE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

// RFC 8187 attr-char: encodeURIComponent leaves ' ( ) * unencoded, which attr-char excludes
const encodeExtValue = (value: string) =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * Content-Disposition for a stored file (RFC 6266): an ASCII fallback name, where anything
 * outside a conservative set becomes "_" (no quotes, separators or line breaks can end the
 * header), and the exact UTF-8 name as filename* (RFC 8187).
 */
export function contentDispositionOf(name: string, mimeType: string): string {
  const disposition = INLINE_TYPES.has(mimeType) ? 'inline' : 'attachment';
  const fallback = name.replace(/[^A-Za-z0-9 !#$&'()+,\-.=@[\]^_`{}~]/g, '_');
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeExtValue(name)}`;
}
