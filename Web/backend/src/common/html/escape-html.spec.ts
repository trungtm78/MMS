import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('escapes the characters that open markup or end a quoted attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('renders missing values as empty text', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('renders numbers and booleans as their text', () => {
    expect(escapeHtml(1500000.5)).toBe('1500000.5');
    expect(escapeHtml(false)).toBe('false');
  });

  // Database drivers return dates as Date objects; their locale string depends on the host
  it('renders dates as ISO timestamps, whatever the host locale', () => {
    expect(escapeHtml(new Date('2026-09-30T18:30:00Z'))).toBe(
      '2026-09-30T18:30:00.000Z',
    );
  });

  // JSON columns arrive as objects; "[object Object]" would hide their content
  it('renders objects as escaped JSON', () => {
    expect(escapeHtml({ note: '<b>' })).toBe(
      '{&quot;note&quot;:&quot;&lt;b&gt;&quot;}',
    );
  });
});
