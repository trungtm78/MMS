import {
  DOCX_TYPE,
  XLSX_TYPE,
  isDeclaredTypeAcceptable,
  resolveUploadType,
  sniffContentType,
} from './upload-type';

const bytes = (...values: (number | string)[]) =>
  Buffer.concat(
    values.map((v) =>
      typeof v === 'string' ? Buffer.from(v, 'latin1') : Buffer.from([v]),
    ),
  );

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'JFIF', 0);
const PNG = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const GIF87 = bytes('GIF87a', 1, 0, 1, 0, 0, 0);
const GIF89 = bytes('GIF89a', 1, 0, 1, 0, 0, 0);
const WEBP = bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 ');
const AVI = bytes('RIFF', 0x24, 0, 0, 0, 'AVI LIST');
const PDF = bytes('%PDF-1.7\n%', 0xe2, 0xe3);
const ZIP = bytes('PK', 0x03, 0x04, 0x14, 0, 0x06, 0, 0x08, 0, 0, 0);
const HTML = bytes('<!doctype html><script>');

describe('sniffContentType', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['GIF87a', GIF87, 'image/gif'],
    ['GIF89a', GIF89, 'image/gif'],
    ['WebP', WEBP, 'image/webp'],
    ['PDF', PDF, 'application/pdf'],
    ['a ZIP container (OOXML)', ZIP, 'zip'],
  ])('recognises %s by its signature', (_label, head, type) => {
    expect(sniffContentType(head)).toBe(type);
  });

  it.each([
    ['HTML', HTML],
    ['a RIFF file that is not WebP', AVI],
    ['nothing', Buffer.alloc(0)],
    ['a truncated PNG signature', PNG.subarray(0, 4)],
  ])('recognises nothing in %s', (_label, head) => {
    expect(sniffContentType(head)).toBeNull();
  });
});

// The stored type comes from the content: a client's declared type is only a hint that
// must agree with it (Dio sends application/octet-stream unless told otherwise)
describe('resolveUploadType', () => {
  it('keeps a declared type the content confirms', () => {
    expect(resolveUploadType('image/jpeg', 'a.jpg', JPEG)).toBe('image/jpeg');
    expect(resolveUploadType('application/pdf', 'a.pdf', PDF)).toBe(
      'application/pdf',
    );
  });

  it('normalises case, parameters and the image/jpg alias', () => {
    expect(resolveUploadType('IMAGE/PNG; charset=binary', 'a', PNG)).toBe(
      'image/png',
    );
    expect(resolveUploadType('image/jpg', 'a.jpg', JPEG)).toBe('image/jpeg');
    expect(resolveUploadType('image/pjpeg', 'a.jpg', JPEG)).toBe('image/jpeg');
  });

  it.each([[undefined], [''], ['application/octet-stream']])(
    'takes the type from the content when the client declares %j',
    (declared) => {
      expect(resolveUploadType(declared, 'photo', PNG)).toBe('image/png');
      expect(resolveUploadType(declared, 'scan', WEBP)).toBe('image/webp');
    },
  );

  it('refuses content that contradicts the declared type', () => {
    expect(resolveUploadType('image/jpeg', 'a.jpg', PNG)).toBeNull();
    expect(resolveUploadType('image/png', 'a.png', HTML)).toBeNull();
    expect(resolveUploadType('application/pdf', 'a.pdf', ZIP)).toBeNull();
  });

  it('refuses content of no allowed type whatever is declared', () => {
    expect(
      resolveUploadType('application/octet-stream', 'a.html', HTML),
    ).toBeNull();
    expect(resolveUploadType('image/webp', 'a.webp', AVI)).toBeNull();
  });

  // DOCX and XLSX are both ZIP containers: the declared type, or else the extension, says which
  it('tells Word from Excel documents by declared type, else by extension', () => {
    expect(resolveUploadType(DOCX_TYPE, 'report.bin', ZIP)).toBe(DOCX_TYPE);
    expect(resolveUploadType(XLSX_TYPE, 'sheet', ZIP)).toBe(XLSX_TYPE);
    expect(
      resolveUploadType('application/octet-stream', 'Báo cáo.DOCX', ZIP),
    ).toBe(DOCX_TYPE);
    expect(resolveUploadType(undefined, 'bang.xlsx', ZIP)).toBe(XLSX_TYPE);
  });

  it('refuses other ZIP archives', () => {
    expect(
      resolveUploadType('application/octet-stream', 'files.zip', ZIP),
    ).toBeNull();
    expect(resolveUploadType('application/zip', 'files.zip', ZIP)).toBeNull();
    expect(resolveUploadType('image/png', 'a.docx', ZIP)).toBeNull();
  });
});

describe('isDeclaredTypeAcceptable', () => {
  it.each([
    ['image/png', true],
    ['IMAGE/JPEG', true],
    ['image/jpg', true],
    [DOCX_TYPE, true],
    ['application/octet-stream', true],
    ['', true],
    [undefined, true],
    ['text/html', false],
    ['image/svg+xml', false],
    ['application/zip', false],
    ['video/mp4', false],
  ])('%j → %s', (declared, acceptable) => {
    expect(isDeclaredTypeAcceptable(declared)).toBe(acceptable);
  });
});
