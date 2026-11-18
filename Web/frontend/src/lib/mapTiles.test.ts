import { afterEach, describe, expect, it, vi } from 'vitest'
import { OSM_TILE_URL, mapTileSource } from './mapTiles'

const DEFAULT_ATTRIBUTION = '&copy; Những người đóng góp <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

describe('mapTileSource', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses OpenStreetMap and the given attribution when nothing is configured', () => {
    vi.stubEnv('VITE_MAP_TILE_URL', undefined)
    vi.stubEnv('VITE_MAP_TILE_ATTRIBUTION', undefined)

    expect(OSM_TILE_URL).toBe('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(mapTileSource(DEFAULT_ATTRIBUTION)).toEqual({ url: OSM_TILE_URL, attribution: DEFAULT_ATTRIBUTION })
  })

  it.each(['', '   '])('treats the blank value %j as unset', (blank) => {
    vi.stubEnv('VITE_MAP_TILE_URL', blank)
    vi.stubEnv('VITE_MAP_TILE_ATTRIBUTION', blank)

    expect(mapTileSource(DEFAULT_ATTRIBUTION)).toEqual({ url: OSM_TILE_URL, attribution: DEFAULT_ATTRIBUTION })
  })

  it('uses the configured tile server and attribution, trimmed', () => {
    vi.stubEnv('VITE_MAP_TILE_URL', ' https://tiles.phudinh.local/{z}/{x}/{y}.png ')
    vi.stubEnv('VITE_MAP_TILE_ATTRIBUTION', ' Bản đồ nội bộ UBND Phường Phú Định ')

    expect(mapTileSource(DEFAULT_ATTRIBUTION)).toEqual({
      url: 'https://tiles.phudinh.local/{z}/{x}/{y}.png',
      attribution: 'Bản đồ nội bộ UBND Phường Phú Định',
    })
  })

  it('configures the tile server and the attribution independently', () => {
    vi.stubEnv('VITE_MAP_TILE_URL', '/tiles/{z}/{x}/{y}.png')
    vi.stubEnv('VITE_MAP_TILE_ATTRIBUTION', undefined)

    expect(mapTileSource(DEFAULT_ATTRIBUTION)).toEqual({ url: '/tiles/{z}/{x}/{y}.png', attribution: DEFAULT_ATTRIBUTION })

    vi.stubEnv('VITE_MAP_TILE_URL', '')
    vi.stubEnv('VITE_MAP_TILE_ATTRIBUTION', 'Bản đồ nội bộ')

    expect(mapTileSource(DEFAULT_ATTRIBUTION)).toEqual({ url: OSM_TILE_URL, attribution: 'Bản đồ nội bộ' })
  })
})
