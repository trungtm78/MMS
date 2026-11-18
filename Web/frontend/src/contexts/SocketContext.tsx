// US-W008: WebSocket context for real-time SOS alerts
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { getAccessToken } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import type { GpsLiveRow } from '@/api/gps'
import { SocketContext, type SosLiveAlert } from '@/contexts/socketContextValue'
import { keepSocketSession } from '@/lib/socketSession'

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000'

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [activeSosAlerts, setActiveSosAlerts] = useState<SosLiveAlert[]>([])
  // Subscribers to live GPS positions (onGpsUpdate); a ref so subscribing never re-renders
  const gpsListenersRef = useRef(new Set<(row: GpsLiveRow) => void>())

  useEffect(() => {
    if (!getAccessToken() || !isAuthenticated) return

    const socket = io(SOCKET_URL, {
      // Read the token on every (re)connect so a refreshed access token is used
      auth: (cb) => cb({ token: getAccessToken() }),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
    })
    socketRef.current = socket
    // Handshake refusals and session_expired: refresh and reconnect, or sign out
    const stopSessionHandling = keepSocketSession(socket)

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))

    // US-W008 AC-2: Real-time SOS alert delivery; the payload has no date, so keep when it arrived
    socket.on('sos:new', (alert: Omit<SosLiveAlert, 'receivedAt'>) => {
      const receivedAt = new Date().toISOString()
      setActiveSosAlerts((prev) => {
        // Deduplicate: ignore an alert already listed
        if (prev.some((a) => a.id === alert.id)) return prev
        return [{ ...alert, receivedAt }, ...prev]
      })
    })

    // US-W008 AC-3: SOS resolved — remove from active list
    socket.on('sos:resolved', ({ id }: { id: string }) => {
      setActiveSosAlerts((prev) => prev.filter((a) => a.id !== id))
    })

    // Live positions (gps.service.ts publish): handed to the subscribers, never stored here
    const dispatchGps = (row: GpsLiveRow) => {
      for (const listener of [...gpsListenersRef.current]) listener(row)
    }
    socket.on('gps:update', dispatchGps)

    return () => {
      socket.off('gps:update', dispatchGps)
      stopSessionHandling()
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAuthenticated])

  // Emit sos:resolve to the backend when an operator dismisses an alert, and update local state
  const clearSosAlert = useCallback((id: string) => {
    socketRef.current?.emit('sos:resolve', { id })
    setActiveSosAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const onGpsUpdate = useCallback((listener: (row: GpsLiveRow) => void) => {
    gpsListenersRef.current.add(listener)
    return () => {
      gpsListenersRef.current.delete(listener)
    }
  }, [])

  return (
    <SocketContext.Provider value={{ isConnected, activeSosAlerts, clearSosAlert, onGpsUpdate }}>
      {children}
    </SocketContext.Provider>
  )
}
