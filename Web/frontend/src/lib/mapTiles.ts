// Map tiles of the GPS tracking page. OpenStreetMap by default; a deployment behind a Content
// Security Policy or without internet access serves its own tiles through VITE_MAP_TILE_URL
// (a Leaflet URL template such as https://tiles.example/{z}/{x}/{y}.png) and credits them with
// VITE_MAP_TILE_ATTRIBUTION. A blank variable counts as unset.

export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export interface MapTileSource {
  /** Leaflet tile URL template */
  url: string
  /** Credit shown on the map (HTML allowed, as Leaflet renders it) */
  attribution: string
}

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * The tile server and its credit, read from the environment when called. `defaultAttribution`
 * credits the OpenStreetMap tiles (the translated gps.map.view.attribution text).
 */
export function mapTileSource(defaultAttribution: string): MapTileSource {
  return {
    url: configured(import.meta.env.VITE_MAP_TILE_URL) ?? OSM_TILE_URL,
    attribution: configured(import.meta.env.VITE_MAP_TILE_ATTRIBUTION) ?? defaultAttribution,
  }
}
