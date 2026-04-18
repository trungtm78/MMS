// US-W013: GPS tracking API
import client from './client'
import type { GpsLog } from '@/types'

export const gpsApi = {
  // Latest location for each militia in scope
  liveLocations: async (unitScope?: string): Promise<GpsLog[]> => {
    const response = await client.get<GpsLog[]>('/gps/live', {
      params: unitScope ? { unitScope } : undefined,
    })
    return response.data
  },

  // GPS history for a militia
  history: async (militiaId: string, from: string, to: string): Promise<GpsLog[]> => {
    const response = await client.get<GpsLog[]>(`/gps/history/${militiaId}`, {
      params: { from, to },
    })
    return response.data
  },
}
