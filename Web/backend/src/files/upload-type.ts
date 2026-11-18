import { extname } from 'path';

export const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// What POST /files/upload accepts: the types and size the upload filter always allowed
export const ALLOWED_UPLOAD_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  DOCX_TYPE,
  XLSX_TYPE,
]);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Leading bytes needed to recognise every signature below (WebP: 12)
export const SNIFF_BYTES = 12;

// Declared types that say nothing: the content decides (Dio and many HTTP clients send
// application/octet-stream unless a content type is set on the part)
const GENERIC_TYPES: ReadonlySet<string> = new Set([
  '',
  'application/octet-stream',
]);
const TYPE_ALIASES: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
};
const OOXML_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.docx': DOCX_TYPE,
  '.xlsx': XLSX_TYPE,
};

export type SniffedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  | 'application/pdf'
  | 'zip';

function hasSignature(
  head: Buffer,
  signature: readonly number[] | string,
  offset = 0,
): boolean {
  const bytes =
    typeof signature === 'string'
      ? Buffer.from(signature, 'latin1')
      : Buffer.from(signature);
  return (
    head.length >= offset + bytes.length &&
    head.subarray(offset, offset + bytes.length).equals(bytes)
  );
}

/** The allowed type the leading bytes of a file prove, or null. DOCX/XLSX read as 'zip'. */
export function sniffContentType(head: Buffer): SniffedType | null {
  if (hasSignature(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasSignature(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (hasSignature(head, 'GIF87a') || hasSignature(head, 'GIF89a')) {
    return 'image/gif';
  }
  if (hasSignature(head, 'RIFF') && hasSignature(head, 'WEBP', 8)) {
    return 'image/webp';
  }
  if (hasSignature(head, '%PDF-')) return 'application/pdf';
  if (hasSignature(head, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  return null;
}

/** A declared media type without parameters, lower case, aliases resolved. */
export function normaliseDeclaredType(declared?: string): string {
  const type = (declared ?? '').split(';')[0].trim().toLowerCase();
  return TYPE_ALIASES[type] ?? type;
}

/** Whether a declared type may still turn out allowed once the content is read. */
export function isDeclaredTypeAcceptable(declared?: string): boolean {
  const type = normaliseDeclaredType(declared);
  return GENERIC_TYPES.has(type) || ALLOWED_UPLOAD_TYPES.has(type);
}

/**
 * The type an upload is stored and served as, decided by its content: null refuses it.
 * A declared type must agree with the content; a generic one defers to it. DOCX and XLSX
 * share the ZIP signature, so the declared type, or else the file extension, tells them
 * apart, and any other ZIP archive is refused.
 */
export function resolveUploadType(
  declared: string | undefined,
  originalName: string,
  head: Buffer,
): string | null {
  const sniffed = sniffContentType(head);
  if (sniffed === null) return null;
  const type = normaliseDeclaredType(declared);
  const generic = GENERIC_TYPES.has(type);

  if (sniffed === 'zip') {
    if (type === DOCX_TYPE || type === XLSX_TYPE) return type;
    if (!generic) return null;
    return OOXML_BY_EXTENSION[extname(originalName).toLowerCase()] ?? null;
  }
  return generic || type === sniffed ? sniffed : null;
}
