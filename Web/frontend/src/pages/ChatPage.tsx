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
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-[#1F3A5F]">Cuộc trò chuyện mới</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên nhóm (tuỳ chọn)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Để trống cho chat 1-1..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User ID thành viên *</label>
            <input
              data-testid="participant-input"
              type="text"
              value={participantInput}
              onChange={(e) => setParticipantInput(e.target.value)}
              placeholder="user-uuid-1, user-uuid-2..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
            />
            <p className="text-xs text-gray-500 mt-1">Phân cách bằng dấu phẩy hoặc khoảng trắng</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              data-testid="create-conv-submit"
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-[#1F3A5F] rounded-lg hover:bg-[#162d4a] disabled:opacity-50"
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

  // WebSocket: connect once, join/leave rooms as conversation changes
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
      // Refresh conversation list to update lastMessage
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
      {/* Conversation list */}
      <div className="w-72 border-r border-gray-200 flex flex-col bg-white">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-[#1F3A5F]">Tin nhắn</h1>
            <button
              data-testid="new-conv-btn"
              onClick={() => setShowNewConv(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Tạo cuộc trò chuyện mới"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="space-y-1 p-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 px-4">
              <MessageCircle size={32} className="text-gray-300" />
              <p className="text-sm text-gray-500 text-center">Chưa có cuộc trò chuyện nào</p>
              <button
                onClick={() => setShowNewConv(true)}
                className="px-3 py-1.5 text-xs text-white bg-[#1F3A5F] rounded-lg hover:bg-[#162d4a]"
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
                    isActive ? 'border-[#1F3A5F] bg-blue-50' : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-[#1F3A5F] flex items-center justify-center flex-shrink-0">
                    {conv.conversationType === 'group'
                      ? <Users size={16} className="text-white" />
                      : <MessageCircle size={16} className="text-white" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{convLabel(conv)}</p>
                    <p className="text-xs text-gray-500 truncate">{conv.lastMessage ?? 'Chưa có tin nhắn'}</p>
                  </div>
                  {conv.lastMessageAt && (
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(conv.lastMessageAt)}</span>
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
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <MessageCircle size={48} className="text-gray-200" />
            <p className="text-sm">&larr; Chọn một cuộc trò chuyện để bắt đầu</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#1F3A5F] flex items-center justify-center flex-shrink-0">
                {selectedConv.conversationType === 'group'
                  ? <Users size={16} className="text-white" />
                  : <MessageCircle size={16} className="text-white" />
                }
              </div>
              <div>
                <p className="font-semibold text-[#1F3A5F]">{convLabel(selectedConv)}</p>
                <p className="text-xs text-gray-500">
                  {selectedConv.conversationType === 'group' ? 'Nhóm' : 'Chat riêng'}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-slate-50">
              {messages.length === 0 ? (
                <div className="flex justify-center py-8">
                  <p className="text-sm text-gray-400">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isOwn = msg.senderId === user?.sub
                  return (
                    <div
                      key={msg.id ?? `${msg.senderId}-${i}`}
                      data-testid="message-item"
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-xs lg:max-w-md ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                        {!isOwn && msg.senderName && (
                          <p className="text-xs text-gray-500 px-1">{msg.senderName}</p>
                        )}
                        <div className={`px-4 py-2 rounded-2xl text-sm ${
                          isOwn
                            ? 'bg-[#1F3A5F] text-white rounded-br-sm'
                            : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
                        }`}>
                          {msg.content}
                        </div>
                        <p className="text-xs text-gray-400 px-1">{formatTime(msg.createdAt)}</p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-gray-200 bg-white">
              <form onSubmit={handleSend} className="flex items-center gap-3">
                <input
                  data-testid="message-input"
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
                />
                <button
                  data-testid="send-btn"
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="p-2 bg-[#1F3A5F] text-white rounded-full hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed"
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
