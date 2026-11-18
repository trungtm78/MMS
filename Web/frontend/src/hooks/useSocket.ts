// The live notifications socket: connection state, active SOS alerts and GPS positions
import { useContext } from 'react'
import { SocketContext, type SocketContextType } from '@/contexts/socketContextValue'

export function useSocket(): SocketContextType {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
