// The live notifications socket state shared by SocketProvider (contexts/SocketContext.tsx) and
// useSocket (hooks/useSocket.ts)
import { createContext } from 'react'
import type { GpsLiveRow } from '@/api/gps'
import type { SosIncidentType, SosSeverity } from '@/api/sos'

/**
 * An SOS alert announced live. The sos:new payload (Web/backend/src/sos/sos.service.ts announce)
 * carries only id, code, incidentType, severity and title — no reporter, status or date — so the
 * moment it arrived is kept as receivedAt. Full details come from GET /sos/alerts.
 */
export interface SosLiveAlert {
  id: string
  /** SOS-YYYYMMDD-XXXXXX */
  code: string
  incidentType: SosIncidentType
  severity: SosSeverity
  title: string
  /** ISO timestamp of when this browser received the alert */
  receivedAt: string
}

export interface SocketContextType {
  isConnected: boolean
  activeSosAlerts: SosLiveAlert[]
  clearSosAlert: (id: string) => void
  /**
   * Calls `listener` with each gps:update row (one GET /gps/live row) until the returned function
   * is called. Positions are not kept here: the GPS page merges them into its own query.
   */
  onGpsUpdate: (listener: (row: GpsLiveRow) => void) => () => void
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined)
