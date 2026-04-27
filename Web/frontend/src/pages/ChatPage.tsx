import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageCircle, Send, Plus, X, Users } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import client, { getAccessToken } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000'

interface Conversation {
  id: string
  title: string | null
  conversationType: string
  createdAt: string
  lastMessage: string | null
  lastMessageAt: string | null
}

interface ChatMessage {
  id?: string
  senderId: string
  senderName?: string
  conversationId?: string
  content: string
  createdAt: string
}

interface MessagesResponse {
  data: ChatMessage[]
  total: number
  page: number
  limit: number
}

async function listConversations(): Promise<Conversation[]> {
  const res = await client.get('/chat/conversations')
  return res.data
}

async function getMessages(conversationId: string, page = 1): Promise<MessagesResponse> {
  const res = await client.get(`/chat/conversations/${conversationId}/messages`, {
    params: { page, limit: 50 },
  })
  return res.data
}

async function createConversation(dto: {
  participantIds: string[]
  title?: string
  conversationType?: string
}): Promise<Conversation> {
  const res = await client.post('/chat/conversations', dto)
  return res.data
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const isSameDay = d.toDateString() === now.toDateString()
  if (isSameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── NewConversationModal ─────────────────────────────────────────

interface NewConvModalProps {
  onClose: () => void
  onCreated: (conv: Conversation) => void
}

function NewConversationModal({ onClose, onCreated }: NewConvModalProps) {
  const [title, setTitle] = useState('')
  const [participantInput, setParticipantInput] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (conv) => {
      toast.success('Đã tạo cuộc trò chuyện')
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] })
      onCreated(conv)
      onClose()
    },
    onError: () => toast.error('Không thể tạo cuộc trò chuyện'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ids = participantInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (ids.length === 0) { toast.error('Nhập ít nhất một thành viên'); return }
    createMutation.mutate({
      title: title.trim() || undefined,
      participantIds: ids,
      conversationType: ids.length === 1 ? 'direct' : 'group',
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cuộc trò chuyện mới"
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-md"
      >
        {/* Modal header: red/yellow branding */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#C62828] to-[#A91D1D] rounded-t-xl">
          <h2 className="text-lg font-semibold text-white">Cuộc trò chuyện mới</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#C62828] mb-1">Tên nhóm (tuỳ chọn)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Để trống cho chat 1-1..."
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#C62828] mb-1">User ID thành viên *</label>
            <input
              data-testid="participant-input"
              type="text"
              value={participantInput}
              onChange={(e) => setParticipantInput(e.target.value)}
              placeholder="user-uuid-1, user-uuid-2..."
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
            />
            <p className="text-xs text-[#64748B] mt-1">Phân cách bằng dấu phẩy hoặc khoảng trắng</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Hủy
            </button>
            <button
              data-testid="create-conv-submit"
              type="submit"
              disabled={createMutation.isPending}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Đang tạo...' : 'Tạo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ChatPage ─────────────────────────────────────────────────────

export function ChatPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [showNewConv, setShowNewConv] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentConvRef = useRef<string | null>(null)

  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: listConversations,
    refetchInterval: 15_000,
  })

  const { data: historyData } = useQuery({
    queryKey: ['chat-messages', selectedConv?.id],
    queryFn: () => getMessages(selectedConv!.id),
    enabled: !!selectedConv,
  })

  useEffect(() => {
    if (historyData) {
      setMessages([...historyData.data].reverse())
    }
  }, [historyData])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
    })
    socketRef.current = socket

    socket.on('chat:message', (msg: ChatMessage) => {
      if (msg.conversationId === currentConvRef.current) {
        setMessages((prev) => [...prev, msg])
      }
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] })
    })

    return () => { socket.disconnect() }
  }, [queryClient])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    if (currentConvRef.current) {
      socket.emit('chat:leave', currentConvRef.current)
    }
    currentConvRef.current = selectedConv?.id ?? null
    if (selectedConv) {
      socket.emit('chat:join', selectedConv.id)
    }
  }, [selectedConv])

  const handleSelectConv = useCallback((conv: Conversation) => {
    setSelectedConv(conv)
    setMessages([])
  }, [])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const content = messageInput.trim()
    if (!content || !selectedConv || !socketRef.current) return

    socketRef.current.emit('chat:send', {
      conversationId: selectedConv.id,
      content,
    })
    setMessageInput('')
  }

  function convLabel(conv: Conversation): string {
    if (conv.title) return conv.title
    return conv.conversationType === 'direct' ? 'Chat 1-1' : 'Nhóm chat'
  }

  return (
    <div data-testid="chat-page" className="flex h-full">
      {/* Conversation list — red/yellow header */}
      <div className="w-72 border-r border-[#E2E8F0] flex flex-col bg-white">
        <div className="px-4 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#C62828] to-[#A91D1D]">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-white">Tin nhắn</h1>
            <button
              data-testid="new-conv-btn"
              onClick={() => setShowNewConv(true)}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors"
              aria-label="Tạo cuộc trò chuyện mới"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#F8FAFC]">
          {convsLoading ? (
            <div className="space-y-1 p-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-white rounded animate-pulse" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 px-4">
              <MessageCircle size={32} className="text-[#E2E8F0]" />
              <p className="text-sm text-[#64748B] text-center">Chưa có cuộc trò chuyện nào</p>
              <button
                onClick={() => setShowNewConv(true)}
                className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-3 py-1.5 text-xs transition-colors"
              >
                Bắt đầu chat
              </button>
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = selectedConv?.id === conv.id
              return (
                <button
                  key={conv.id}
                  data-testid={`conv-item-${conv.id}`}
                  onClick={() => handleSelectConv(conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2 ${
                    isActive ? 'border-[#C62828] bg-white' : 'border-transparent hover:bg-white'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isActive ? 'bg-[#C62828]' : 'bg-[#1F3A5F]'
                  }`}>
                    {conv.conversationType === 'group'
                      ? <Users size={16} className="text-white" />
                      : <MessageCircle size={16} className="text-white" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-[#C62828]' : 'text-[#0F172A]'}`}>{convLabel(conv)}</p>
                    <p className="text-xs text-[#64748B] truncate">{conv.lastMessage ?? 'Chưa có tin nhắn'}</p>
                  </div>
                  {conv.lastMessageAt && (
                    <span className="text-xs text-[#64748B] flex-shrink-0">{formatTime(conv.lastMessageAt)}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col">
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#F8FAFC]">
            <MessageCircle size={48} className="text-[#E2E8F0]" />
            <p className="text-sm text-[#64748B]">&larr; Chọn một cuộc trò chuyện để bắt đầu</p>
          </div>
        ) : (
          <>
            {/* Chat header: red/yellow */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#C62828] to-[#A91D1D] flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                {selectedConv.conversationType === 'group'
                  ? <Users size={16} className="text-white" />
                  : <MessageCircle size={16} className="text-white" />
                }
              </div>
              <div>
                <p className="font-semibold text-white">{convLabel(selectedConv)}</p>
                <p className="text-xs text-white/70">
                  {selectedConv.conversationType === 'group' ? 'Nhóm' : 'Chat riêng'}
                </p>
              </div>
            </div>

            {/* Messages: bg-[#F8FAFC] */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-[#F8FAFC]">
              {messages.length === 0 ? (
                <div className="flex justify-center py-8">
                  <p className="text-sm text-[#64748B]">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isOwn = msg.senderId === user?.id?.toString()
                  return (
                    <div
                      key={msg.id ?? `${msg.senderId}-${i}`}
                      data-testid="message-item"
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-xs lg:max-w-md ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                        {!isOwn && msg.senderName && (
                          <p className="text-xs text-[#64748B] px-1">{msg.senderName}</p>
                        )}
                        {/* sent=green, received=white */}
                        <div className={`px-4 py-2 rounded-2xl text-sm ${
                          isOwn
                            ? 'bg-[#2E7D32] text-white rounded-br-sm'
                            : 'bg-white text-[#0F172A] rounded-bl-sm shadow-sm border border-[#E2E8F0]'
                        }`}>
                          {msg.content}
                        </div>
                        <p className="text-xs text-[#64748B] px-1">{formatTime(msg.createdAt)}</p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-[#E2E8F0] bg-white">
              <form onSubmit={handleSend} className="flex items-center gap-3">
                <input
                  data-testid="message-input"
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 border border-[#E2E8F0] rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
                />
                <button
                  data-testid="send-btn"
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="p-2 bg-[#C62828] text-white rounded-full hover:bg-[#A91D1D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Gửi tin nhắn"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {showNewConv && (
        <NewConversationModal
          onClose={() => setShowNewConv(false)}
          onCreated={handleSelectConv}
        />
      )}
    </div>
  )
}
