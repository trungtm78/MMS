import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportCsv } from './csv-export'

// jsdom doesn't provide URL.createObjectURL — polyfill it
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:fake-url')
const mockRevokeObjectURL = vi.fn()

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: mockCreateObjectURL, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: mockRevokeObjectURL, writable: true })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('exportCsv', () => {
  it('triggers a download with the given filename', () => {
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      href: '', download: '', click: clickSpy,
    } as unknown as HTMLAnchorElement)

    exportCsv(['Col A', 'Col B'], [['val1', 'val2']], 'test.csv')

    expect(clickSpy).toHaveBeenCalledOnce()
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('creates a Blob with UTF-8 BOM and correct MIME type', () => {
    const blobParts: BlobPart[][] = []
    const BlobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation((parts, opts) => {
      blobParts.push(parts as BlobPart[])
      return { type: opts?.type } as Blob
    })
    vi.spyOn(document, 'createElement').mockReturnValueOnce({ href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement)

    exportCsv(['H'], [['v']], 'out.csv')

    expect(BlobSpy).toHaveBeenCalledWith(
      [expect.stringContaining('﻿')],
      { type: 'text/csv;charset=utf-8;' },
    )
    BlobSpy.mockRestore()
  })

  it('quotes values and escapes double-quotes', () => {
    let capturedContent = ''
    vi.spyOn(globalThis, 'Blob').mockImplementationOnce((parts) => {
      capturedContent = (parts as string[])[0]
      return {} as Blob
    })
    vi.spyOn(document, 'createElement').mockReturnValueOnce({ href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement)

    exportCsv(['Name'], [['John "Hero" Smith']], 'out.csv')

    expect(capturedContent).toContain('"John ""Hero"" Smith"')
  })

  it('handles empty rows gracefully without throwing', () => {
    vi.spyOn(globalThis, 'Blob').mockImplementationOnce(() => ({} as Blob))
    vi.spyOn(document, 'createElement').mockReturnValueOnce({ href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement)
    expect(() => exportCsv(['H'], [], 'empty.csv')).not.toThrow()
  })
})
