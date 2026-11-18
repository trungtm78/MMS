/// <reference types="vite/client" />

// Build-time variables read by the app (import.meta.env), merged into Vite's ImportMetaEnv
interface ImportMetaEnv {
  /** Leaflet tile URL template of the GPS map; OpenStreetMap when unset or blank (lib/mapTiles.ts) */
  readonly VITE_MAP_TILE_URL?: string
  /** Credit of those tiles; the gps.map.view.attribution text when unset or blank */
  readonly VITE_MAP_TILE_ATTRIBUTION?: string
}
