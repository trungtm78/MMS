// US-W008: WebSocket context for real-time SOS alerts + GPS updates
import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { getAccessToken } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import type { SosAlert, GpsLog } from '@/types'

interface SocketContextType {
  isConnected: boolean
  activeSosAlerts: SosAlert[]
  liveGpsLogs: Record<string, GpsLog>
  clearSosAlert: (id: string) => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000'

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [activeSosAlerts, setActiveSosAlerts] = useState<SosAlert[]>([])
  const [liveGpsLogs, setLiveGpsLogs] = useState<Record<string, GpsLog>>({})

  useEffect(() => {
    const token = getAccessToken()
    if (!token || !isAuthenticated) return

    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
    })
    socketRef.current = socket

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))

    // US-W008 AC-2: Real-time SOS alert delivery
    socket.on('sos:new', (alert: SosAlert) => {
      setActiveSosAlerts((prev) => {
        // Deduplicate: ignore if same ID within 30s
        if (prev.some((a) => a.id === alert.id)) return prev
        return [alert, ...prev]
      })
    })

    // US-W008 AC-3: SOS resolved — remove from active list
    socket.on('sos:resolved', ({ id }: { id: string }) => {
      setActiveSosAlerts((prev) => prev.filter((a) => a.id !== id))
    })

    // US-W013 AC-1: Real-time GPS updates
    socket.on('gps:update', (log: GpsLog) => {
      setLiveGpsLogs((prev) => ({ ...prev, [log.militiaId]: log }))
    })

    return () => {
      socket.disconnect()
    }
  }, [isAuthenticated])

  // F1: socketRef is now used — emit sos:resolve to backend when operator dismisses alert,
  //     and also update local state. Previously socketRef was assigned but never read back.
  const clearSosAlert = useCallback((id: string) => {
    socketRef.current?.emit('sos:resolve', { id })
    setActiveSosAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return (
    <SocketContext.Provider value={{ isConnected, activeSosAlerts, liveGpsLogs, clearSosAlert }}>
      {children}
    </SocketContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocket(): SocketContextType {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
