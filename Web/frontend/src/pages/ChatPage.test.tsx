import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configure, render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { io } from 'socket.io-client'
import { toast } from 'sonner'
import { ChatPage } from './ChatPage'

type Handler = (...args: unknown[]) => void

// socket.io-client stand-in: records emits (with their ack callbacks) and lets a test fire
// server events such as 'connect', 'chat:message', 'chat:typing' and 'chat:read'
const socket = vi.hoisted(() => {
  const handlers = new Map<string, Handler[]>()
  return {
    connected: true,
    // socket.io-client: true while it reconnects by itself (a refused handshake leaves it false)
    active: false,
    // The handshake payload, set by the session handling (src/lib/socketSession.ts)
    auth: undefined as unknown,
    handlers,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, (handlers.get(event) ?? []).filter((each) => each !== handler))
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
})

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
// The session side of the api client: the stored access token (cleared when a refresh is
// refused), the shared refresh and the sign-out that AuthContext listens to
const auth = vi.hoisted(() => ({
  token: 'mock-token' as string | null,
  refreshAccessToken: vi.fn(),
  signOutSession: vi.fn(),
}))
vi.mock('@/api/client', () => ({
  default: api,
  getAccessToken: vi.fn(() => auth.token),
  refreshAccessToken: auth.refreshAccessToken,
  signOutSession: auth.signOutSession,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-1' }, isAuthenticated: true })),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Searching people is debounced: give a busy machine (coverage, parallel runs) time
configure({ asyncUtilTimeout: 5_000 })

// GET /chat/conversations rows (Web/backend/src/chat/chat.service.ts listConversations):
// participants are everyone except the caller
const conversations = () => [
  {
    id: 'conv-1',
    title: 'Nhóm trực ban',
    conversationType: 'group',
    createdAt: '2024-01-01T00:00:00Z',
    lastMessage: 'Xin chào!',
    lastMessageAt: '2024-01-02T08:00:00Z',
    participants: [
      { id: 'user-2', fullName: 'Nguyễn Văn A', username: 'nva' },
      { id: 'user-3', fullName: 'Trần Thị B', username: 'ttb' },
    ],
    unreadCount: server.unread['conv-1'] ?? 0,
  },
  {
    id: 'conv-2',
    title: null,
    conversationType: 'direct',
    createdAt: '2024-01-03T00:00:00Z',
    lastMessage: null,
    lastMessageAt: null,
    participants: [{ id: 'user-4', fullName: 'Lê Văn Cường', username: 'lvc' }],
    unreadCount: server.unread['conv-2'] ?? 0,
  },
  {
    id: 'conv-3',
    title: null,
    conversationType: 'group',
    createdAt: '2024-01-04T00:00:00Z',
    lastMessage: null,
    lastMessageAt: null,
    participants: [
      { id: 'user-2', fullName: 'Nguyễn Văn A', username: 'nva' },
      { id: 'user-3', fullName: 'Trần Thị B', username: 'ttb' },
    ],
    unreadCount: 0,
  },
]

const mockMessages = {
  data: [
    { id: 'msg-1', senderId: 'user-2', senderName: 'nva', content: 'Xin chào!', createdAt: '2024-01-02T07:58:00Z' },
    { id: 'msg-2', senderId: 'user-1', senderName: 'toi', content: 'Chào bạn!', createdAt: '2024-01-02T08:00:00Z' },
  ],
  total: 2,
  page: 1,
  limit: 50,
}

// What ChatService.saveMessage returns (socket ack and REST response alike)
const savedMessage = (content: string, id = 'msg-9', patch: Record<string, unknown> = {}) => ({
  id,
  conversationId: 'conv-1',
  senderId: 'user-1',
  senderName: 'toi',
  content,
  createdAt: new Date().toISOString(),
  ...patch,
})

// GET /users/search rows (Web/backend/src/users/users.service.ts searchUsers): active people the
// caller may reach, never the caller
const directory = [
  { id: 'user-4', username: 'lvc', fullName: 'Lê Văn Cường', role: 'dqtv_member', roles: ['dqtv_member'], status: 'active' },
  { id: 'user-5', username: 'nvhung', fullName: 'Nguyễn Văn Hùng', role: 'dqtv_member', roles: ['dqtv_member'], status: 'active' },
  { id: 'user-6', username: 'ttlan', fullName: 'Trần Thị Lan', role: 'office_staff', roles: ['office_staff'], status: 'active' },
]

type CreateBody = { title?: string; participantIds: string[]; conversationType: 'direct' | 'group' }

// POST /chat/conversations answer (chat.controller.ts createConversation): the conversation as
// the caller's list shows it, 201 when it was created
const openedConversation = (body: CreateBody) => ({
  id: 'conv-9',
  title: body.title ?? null,
  conversationType: body.conversationType,
  createdAt: '2024-01-05T00:00:00Z',
  lastMessage: null,
  lastMessageAt: null,
  participants: directory
    .filter((person) => body.participantIds.includes(person.id))
    .map(({ id, fullName, username }) => ({ id, fullName, username })),
  unreadCount: 0,
})

const server = {
  restSend: (body: { content: string }): Promise<unknown> => Promise.resolve({ data: savedMessage(body.content) }),
  unread: {} as Record<string, number>,
  createConversation: (body: CreateBody): Promise<unknown> => Promise.resolve({ status: 201, data: openedConversation(body) }),
  // GET /chat/conversations never answers while set: shows what the page does before a reload lands
  holdList: false,
}

// staleTime as in App.tsx, so a conversation opened again within 30 s is served from the cache
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ChatPage />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

function emitsOf(event: string) {
  return socket.emit.mock.calls.filter(([name]) => name === event)
}

function postsTo(url: string) {
  return api.post.mock.calls.filter(([u]) => u === url).length
}

const conversationListCalls = () => api.get.mock.calls.filter(([url]) => url === '/chat/conversations').length

function lastAck(event: string): (response: unknown) => void {
  const calls = emitsOf(event)
  const ack = calls[calls.length - 1]?.[2]
  if (typeof ack !== 'function') throw new Error(`no acknowledgement callback for ${event}`)
  return ack as (response: unknown) => void
}

function fireServerEvent(event: string, payload?: unknown) {
  act(() => {
    for (const handler of socket.handlers.get(event) ?? []) handler(payload)
  })
}

async function openConversation(id = 'conv-1') {
  renderPage()
  fireEvent.click(await screen.findByTestId(`conv-item-${id}`))
  const input = await screen.findByTestId('message-input')
  // The page's first connect has its own test; later tests count the reconnects
  socket.connect.mockClear()
  return input
}

async function typeAndSend(text: string) {
  const input = await openConversation()
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(screen.getByTestId('send-btn'))
  return input
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    socket.connected = true
    socket.active = false
    socket.auth = undefined
    socket.handlers.clear()
    auth.token = 'mock-token'
    auth.refreshAccessToken.mockResolvedValue('fresh-token')
    server.unread = { 'conv-1': 3, 'conv-2': 0, 'conv-3': 0 }
    server.restSend = (body) => Promise.resolve({ data: savedMessage(body.content) })
    server.createConversation = (body) => Promise.resolve({ status: 201, data: openedConversation(body) })
    server.holdList = false
    api.get.mockImplementation((url: string, config?: { params?: { q?: string } }) => {
      if (url === '/chat/conversations') {
        return server.holdList ? new Promise(() => undefined) : Promise.resolve({ data: conversations() })
      }
      if (url.includes('/messages')) return Promise.resolve({ data: mockMessages })
      if (url === '/users/search') {
        const q = (config?.params?.q ?? '').toLowerCase()
        return Promise.resolve({
          data: directory.filter((person) => person.fullName.toLowerCase().includes(q) || person.username.includes(q)),
        })
      }
      return Promise.resolve({ data: [] })
    })
    api.post.mockImplementation((url: string, body?: unknown) => {
      const read = /^\/chat\/conversations\/([^/]+)\/read$/.exec(url)
      if (read) return Promise.resolve({ data: { conversationId: read[1], readAt: new Date().toISOString() } })
      if (url.endsWith('/messages')) return server.restSend(body as { content: string })
      if (url === '/chat/conversations') return server.createConversation(body as CreateBody)
      return Promise.reject(new Error(`unexpected POST ${url}`))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders chat page', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('chat-page')).toBeInTheDocument())
    expect(screen.getByText('Tin nhắn')).toBeInTheDocument()
  })

  it('shows empty state prompt when no conversations', async () => {
    api.get.mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('Chưa có cuộc trò chuyện nào')).toBeInTheDocument())
  })

  it('loads messages when conversation selected', async () => {
    await openConversation()
    await waitFor(() => expect(screen.getAllByTestId('message-item').length).toBeGreaterThan(0))
  })

  describe('conversation list', () => {
    it('keeps the title of a titled conversation', async () => {
      renderPage()
      expect(await screen.findByTestId('conv-item-conv-1')).toHaveTextContent('Nhóm trực ban')
    })

    it('names an untitled direct conversation after the other participant', async () => {
      renderPage()
      expect(await screen.findByTestId('conv-item-conv-2')).toHaveTextContent('Lê Văn Cường')

      fireEvent.click(screen.getByTestId('conv-item-conv-2'))

      expect(within(await screen.findByTestId('chat-header')).getByText('Lê Văn Cường')).toBeInTheDocument()
    })

    it('names an untitled group after its participants', async () => {
      renderPage()
      expect(await screen.findByTestId('conv-item-conv-3')).toHaveTextContent('Nguyễn Văn A, Trần Thị B')
    })

    it('shows the unread count of each conversation', async () => {
      renderPage()

      const badge = await screen.findByTestId('unread-badge-conv-1')
      expect(badge).toHaveTextContent('3')
      expect(badge).toHaveAccessibleName('3 tin nhắn chưa đọc')
      expect(screen.queryByTestId('unread-badge-conv-2')).not.toBeInTheDocument()
    })
  })

  describe('read state', () => {
    it('marks a conversation read with POST /chat/conversations/:id/read when it is opened', async () => {
      await openConversation('conv-1')

      await waitFor(() => expect(postsTo('/chat/conversations/conv-1/read')).toBe(1))
      await waitFor(() => expect(screen.queryByTestId('unread-badge-conv-1')).not.toBeInTheDocument())
    })

    it('marks it read again when someone else writes while it is open', async () => {
      await openConversation('conv-1')
      await waitFor(() => expect(postsTo('/chat/conversations/conv-1/read')).toBe(1))

      fireServerEvent('chat:message', savedMessage('Có ai không?', 'msg-20', { senderId: 'user-2', senderName: 'nva' }))

      expect(await screen.findByText('Có ai không?')).toBeInTheDocument()
      await waitFor(() => expect(postsTo('/chat/conversations/conv-1/read')).toBe(2))
    })

    it('does not mark read again for the user’s own message', async () => {
      await openConversation('conv-1')
      await waitFor(() => expect(postsTo('/chat/conversations/conv-1/read')).toBe(1))

      fireServerEvent('chat:message', savedMessage('Tin của tôi', 'msg-21'))
      await screen.findByText('Tin của tôi')

      expect(postsTo('/chat/conversations/conv-1/read')).toBe(1)
    })

    it('reloads the unread counts from the server when the same user reads a conversation elsewhere', async () => {
      renderPage()
      await screen.findByTestId('unread-badge-conv-1')
      const before = conversationListCalls()
      server.unread['conv-1'] = 0

      fireServerEvent('chat:read', { conversationId: 'conv-1', userId: 'user-1', readAt: new Date().toISOString() })

      await waitFor(() => expect(conversationListCalls()).toBeGreaterThan(before))
      await waitFor(() => expect(screen.queryByTestId('unread-badge-conv-1')).not.toBeInTheDocument())
    })

    it('reloads the unread counts when a message arrives in a conversation that is not open', async () => {
      await openConversation('conv-1')
      server.unread['conv-2'] = 4

      fireServerEvent('chat:message', savedMessage('Ở phòng khác', 'msg-40', { senderId: 'user-4', conversationId: 'conv-2' }))

      expect(await screen.findByTestId('unread-badge-conv-2')).toHaveTextContent('4')
      expect(screen.queryByText('Ở phòng khác')).not.toBeInTheDocument()
    })
  })

  describe('message history cache', () => {
    it('keeps live and sent messages when the user comes back to a conversation', async () => {
      await openConversation('conv-1')
      await screen.findByText('Chào bạn!')

      fireServerEvent('chat:message', savedMessage('Tin trực tiếp', 'msg-30', { senderId: 'user-2', senderName: 'nva' }))
      expect(await screen.findByText('Tin trực tiếp')).toBeInTheDocument()
      fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'Tin đã gửi' } })
      fireEvent.click(screen.getByTestId('send-btn'))
      act(() => lastAck('chat:send')(savedMessage('Tin đã gửi', 'msg-31')))
      expect(await screen.findByText('Tin đã gửi')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('conv-item-conv-2'))
      await waitFor(() => expect(screen.queryByText('Tin trực tiếp')).not.toBeInTheDocument())
      fireEvent.click(screen.getByTestId('conv-item-conv-1'))

      expect(await screen.findByText('Tin trực tiếp')).toBeInTheDocument()
      expect(screen.getByText('Tin đã gửi')).toBeInTheDocument()
    })
  })

  // notifications.gateway.ts:103-111 closes a socket whose access token expired (disconnect(true));
  // socket.io-client does not reconnect after a server-side disconnect by itself
  describe('connection recovery', () => {
    it('refreshes the token, reconnects and rejoins the open room after the server closes the socket', async () => {
      await openConversation('conv-1')
      const joinsBefore = emitsOf('chat:join').length
      socket.connected = false

      fireServerEvent('disconnect', 'io server disconnect')

      await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1))
      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
      expect(auth.refreshAccessToken.mock.invocationCallOrder[0]).toBeLessThan(socket.connect.mock.invocationCallOrder[0])

      socket.connected = true
      fireServerEvent('connect')
      expect(emitsOf('chat:join').length).toBe(joinsBefore + 1)
      expect(emitsOf('chat:join').at(-1)?.[1]).toBe('conv-1')
    })

    it('leaves other disconnects to the reconnection built into socket.io', async () => {
      await openConversation('conv-1')
      socket.connected = false

      fireServerEvent('disconnect', 'transport close')
      await act(async () => {
        await Promise.resolve()
      })

      expect(auth.refreshAccessToken).not.toHaveBeenCalled()
      expect(socket.connect).not.toHaveBeenCalled()
    })

    // Handshakes: the gateway refuses them through connect_error (missing_token, invalid_token,
    // session_revoked, authentication_unavailable); the socket is created without connecting so
    // the session handling sets the handshake token first
    it('connects once the session handling reads the token for each handshake', async () => {
      let handshake: unknown
      socket.connect.mockImplementationOnce(() => {
        const readAuth = socket.auth as ((cb: (data: unknown) => void) => void) | undefined
        readAuth?.((data) => {
          handshake = data
        })
      })

      renderPage()

      await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1))
      expect(vi.mocked(io).mock.calls.at(-1)?.[1]).toMatchObject({ autoConnect: false })
      expect(handshake).toEqual({ token: 'mock-token' })
    })

    it('refreshes the token and reconnects after a handshake refused with invalid_token', async () => {
      await openConversation('conv-1')
      socket.connected = false

      fireServerEvent('connect_error', new Error('invalid_token'))

      await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1))
      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
      expect(auth.refreshAccessToken.mock.invocationCallOrder[0]).toBeLessThan(socket.connect.mock.invocationCallOrder[0])
      expect(auth.signOutSession).not.toHaveBeenCalled()
    })

    it('refreshes once when the session expires and rejoins the open room after the server closes the socket', async () => {
      await openConversation('conv-1')
      const joinsBefore = emitsOf('chat:join').length

      fireServerEvent('session_expired', { reason: 'token_expired' })

      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      // Still connected: the new token waits for the server to close the socket
      expect(socket.connect).not.toHaveBeenCalled()

      socket.connected = false
      fireServerEvent('disconnect', 'io server disconnect')

      await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1))
      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)

      socket.connected = true
      fireServerEvent('connect')
      expect(emitsOf('chat:join').length).toBe(joinsBefore + 1)
      expect(emitsOf('chat:join').at(-1)?.[1]).toBe('conv-1')
    })

    it('signs out and says so when the handshake has no token', async () => {
      await openConversation('conv-1')
      socket.connected = false

      fireServerEvent('connect_error', new Error('missing_token'))

      expect(auth.signOutSession).toHaveBeenCalledWith('session_ended')
      expect(await screen.findByTestId('chat-error')).toHaveTextContent('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
      expect(auth.refreshAccessToken).not.toHaveBeenCalled()
      expect(socket.connect).not.toHaveBeenCalled()
    })

    it('stops handling session signals when the page closes', async () => {
      const { unmount } = renderPage()
      await screen.findByTestId('conv-item-conv-1')

      unmount()

      expect(socket.off).toHaveBeenCalledWith('connect_error', expect.any(Function))
      expect(socket.disconnect).toHaveBeenCalled()
      socket.connected = false
      fireServerEvent('connect_error', new Error('invalid_token'))
      expect(auth.refreshAccessToken).not.toHaveBeenCalled()
    })

    it('explains a session that can no longer be refreshed', async () => {
      // A refused refresh clears the stored tokens (api/client.ts endSession)
      auth.refreshAccessToken.mockImplementationOnce(() => {
        auth.token = null
        return Promise.reject(new Error('refresh_refused'))
      })
      await openConversation('conv-1')
      socket.connected = false

      fireServerEvent('disconnect', 'io server disconnect')

      expect(await screen.findByTestId('chat-error')).toHaveTextContent('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
      expect(socket.connect).not.toHaveBeenCalled()
    })

    it('does not report a join refused for an expired session, which the reconnect repairs', async () => {
      await openConversation()

      act(() => lastAck('chat:join')({ error: 'session_expired' }))
      await act(async () => {
        await Promise.resolve()
      })

      expect(screen.queryByTestId('chat-error')).not.toBeInTheDocument()
    })

    it('sends over REST a message whose socket the server closed before acknowledging it', async () => {
      const input = await typeAndSend('Tin lúc hết phiên')
      expect(emitsOf('chat:send')).toHaveLength(1)
      socket.connected = false

      fireServerEvent('disconnect', 'io server disconnect')

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/chat/conversations/conv-1/messages', { content: 'Tin lúc hết phiên' }),
      )
      expect(await screen.findByText('Tin lúc hết phiên')).toBeInTheDocument()
      expect(input).toHaveValue('')
      expect(screen.queryByTestId('chat-error')).not.toBeInTheDocument()
    })

    it('sends over REST when the acknowledgement says the session expired', async () => {
      const input = await typeAndSend('Hello team!')

      act(() => lastAck('chat:send')({ error: 'session_expired' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/chat/conversations/conv-1/messages', { content: 'Hello team!' }))
      expect(await screen.findByText('Hello team!')).toBeInTheDocument()
      expect(input).toHaveValue('')
    })

    it('keeps the draft and asks to check it when the connection drops before the acknowledgement', async () => {
      const input = await typeAndSend('Hello team!')
      socket.connected = false

      fireServerEvent('disconnect', 'transport close')

      expect(await screen.findByTestId('chat-error')).toHaveTextContent('Mất kết nối trước khi máy chủ xác nhận')
      expect(input).toHaveValue('Hello team!')
      expect(postsTo('/chat/conversations/conv-1/messages')).toBe(0)
    })
  })

  describe('rooms', () => {
    it('joins the conversation room with the bare id and waits for the acknowledgement', async () => {
      await openConversation()
      expect(socket.emit).toHaveBeenCalledWith('chat:join', 'conv-1', expect.any(Function))
    })

    it('explains a refused join', async () => {
      await openConversation()
      act(() => lastAck('chat:join')({ error: 'not_a_participant' }))
      expect(await screen.findByTestId('chat-error')).toHaveTextContent('Bạn không phải thành viên của cuộc trò chuyện này')
    })

    it('leaves the previous room with chat:leave before joining the next one', async () => {
      await openConversation('conv-1')

      fireEvent.click(screen.getByTestId('conv-item-conv-2'))

      await waitFor(() => expect(socket.emit).toHaveBeenCalledWith('chat:leave', 'conv-1'))
      const names = socket.emit.mock.calls.map(([name, id]) => `${name}:${id}`)
      expect(names.indexOf('chat:leave:conv-1')).toBeLessThan(names.indexOf('chat:join:conv-2'))
    })

    it('joins the open conversation again after the socket reconnects', async () => {
      await openConversation()
      const joinsBefore = emitsOf('chat:join').length

      fireServerEvent('connect')

      expect(emitsOf('chat:join').length).toBe(joinsBefore + 1)
      expect(emitsOf('chat:join').at(-1)?.[1]).toBe('conv-1')
    })
  })

  describe('typing', () => {
    it('signals typing_start once while typing and typing_stop after a pause', async () => {
      const input = await openConversation()
      vi.useFakeTimers()

      fireEvent.change(input, { target: { value: 'X' } })
      fireEvent.change(input, { target: { value: 'Xi' } })

      expect(emitsOf('typing_start').map(([, id]) => id)).toEqual(['conv-1'])
      expect(emitsOf('typing_stop')).toHaveLength(0)

      act(() => {
        vi.advanceTimersByTime(3_000)
      })

      expect(emitsOf('typing_stop').map(([, id]) => id)).toEqual(['conv-1'])
    })

    // The receiver drops a typing signal after 5 s (TYPING_EXPIRE_MS)
    it('repeats typing_start every 3 seconds while the user keeps typing', async () => {
      const input = await openConversation()
      vi.useFakeTimers()

      fireEvent.change(input, { target: { value: 'X' } })
      act(() => {
        vi.advanceTimersByTime(2_000)
      })
      fireEvent.change(input, { target: { value: 'Xi' } })
      expect(emitsOf('typing_start')).toHaveLength(1)

      act(() => {
        vi.advanceTimersByTime(1_500)
      })
      fireEvent.change(input, { target: { value: 'Xin' } })

      expect(emitsOf('typing_start').map(([, id]) => id)).toEqual(['conv-1', 'conv-1'])
      expect(emitsOf('typing_stop')).toHaveLength(0)
    })

    // typing_start before the join is acknowledged is refused with not_joined (gateway.ts:194)
    it('signals typing again once the room join is acknowledged', async () => {
      const input = await openConversation()
      fireEvent.change(input, { target: { value: 'X' } })
      expect(emitsOf('typing_start')).toHaveLength(1)

      act(() => lastAck('chat:join')({ joined: 'conv-1' }))

      await waitFor(() => expect(emitsOf('typing_start').map(([, id]) => id)).toEqual(['conv-1', 'conv-1']))
    })

    it('stops typing when the message is sent', async () => {
      await typeAndSend('Hello team!')
      expect(emitsOf('typing_stop').map(([, id]) => id)).toEqual(['conv-1'])
    })

    it('shows who is typing in the open conversation', async () => {
      await openConversation('conv-1')

      fireServerEvent('chat:typing', { conversationId: 'conv-1', userId: 'user-2', typing: true })
      expect(screen.getByTestId('typing-indicator')).toHaveTextContent('Nguyễn Văn A đang nhập…')

      fireServerEvent('chat:typing', { conversationId: 'conv-1', userId: 'user-2', typing: false })
      expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()
    })

    it('ignores typing in other conversations', async () => {
      await openConversation('conv-1')
      fireServerEvent('chat:typing', { conversationId: 'conv-2', userId: 'user-4', typing: true })
      expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()
    })

    it('hides a typing indicator that is never stopped', async () => {
      await openConversation('conv-1')
      vi.useFakeTimers()

      fireServerEvent('chat:typing', { conversationId: 'conv-1', userId: 'user-2', typing: true })
      expect(screen.getByTestId('typing-indicator')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(6_000)
      })

      expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()
    })
  })

  describe('sending over the socket', () => {
    it('emits chat:send and shows the saved message from the acknowledgement', async () => {
      const input = await typeAndSend('Hello team!')

      expect(socket.emit).toHaveBeenCalledWith(
        'chat:send',
        { conversationId: 'conv-1', content: 'Hello team!' },
        expect.any(Function),
      )
      expect(screen.getByTestId('send-btn')).toBeDisabled()

      act(() => lastAck('chat:send')(savedMessage('Hello team!')))

      expect(await screen.findByText('Hello team!')).toBeInTheDocument()
      expect(input).toHaveValue('')
      expect(postsTo('/chat/conversations/conv-1/messages')).toBe(0)
    })

    it('shows a message once when the room broadcast repeats the acknowledged message', async () => {
      await typeAndSend('Hello team!')
      act(() => lastAck('chat:send')(savedMessage('Hello team!')))
      await screen.findByText('Hello team!')

      fireServerEvent('chat:message', savedMessage('Hello team!'))

      expect(screen.getAllByText('Hello team!')).toHaveLength(1)
    })

    it('trims the content before sending', async () => {
      await typeAndSend('   Xin chào   ')
      expect(emitsOf('chat:send').at(-1)?.[1]).toEqual({ conversationId: 'conv-1', content: 'Xin chào' })
    })

    it.each([
      ['not_a_participant', 'Bạn không phải thành viên của cuộc trò chuyện này'],
      ['unauthenticated', 'Kết nối chưa được xác thực. Vui lòng tải lại trang hoặc đăng nhập lại.'],
      ['invalid_conversation_id', 'Cuộc trò chuyện không hợp lệ'],
      ['message_too_long', 'Tin nhắn không được vượt quá 4000 ký tự'],
      ['message_content_required', 'Vui lòng nhập nội dung tin nhắn'],
      ['something_unexpected', 'Không thể gửi tin nhắn. Vui lòng thử lại.'],
    ])('explains the acknowledgement error %s and keeps the draft', async (code, message) => {
      const input = await typeAndSend('Hello team!')

      act(() => lastAck('chat:send')({ error: code }))

      expect(await screen.findByTestId('chat-error')).toHaveTextContent(message)
      expect(input).toHaveValue('Hello team!')
      expect(screen.getByTestId('send-btn')).toBeEnabled()
    })

    it('reports a send the server never acknowledges', async () => {
      const input = await openConversation()
      fireEvent.change(input, { target: { value: 'Hello team!' } })

      vi.useFakeTimers()
      fireEvent.click(screen.getByTestId('send-btn'))
      await act(async () => {
        vi.advanceTimersByTime(10_000)
      })

      expect(screen.getByTestId('chat-error')).toHaveTextContent('Máy chủ không phản hồi. Vui lòng thử lại.')
      expect(input).toHaveValue('Hello team!')
    })
  })

  describe('sending over REST', () => {
    it('posts to /chat/conversations/:id/messages when there is no live socket', async () => {
      socket.connected = false

      const input = await typeAndSend('Hello REST')

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/chat/conversations/conv-1/messages', { content: 'Hello REST' }),
      )
      expect(await screen.findByText('Hello REST')).toBeInTheDocument()
      expect(input).toHaveValue('')
      expect(emitsOf('chat:send')).toHaveLength(0)
    })

    it('explains a refused REST send', async () => {
      socket.connected = false
      server.restSend = () => Promise.reject({ response: { status: 403, data: { message: 'not_a_participant' } } })

      await typeAndSend('Hello REST')

      expect(await screen.findByTestId('chat-error')).toHaveTextContent('Bạn không phải thành viên của cuộc trò chuyện này')
    })
  })

  describe('4000-character maximum', () => {
    it('counts characters and allows exactly 4000', async () => {
      const input = await openConversation()
      fireEvent.change(input, { target: { value: 'a'.repeat(4000) } })

      expect(screen.getByTestId('message-counter')).toHaveTextContent('4000/4000')
      expect(screen.getByTestId('send-btn')).toBeEnabled()
      expect(input).toHaveAttribute('aria-invalid', 'false')
    })

    it('blocks a longer message and says why', async () => {
      const input = await openConversation()
      fireEvent.change(input, { target: { value: 'a'.repeat(4001) } })

      expect(screen.getByTestId('message-counter')).toHaveTextContent('4001/4000')
      expect(screen.getByTestId('message-length-error')).toHaveTextContent('Tin nhắn không được vượt quá 4000 ký tự')
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByTestId('send-btn')).toBeDisabled()

      fireEvent.submit(input.closest('form')!)
      expect(emitsOf('chat:send')).toHaveLength(0)
      expect(postsTo('/chat/conversations/conv-1/messages')).toBe(0)
    })
  })

  // The dialog picks people from GET /users/search (q of 2–100 characters once trimmed, only
  // people the caller may reach) and opens POST /chat/conversations: 201 with a new
  // conversation, 200 with the pair's existing direct conversation
  describe('new conversation dialog', () => {
    const HINT = 'Nhập ít nhất 2 ký tự để tìm người'

    async function openDialog() {
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Tạo cuộc trò chuyện mới' }))
      return screen.getByRole('dialog', { name: 'Cuộc trò chuyện mới' })
    }

    const searchCalls = () => api.get.mock.calls.filter(([url]) => url === '/users/search')
    const createBody = () => api.post.mock.calls.find(([url]) => url === '/chat/conversations')?.[1]
    const pastDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)))

    function typeSearch(dialog: HTMLElement, text: string) {
      fireEvent.change(within(dialog).getByTestId('smart-select-participants-input'), { target: { value: text } })
    }

    async function pick(dialog: HTMLElement, text: string, name: string) {
      typeSearch(dialog, text)
      fireEvent.click(await within(dialog).findByRole('option', { name: new RegExp(name) }))
      await within(dialog).findByRole('button', { name: `Bỏ ${name}` })
    }

    it('labels its fields and says how to search', async () => {
      const dialog = await openDialog()

      expect(within(dialog).getByRole('heading', { name: 'Cuộc trò chuyện mới' })).toBeInTheDocument()
      expect(within(dialog).getByText('Tên nhóm (tuỳ chọn)')).toBeInTheDocument()
      expect(within(dialog).getByPlaceholderText('Để trống cho chat 1-1...')).toBeInTheDocument()
      expect(within(dialog).getByText('Thành viên')).toBeInTheDocument()
      expect(within(dialog).getByTestId('smart-select-participants-input')).toHaveAttribute(
        'placeholder',
        'Tìm theo họ tên hoặc tên đăng nhập...',
      )
      expect(within(dialog).getByText(HINT)).toBeInTheDocument()
      expect(within(dialog).getByTestId('create-conv-submit')).toHaveTextContent('Tạo')
    })

    it('searches people only once the trimmed text has 2 characters', async () => {
      const dialog = await openDialog()

      typeSearch(dialog, ' N ')
      await pastDebounce()
      expect(searchCalls()).toHaveLength(0)
      expect(within(dialog).getByText(HINT)).toBeInTheDocument()

      typeSearch(dialog, ' Ng ')

      expect(await within(dialog).findByRole('option', { name: /Nguyễn Văn Hùng/ })).toBeInTheDocument()
      expect(searchCalls().at(-1)).toEqual(['/users/search', { params: { q: 'Ng', limit: 20 } }])
      expect(within(dialog).queryByText(HINT)).not.toBeInTheDocument()
    })

    it('asks for at least one member and sends nothing', async () => {
      const dialog = await openDialog()

      fireEvent.click(within(dialog).getByTestId('create-conv-submit'))

      expect(toast.error).toHaveBeenCalledWith('Nhập ít nhất một thành viên')
      expect(postsTo('/chat/conversations')).toBe(0)
    })

    it('creates a direct conversation with the person picked and opens it', async () => {
      const dialog = await openDialog()

      await pick(dialog, 'Hùng', 'Nguyễn Văn Hùng')
      fireEvent.click(within(dialog).getByTestId('create-conv-submit'))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã tạo cuộc trò chuyện'))
      expect(createBody()).toEqual({ participantIds: ['user-5'], conversationType: 'direct' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const header = await screen.findByTestId('chat-header')
      expect(within(header).getByText('Nguyễn Văn Hùng')).toBeInTheDocument()
      expect(within(header).getByText('Chat riêng')).toBeInTheDocument()
    })

    it('creates a group of the people still picked and never offers a person twice', async () => {
      const dialog = await openDialog()
      fireEvent.change(within(dialog).getByPlaceholderText('Để trống cho chat 1-1...'), { target: { value: '  Tổ trực  ' } })

      await pick(dialog, 'Hùng', 'Nguyễn Văn Hùng')
      typeSearch(dialog, 'ng')
      const cuong = await within(dialog).findByRole('option', { name: /Lê Văn Cường/ })
      expect(within(dialog).queryByRole('option', { name: /Nguyễn Văn Hùng/ })).not.toBeInTheDocument()
      fireEvent.click(cuong)
      await pick(dialog, 'Lan', 'Trần Thị Lan')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Bỏ Lê Văn Cường' }))
      fireEvent.click(within(dialog).getByTestId('create-conv-submit'))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã tạo cuộc trò chuyện'))
      expect(createBody()).toEqual({ title: 'Tổ trực', participantIds: ['user-5', 'user-6'], conversationType: 'group' })
      const header = await screen.findByTestId('chat-header')
      expect(within(header).getByText('Tổ trực')).toBeInTheDocument()
      expect(within(header).getByText('Nhóm')).toBeInTheDocument()
    })

    it('opens the existing direct conversation of the pair instead of a new one', async () => {
      server.createConversation = () => Promise.resolve({ status: 200, data: conversations()[1] })
      const dialog = await openDialog()

      await pick(dialog, 'Cường', 'Lê Văn Cường')
      fireEvent.click(within(dialog).getByTestId('create-conv-submit'))

      await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Đã mở lại cuộc trò chuyện sẵn có với người này'))
      expect(toast.success).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByTestId('conv-item-conv-2')).toHaveAttribute('aria-current', 'true')
    })

    const listedIds = () => screen.getAllByTestId(/^conv-item-/).map((item) => item.dataset.testid)

    it('lists a new conversation first at once, without waiting for the list to reload', async () => {
      const dialog = await openDialog()
      await pick(dialog, 'Hùng', 'Nguyễn Văn Hùng')
      server.holdList = true

      fireEvent.click(within(dialog).getByTestId('create-conv-submit'))

      const item = await screen.findByTestId('conv-item-conv-9')
      expect(item).toHaveTextContent('Nguyễn Văn Hùng')
      expect(item).toHaveAttribute('aria-current', 'true')
      expect(listedIds()).toEqual(['conv-item-conv-9', 'conv-item-conv-1', 'conv-item-conv-2', 'conv-item-conv-3'])
    })

    it('updates the existing direct conversation in place instead of listing it twice', async () => {
      server.createConversation = () =>
        Promise.resolve({
          status: 200,
          data: { ...conversations()[1], lastMessage: 'Hẹn gặp lúc 8 giờ', lastMessageAt: '2024-01-06T01:00:00Z' },
        })
      const dialog = await openDialog()
      await pick(dialog, 'Cường', 'Lê Văn Cường')
      server.holdList = true

      fireEvent.click(within(dialog).getByTestId('create-conv-submit'))

      await waitFor(() => expect(screen.getByTestId('conv-item-conv-2')).toHaveTextContent('Hẹn gặp lúc 8 giờ'))
      expect(screen.getByTestId('conv-item-conv-2')).toHaveAttribute('aria-current', 'true')
      expect(listedIds()).toEqual(['conv-item-conv-1', 'conv-item-conv-2', 'conv-item-conv-3'])
    })

    it.each([
      [
        'a person outside the contact scope',
        { response: { status: 400, data: { message: 'participant_not_found', statusCode: 400 } } },
        'Có người được chọn nằm ngoài phạm vi liên lạc của bạn. Vui lòng chọn lại.',
      ],
      ['any other failure', { response: { status: 500, data: { message: 'internal_error', statusCode: 500 } } }, 'Không thể tạo cuộc trò chuyện'],
    ])('explains %s and keeps the people picked', async (_case, error, message) => {
      server.createConversation = () => Promise.reject(error)
      const dialog = await openDialog()

      await pick(dialog, 'Hùng', 'Nguyễn Văn Hùng')
      fireEvent.click(within(dialog).getByTestId('create-conv-submit'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Bỏ Nguyễn Văn Hùng' })).toBeInTheDocument()
    })

    it.each([['Đóng'], ['Hủy']])('closes with the %s button', async (name) => {
      const dialog = await openDialog()

      fireEvent.click(within(dialog).getByRole('button', { name }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('texts', () => {
    const person = (id: string, username: string) => ({ id, fullName: null, username })
    const untitled = (id: string, conversationType: 'direct' | 'group', participants: ReturnType<typeof person>[]) => ({
      id,
      title: null,
      conversationType,
      createdAt: '2024-01-01T00:00:00Z',
      lastMessage: null,
      lastMessageAt: null,
      participants,
      unreadCount: 0,
    })

    it('names untitled conversations without participants or with many of them', async () => {
      api.get.mockImplementation((url: string) => {
        if (url === '/chat/conversations') {
          return Promise.resolve({
            data: [
              untitled('conv-5', 'group', ['An', 'Bình', 'Chi', 'Dũng', 'Em'].map((name, i) => person(`u-${i}`, name))),
              untitled('conv-6', 'direct', []),
              untitled('conv-7', 'group', []),
            ],
          })
        }
        return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 50 } })
      })
      renderPage()

      const many = await screen.findByTestId('conv-item-conv-5')
      expect(many).toHaveTextContent('An, Bình, Chi và 2 người khác')
      expect(many).toHaveTextContent('Chưa có tin nhắn')
      expect(screen.getByTestId('conv-item-conv-6')).toHaveTextContent('Chat 1-1')
      expect(screen.getByTestId('conv-item-conv-7')).toHaveTextContent('Nhóm chat')

      fireEvent.click(many)

      expect(await screen.findByText('Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!')).toBeInTheDocument()
      expect(within(screen.getByTestId('chat-header')).getByText('Nhóm')).toBeInTheDocument()
    })

    it('asks to choose a conversation, then labels the message box', async () => {
      renderPage()
      expect(await screen.findByText('← Chọn một cuộc trò chuyện để bắt đầu')).toBeInTheDocument()

      fireEvent.click(await screen.findByTestId('conv-item-conv-1'))

      const input = await screen.findByRole('textbox', { name: 'Nội dung tin nhắn' })
      expect(input).toHaveAttribute('placeholder', 'Nhập tin nhắn...')
      expect(screen.getByRole('button', { name: 'Gửi tin nhắn' })).toBeInTheDocument()
    })

    it('says someone is typing when the typist is not a listed participant', async () => {
      await openConversation('conv-1')

      fireServerEvent('chat:typing', { conversationId: 'conv-1', userId: 'user-99', typing: true })

      expect(screen.getByTestId('typing-indicator')).toHaveTextContent('Có người đang nhập…')
    })

    it('explains a join refused for a reason without its own text', async () => {
      await openConversation()

      act(() => lastAck('chat:join')({ error: 'room_unavailable' }))

      expect(await screen.findByTestId('chat-error')).toHaveTextContent('Không thể tham gia cuộc trò chuyện')
    })

    it('explains a REST send refused as too long with the maximum length', async () => {
      socket.connected = false
      server.restSend = () => Promise.reject({ response: { status: 400, data: { message: 'message_too_long' } } })

      await typeAndSend('Hello REST')

      expect(await screen.findByTestId('chat-error')).toHaveTextContent('Tin nhắn không được vượt quá 4000 ký tự')
    })

    it('falls back to the send failure text when REST gives no known code', async () => {
      socket.connected = false
      server.restSend = () => Promise.reject({ response: { status: 500, data: { message: 'internal_error' } } })

      await typeAndSend('Hello REST')

      expect(await screen.findByTestId('chat-error')).toHaveTextContent('Không thể gửi tin nhắn. Vui lòng thử lại.')
    })
  })
})
