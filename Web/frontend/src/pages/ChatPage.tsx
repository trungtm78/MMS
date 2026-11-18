import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { MessageCircle, Send, Plus, X, Users } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import { getAccessToken } from '@/api/client'
import {
  CHAT_MAX_MESSAGE_LENGTH,
  PARTICIPANT_SEARCH_LIMIT,
  PARTICIPANT_SEARCH_MIN_LENGTH,
  chatApi,
  chatErrorText,
  chatKeys,
  participantSearchQuery,
  type ChatMessage,
  type ChatReadEvent,
  type ChatTypingEvent,
  type Conversation,
  type MessagesPage,
} from '@/api/chat'
import { usersApi } from '@/api/users'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { useAuth } from '@/contexts/AuthContext'
import i18n from '@/i18n'
import { describeApiError, parseApiError } from '@/lib/api-error'
import { keepSocketSession } from '@/lib/socketSession'
import type { SmartSelectOption, UserSearchItem } from '@/types'

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000'

// How long to wait for a gateway acknowledgement before telling the user
const ACK_TIMEOUT_MS = 10_000
// After this long without a keystroke the user is no longer typing
const TYPING_IDLE_MS = 3_000
// A typing signal nobody stopped (lost typing_stop, closed tab) expires after this long
const TYPING_EXPIRE_MS = 5_000
// typing_start is repeated this often while typing goes on, so the receiver's expiry never runs out
const TYPING_HEARTBEAT_MS = 3_000
// socket.io reason when the server closed the socket; the gateway does so when the session ends,
// before handling any further event, and src/lib/socketSession.ts refreshes and reconnects
const SERVER_DISCONNECT = 'io server disconnect'

const CONVERSATIONS_KEY = chatKeys.conversations

// Gateway acknowledgements (Web/backend/src/notifications/notifications.gateway.ts):
// chat:send → saved message | { error }, chat:join → { joined } | { error }
type AckError = { error: string }

class AckTimeoutError extends Error {}

/** The socket closed before the acknowledgement arrived */
class ConnectionLostError extends Error {
  /** The gateway closed it — which it only does before handling the event (expired session) */
  readonly serverClosed: boolean
  constructor(serverClosed: boolean) {
    super('connection_lost')
    this.serverClosed = serverClosed
  }
}

class ChatAckError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

type PendingAcks = Set<(error: Error) => void>

function isAckError(value: unknown): value is AckError {
  return typeof value === 'object' && value !== null && typeof (value as AckError).error === 'string'
}

function isChatMessage(value: unknown): value is ChatMessage {
  const message = value as Partial<ChatMessage> | null
  return typeof message === 'object' && message !== null && typeof message.id === 'string' && typeof message.content === 'string'
}

// Waits for the acknowledgement; `pending` lets a disconnect fail it at once instead of after the timeout
function emitWithAck(socket: Socket, event: string, payload: unknown, pending?: PendingAcks): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // settle and fail only run after the timer below exists (timeout, disconnect or acknowledgement)
    const settle = () => {
      clearTimeout(timer)
      pending?.delete(fail)
    }
    const fail = (error: Error) => {
      settle()
      reject(error)
    }
    const timer = setTimeout(() => fail(new AckTimeoutError(event)), ACK_TIMEOUT_MS)
    pending?.add(fail)
    socket.emit(event, payload, (response: unknown) => {
      settle()
      resolve(response)
    })
  })
}

function describeChatError(err: unknown): string {
  if (err instanceof AckTimeoutError) return i18n.t('chat.send.error.ackTimeout')
  if (err instanceof ConnectionLostError) return i18n.t('chat.send.error.connectionLost')
  if (err instanceof ChatAckError) return chatErrorText(err.code) ?? i18n.t('chat.send.error.fallback')
  // REST send: a chat code first (message_too_long needs its maximum), then the usual order
  const { code } = parseApiError(err)
  const codeText = code !== null ? chatErrorText(code) : null
  return codeText ?? describeApiError(err, { fallback: 'chat.send.error.fallback' })
}

function participantName(participant: { fullName: string | null; username: string }): string {
  return participant.fullName || participant.username
}

// Untitled conversations are named after the other participants
function conversationLabel(conv: Conversation): string {
  if (conv.title) return conv.title
  const names = (conv.participants ?? []).map(participantName).filter(Boolean)
  if (conv.conversationType === 'direct') return names[0] ?? i18n.t('chat.conversation.untitledDirect')
  if (names.length === 0) return i18n.t('chat.conversation.untitledGroup')
  if (names.length <= 3) return names.join(', ')
  return i18n.t('chat.conversation.participantsAndMore', { names: names.slice(0, 3).join(', '), count: names.length - 3 })
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
  /** The conversation created, or the pair's existing direct conversation */
  onOpened: (conv: Conversation) => void
}

const NO_PEOPLE: UserSearchItem[] = []

function NewConversationModal({ onClose, onOpened }: NewConvModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  // The debounced text of the people search, and the people picked in the order picked
  const [searchText, setSearchText] = useState('')
  const [picked, setPicked] = useState<UserSearchItem[]>([])
  const queryClient = useQueryClient()

  // GET /users/search lists only people the caller may reach; too short a text is not searched
  const searchQuery = participantSearchQuery(searchText)
  const { data: found = NO_PEOPLE, isFetching: searching } = useQuery({
    queryKey: ['chat-participant-search', searchQuery],
    queryFn: () => usersApi.search({ q: searchQuery ?? '', limit: PARTICIPANT_SEARCH_LIMIT }),
    enabled: searchQuery !== null,
  })

  const options = useMemo<SmartSelectOption[]>(
    () =>
      found
        .filter((person) => !picked.some((p) => p.id === person.id))
        .map((person) => ({ id: person.id, label: participantName(person), sublabel: person.username })),
    [found, picked],
  )

  const handlePick = useCallback(
    (id: string) => {
      const person = found.find((p) => p.id === id)
      if (person) setPicked((list) => [...list, person])
      setSearchText('')
    },
    [found],
  )

  const createMutation = useMutation({
    mutationFn: chatApi.createConversation,
    onSuccess: ({ conversation, created }) => {
      if (created) toast.success(t('chat.create.submit.success'))
      else toast.info(t('chat.create.submit.existing'))
      onOpened(conversation)
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
      onClose()
    },
    onError: (err) => toast.error(describeApiError(err, { scope: 'chat', fallback: 'chat.create.submit.error' })),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (picked.length === 0) { toast.error(t('chat.create.form.participantsRequired')); return }
    createMutation.mutate({
      title: title.trim() || undefined,
      participantIds: picked.map((person) => person.id),
      conversationType: picked.length === 1 ? 'direct' : 'group',
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
        aria-label={t('chat.create.dialog.title')}
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-md"
      >
        {/* Modal header: red/yellow branding */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#C62828] to-[#A91D1D] rounded-t-xl">
          <h2 className="text-lg font-semibold text-white">{t('chat.create.dialog.title')}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors" aria-label={t('common.actions.close')}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#C62828] mb-1">{t('chat.create.form.titleLabel')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('chat.create.form.titlePlaceholder')}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
            />
          </div>
          <div>
            <SmartSelect
              name="participants"
              label={t('chat.create.form.participantsLabel')}
              placeholder={t('chat.create.form.participantsPlaceholder')}
              value=""
              onChange={handlePick}
              options={options}
              isLoading={searching}
              required
              onSearch={setSearchText}
            />
            {searchQuery === null && (
              <p className="text-xs text-[#64748B] mt-1">
                {t('chat.create.form.searchHint', { min: PARTICIPANT_SEARCH_MIN_LENGTH })}
              </p>
            )}
            {picked.length > 0 && (
              <ul aria-label={t('chat.create.form.pickedLabel')} className="flex flex-wrap gap-2 mt-2">
                {picked.map((person) => (
                  <li
                    key={person.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-[#FFEBEE] text-[#C62828] text-xs rounded-md border border-red-100"
                  >
                    {participantName(person)}
                    <button
                      type="button"
                      onClick={() => setPicked((list) => list.filter((p) => p.id !== person.id))}
                      aria-label={t('chat.create.form.removePerson', { name: participantName(person) })}
                      className="ml-1 hover:text-red-800"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              data-testid="create-conv-submit"
              type="submit"
              disabled={createMutation.isPending}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? t('chat.create.submit.pending') : t('common.actions.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ChatPage ─────────────────────────────────────────────────────

export function ChatPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const userId = user?.id != null ? String(user.id) : null
  const queryClient = useQueryClient()
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  // Messages that arrived before their conversation's history was in the cache
  const [uncached, setUncached] = useState<Record<string, ChatMessage[]>>({})
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [showNewConv, setShowNewConv] = useState(false)
  const [typingUserIds, setTypingUserIds] = useState<string[]>([])
  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentConvRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(userId)
  // Acknowledgements still awaited, failed at once when the socket disconnects
  const pendingAcksRef = useRef<PendingAcks>(new Set())
  // Expiry timers of other participants' typing signals
  const typingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  // The conversation this user is signalling typing in, its idle timer and the last signal
  const ownTypingRef = useRef<{
    conversationId: string | null
    timer: ReturnType<typeof setTimeout> | null
    lastSentAt: number
  }>({ conversationId: null, timer: null, lastSentAt: 0 })

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: chatApi.listConversations,
    refetchInterval: 15_000,
  })

  const openId = selectedConv?.id ?? null
  const { data: historyData } = useQuery({
    queryKey: chatKeys.messages(openId ?? ''),
    queryFn: () => chatApi.getMessages(openId!),
    enabled: !!openId,
  })

  // History is newest first; the cache also holds the messages sent and received since it loaded
  const messages = useMemo(() => {
    const history = historyData ? [...historyData.data].reverse() : []
    const extra = (openId ? uncached[openId] ?? [] : []).filter((m) => !history.some((h) => h.id === m.id))
    return [...history, ...extra]
  }, [historyData, uncached, openId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  const setUnread = useCallback(
    (conversationId: string, unreadCount: number) => {
      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_KEY, (list) =>
        list?.map((conv) => (conv.id === conversationId ? { ...conv, unreadCount } : conv)),
      )
    },
    [queryClient],
  )

  // POST /chat/conversations/:id/read; the badge clears at once
  const { mutate: markRead } = useMutation({
    mutationFn: (conversationId: string) => chatApi.markRead(conversationId),
    onMutate: (conversationId) => setUnread(conversationId, 0),
  })

  // Written into the ['chat-messages', id] cache, so a conversation opened again keeps them.
  // The sender receives its own message twice (acknowledgement + room broadcast): keep one.
  const appendMessage = useCallback(
    (msg: ChatMessage) => {
      const conversationId = msg.conversationId
      if (!conversationId) return
      const key = chatKeys.messages(conversationId)
      if (queryClient.getQueryData<MessagesPage>(key)) {
        queryClient.setQueryData<MessagesPage>(key, (page) =>
          !page || page.data.some((m) => m.id === msg.id) ? page : { ...page, data: [msg, ...page.data], total: page.total + 1 },
        )
        return
      }
      if (conversationId !== currentConvRef.current) return
      setUncached((prev) => {
        const list = prev[conversationId] ?? []
        return list.some((m) => m.id === msg.id) ? prev : { ...prev, [conversationId]: [...list, msg] }
      })
    },
    [queryClient],
  )

  const setTyping = useCallback((typingUserId: string, typing: boolean) => {
    const timers = typingTimersRef.current
    const existing = timers.get(typingUserId)
    if (existing) clearTimeout(existing)
    timers.delete(typingUserId)
    if (typing) {
      timers.set(
        typingUserId,
        setTimeout(() => {
          timers.delete(typingUserId)
          setTypingUserIds((ids) => ids.filter((id) => id !== typingUserId))
        }, TYPING_EXPIRE_MS),
      )
    }
    setTypingUserIds((ids) => {
      if (!typing) return ids.filter((id) => id !== typingUserId)
      return ids.includes(typingUserId) ? ids : [...ids, typingUserId]
    })
  }, [])

  const clearTyping = useCallback(() => {
    for (const timer of typingTimersRef.current.values()) clearTimeout(timer)
    typingTimersRef.current.clear()
    setTypingUserIds([])
  }, [])

  const stopOwnTyping = useCallback(() => {
    const state = ownTypingRef.current
    if (state.timer) clearTimeout(state.timer)
    if (state.conversationId) socketRef.current?.emit('typing_stop', state.conversationId)
    ownTypingRef.current = { conversationId: null, timer: null, lastSentAt: 0 }
  }, [])

  const signalTyping = useCallback((socket: Socket, conversationId: string) => {
    socket.emit('typing_start', conversationId)
    ownTypingRef.current.lastSentAt = Date.now()
  }, [])

  const joinConversation = useCallback(
    (socket: Socket, conversationId: string) => {
      emitWithAck(socket, 'chat:join', conversationId, pendingAcksRef.current)
        .then((ack) => {
          if (currentConvRef.current !== conversationId) return
          if (isAckError(ack)) {
            // An expired session closes the socket; the reconnect joins again
            if (ack.error !== 'session_expired') {
              setChatError(chatErrorText(ack.error) ?? i18n.t('chat.join.error.fallback'))
            }
            return
          }
          // A typing signal sent before the join was refused with not_joined: send it again
          if (ownTypingRef.current.conversationId === conversationId && socket.connected) {
            signalTyping(socket, conversationId)
          }
        })
        // No acknowledgement: live updates may be missing, sending still reports its own errors
        .catch(() => undefined)
    },
    [signalTyping],
  )

  useEffect(() => {
    if (!getAccessToken()) return

    const socket = io(SOCKET_URL, {
      // Connected below, once the session handling has set the handshake token
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
    })
    socketRef.current = socket
    const pendingAcks = pendingAcksRef.current

    // Handshake refusals and session_expired: refresh and reconnect, or sign out (AuthContext
    // then leaves the page; until it does, the chat says why it stopped)
    const stopSession = keepSocketSession(socket, {
      onSignedOut: () => setChatError(i18n.t('chat.connection.error.sessionLost')),
    })

    // Rooms do not survive a reconnect
    socket.on('connect', () => {
      const conversationId = currentConvRef.current
      if (conversationId) joinConversation(socket, conversationId)
    })

    // Acknowledgements still awaited will never come: fail them now (reconnecting is the session
    // handling's job after a server close, socket.io-client's own after any other disconnect)
    socket.on('disconnect', (reason: string) => {
      const serverClosed = reason === SERVER_DISCONNECT
      for (const fail of [...pendingAcks]) fail(new ConnectionLostError(serverClosed))
    })

    socket.on('chat:message', (msg: ChatMessage) => {
      appendMessage(msg)
      if (msg.senderId !== userIdRef.current) {
        setTyping(msg.senderId, false)
        // Someone else wrote in the open conversation: it is read as it arrives
        const openConversationId = currentConvRef.current
        if (openConversationId && msg.conversationId === openConversationId) markRead(openConversationId)
      }
      // Unread counts and last messages come from the server
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    })

    socket.on('chat:typing', (event: Partial<ChatTypingEvent>) => {
      if (!event?.userId || event.userId === userIdRef.current) return
      if (event.conversationId !== currentConvRef.current) return
      setTyping(event.userId, event.typing === true)
    })

    // A conversation was read (by this user elsewhere or by someone else): reload the counts
    socket.on('chat:read', (event: Partial<ChatReadEvent>) => {
      if (event?.conversationId) queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    })

    socket.connect()

    const typingTimers = typingTimersRef.current
    return () => {
      stopOwnTyping()
      for (const timer of typingTimers.values()) clearTimeout(timer)
      stopSession()
      socket.disconnect()
      socketRef.current = null
    }
  }, [queryClient, appendMessage, joinConversation, markRead, setTyping, stopOwnTyping])

  useEffect(() => {
    const previous = currentConvRef.current
    const next = selectedConv?.id ?? null
    if (previous === next) return
    const socket = socketRef.current
    if (previous) {
      stopOwnTyping()
      if (socket?.connected) socket.emit('chat:leave', previous)
    }
    currentConvRef.current = next
    if (next) {
      // A disconnected socket joins from its 'connect' handler
      if (socket?.connected) joinConversation(socket, next)
      markRead(next)
    }
  }, [selectedConv, joinConversation, markRead, stopOwnTyping])

  const handleSelectConv = useCallback(
    (conv: Conversation) => {
      if (conv.id === currentConvRef.current) return
      setSelectedConv(conv)
      setChatError(null)
      clearTyping()
    },
    [clearTyping],
  )

  // POST /chat/conversations answers like a list item, a new conversation or the pair's existing
  // direct one: listed at once (an existing item replaced where it is, a new one first, never
  // twice) and selected; the list reload that follows brings the server's order
  const handleOpened = useCallback(
    (conv: Conversation) => {
      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_KEY, (list = []) =>
        list.some((item) => item.id === conv.id)
          ? list.map((item) => (item.id === conv.id ? conv : item))
          : [conv, ...list],
      )
      handleSelectConv(conv)
    },
    [queryClient, handleSelectConv],
  )

  const content = messageInput.trim()
  const tooLong = content.length > CHAT_MAX_MESSAGE_LENGTH
  const canSend = !!selectedConv && content.length > 0 && !tooLong && !sending

  // typing_start when typing begins and every few seconds while it goes on; typing_stop after a
  // pause, on send or on switch
  function handleInputChange(value: string) {
    setMessageInput(value)
    const socket = socketRef.current
    const conversationId = selectedConv?.id
    if (!socket?.connected || !conversationId) return
    if (!value.trim()) {
      stopOwnTyping()
      return
    }
    if (ownTypingRef.current.conversationId !== conversationId) {
      stopOwnTyping()
      ownTypingRef.current = { conversationId, timer: null, lastSentAt: 0 }
      signalTyping(socket, conversationId)
    } else if (Date.now() - ownTypingRef.current.lastSentAt >= TYPING_HEARTBEAT_MS) {
      signalTyping(socket, conversationId)
    }
    const state = ownTypingRef.current
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(stopOwnTyping, TYPING_IDLE_MS)
  }

  // Live socket: chat:send with its acknowledgement. No socket: the REST twin.
  // A lost acknowledgement is not retried over REST (the message may be saved), except when the
  // gateway closed the socket or answered session_expired: it checks the session before saving,
  // and the REST client refreshes the token.
  async function deliver(conversationId: string, text: string): Promise<ChatMessage> {
    const socket = socketRef.current
    if (!socket?.connected) return chatApi.sendMessage(conversationId, text)
    let ack: unknown
    try {
      ack = await emitWithAck(socket, 'chat:send', { conversationId, content: text }, pendingAcksRef.current)
    } catch (err) {
      if (err instanceof ConnectionLostError && err.serverClosed) return chatApi.sendMessage(conversationId, text)
      throw err
    }
    if (isAckError(ack)) {
      if (ack.error === 'session_expired') return chatApi.sendMessage(conversationId, text)
      throw new ChatAckError(ack.error)
    }
    if (!isChatMessage(ack)) throw new ChatAckError('unexpected_acknowledgement')
    return ack
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedConv || !canSend) return

    const conversationId = selectedConv.id
    stopOwnTyping()
    setSending(true)
    setChatError(null)
    try {
      const saved = await deliver(conversationId, content)
      appendMessage({ ...saved, conversationId: saved.conversationId ?? conversationId })
      setMessageInput('')
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    } catch (err) {
      setChatError(describeChatError(err))
    } finally {
      setSending(false)
    }
  }

  const typingNames = typingUserIds
    .map((id) => selectedConv?.participants?.find((p) => p.id === id))
    .flatMap((participant) => (participant ? [participantName(participant)] : []))
  const typingText =
    typingUserIds.length === 0
      ? null
      : typingNames.length > 0
        ? t('chat.conversation.typing', { names: typingNames.join(', ') })
        : t('chat.conversation.typingSomeone')

  const describedBy = tooLong ? 'message-counter message-length-error' : 'message-counter'

  return (
    <div data-testid="chat-page" className="flex h-full">
      {/* Conversation list — red/yellow header */}
      <div className="w-72 border-r border-[#E2E8F0] flex flex-col bg-white">
        <div className="px-4 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#C62828] to-[#A91D1D]">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-white">{t('chat.list.title')}</h1>
            <button
              data-testid="new-conv-btn"
              onClick={() => setShowNewConv(true)}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors"
              aria-label={t('chat.list.newConversation')}
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
              <p className="text-sm text-[#64748B] text-center">{t('chat.list.empty')}</p>
              <button
                onClick={() => setShowNewConv(true)}
                className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-3 py-1.5 text-xs transition-colors"
              >
                {t('chat.list.start')}
              </button>
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = selectedConv?.id === conv.id
              const unread = isActive ? 0 : conv.unreadCount ?? 0
              return (
                <button
                  key={conv.id}
                  data-testid={`conv-item-${conv.id}`}
                  onClick={() => handleSelectConv(conv)}
                  aria-current={isActive ? 'true' : undefined}
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
                    <p className={`text-sm truncate ${isActive ? 'text-[#C62828] font-medium' : unread > 0 ? 'text-[#0F172A] font-semibold' : 'text-[#0F172A] font-medium'}`}>
                      {conversationLabel(conv)}
                    </p>
                    <p className="text-xs text-[#64748B] truncate">{conv.lastMessage ?? t('chat.list.noLastMessage')}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {conv.lastMessageAt && (
                      <span className="text-xs text-[#64748B]">{formatTime(conv.lastMessageAt)}</span>
                    )}
                    {unread > 0 && (
                      <span
                        data-testid={`unread-badge-${conv.id}`}
                        aria-label={t('chat.list.unread', { count: unread })}
                        className="min-w-5 h-5 px-1.5 rounded-full bg-[#C62828] text-white text-xs font-bold flex items-center justify-center"
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
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
            <p className="text-sm text-[#64748B]">{t('chat.conversation.selectPrompt')}</p>
          </div>
        ) : (
          <>
            {/* Chat header: red/yellow */}
            <div
              data-testid="chat-header"
              className="px-6 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#C62828] to-[#A91D1D] flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                {selectedConv.conversationType === 'group'
                  ? <Users size={16} className="text-white" />
                  : <MessageCircle size={16} className="text-white" />
                }
              </div>
              <div>
                <p className="font-semibold text-white">{conversationLabel(selectedConv)}</p>
                <p className="text-xs text-white/70">
                  {selectedConv.conversationType === 'group' ? t('chat.conversation.typeGroup') : t('chat.conversation.typeDirect')}
                </p>
              </div>
            </div>

            {/* Messages: bg-[#F8FAFC] */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-[#F8FAFC]">
              {messages.length === 0 ? (
                <div className="flex justify-center py-8">
                  <p className="text-sm text-[#64748B]">{t('chat.conversation.empty')}</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isOwn = !!userId && msg.senderId === userId
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
                        <div className={`px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
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
              <div aria-live="polite" className="min-h-5 px-4 pb-1">
                {typingText && (
                  <p data-testid="typing-indicator" className="text-xs italic text-[#64748B]">
                    {typingText}
                  </p>
                )}
              </div>
              <form onSubmit={handleSend} className="space-y-1.5">
                {chatError && (
                  <p
                    role="alert"
                    data-testid="chat-error"
                    className="px-3 py-2 text-sm text-[#C62828] bg-red-50 border border-red-200 rounded-lg"
                  >
                    {chatError}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <input
                    data-testid="message-input"
                    type="text"
                    value={messageInput}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onBlur={stopOwnTyping}
                    placeholder={t('chat.composer.placeholder')}
                    aria-label={t('chat.composer.label')}
                    aria-invalid={tooLong}
                    aria-describedby={describedBy}
                    className={`flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A] ${
                      tooLong ? 'border-[#C62828]' : 'border-[#E2E8F0]'
                    }`}
                  />
                  <button
                    data-testid="send-btn"
                    type="submit"
                    disabled={!canSend}
                    aria-busy={sending || undefined}
                    className="p-2 bg-[#C62828] text-white rounded-full hover:bg-[#A91D1D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label={t('chat.composer.send')}
                  >
                    <Send size={18} />
                  </button>
                </div>
                <div className="flex items-start justify-between gap-3 px-4 text-xs">
                  {tooLong ? (
                    <p id="message-length-error" data-testid="message-length-error" aria-live="polite" className="text-[#C62828]">
                      {t('errors.chat.message_too_long', { max: CHAT_MAX_MESSAGE_LENGTH })}
                    </p>
                  ) : (
                    <span />
                  )}
                  <span
                    id="message-counter"
                    data-testid="message-counter"
                    className={tooLong ? 'font-medium text-[#C62828]' : 'text-[#64748B]'}
                  >
                    {content.length}/{CHAT_MAX_MESSAGE_LENGTH}
                  </span>
                </div>
              </form>
            </div>
          </>
        )}
      </div>

      {showNewConv && (
        <NewConversationModal
          onClose={() => setShowNewConv(false)}
          onOpened={handleOpened}
        />
      )}
    </div>
  )
}
