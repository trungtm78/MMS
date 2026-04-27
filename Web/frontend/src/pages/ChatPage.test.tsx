import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ChatPage } from './ChatPage'

// Mock socket.io-client
vi.mock('socket.io-client', () => {
  const emit = vi.fn()
  const on = vi.fn()
  const disconnect = vi.fn()
  const mockSocket = { emit, on, disconnect }
  return {
    io: vi.fn(() => mockSocket),
    __mockSocket: mockSocket,
  }
})

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getAccessToken: vi.fn(() => 'mock-token'),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { sub: 'user-1' }, isAuthenticated: true })),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockConversations = [
  {
    id: 'conv-1',
    title: 'Nhóm trực ban',
    conversationType: 'group',
    createdAt: '2024-01-01T00:00:00Z',
    lastMessage: 'Xin chào!',
    lastMessageAt: '2024-01-02T08:00:00Z',
  },
  {
    id: 'conv-2',
    title: null,
    conversationType: 'direct',
    createdAt: '2024-01-03T00:00:00Z',
    lastMessage: null,
    lastMessageAt: null,
  },
]

const mockMessages = {
  data: [
    { id: 'msg-1', senderId: 'user-2', senderName: 'Nguyễn Văn A', content: 'Xin chào!', createdAt: '2024-01-02T07:58:00Z', conversationId: 'conv-1' },
    { id: 'msg-2', senderId: 'user-1', senderName: 'Tôi', content: 'Chào bạn!', createdAt: '2024-01-02T08:00:00Z', conversationId: 'conv-1' },
  ],
  total: 2,
  page: 1,
  limit: 50,
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ChatPage />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('ChatPage', () => {
  let mockClient: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    const { default: client } = await import('@/api/client')
    mockClient = client as typeof mockClient
    vi.clearAllMocks()
    mockClient.get.mockImplementation((url: string) => {
      if (url === '/chat/conversations') return Promise.resolve({ data: mockConversations })
      if (url.includes('/messages')) return Promise.resolve({ data: mockMessages })
      return Promise.resolve({ data: [] })
    })
  })

  it('renders chat page', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('chat-page')).toBeInTheDocument())
    expect(screen.getByText('Tin nhắn')).toBeInTheDocument()
  })

  it('renders conversation list', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('conv-item-conv-1')).toBeInTheDocument())
    expect(screen.getByText('Nhóm trực ban')).toBeInTheDocument()
    expect(screen.getByTestId('conv-item-conv-2')).toBeInTheDocument()
  })

  it('shows empty state prompt when no conversations', async () => {
    mockClient.get.mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('Chưa có cuộc trò chuyện nào')).toBeInTheDocument())
  })

  it('loads messages when conversation selected', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('conv-item-conv-1'))
    fireEvent.click(screen.getByTestId('conv-item-conv-1'))

    await waitFor(() => expect(screen.getAllByTestId('message-item').length).toBeGreaterThan(0))
  })

  it('shows message input when conversation selected', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('conv-item-conv-1'))
    fireEvent.click(screen.getByTestId('conv-item-conv-1'))

    await waitFor(() => expect(screen.getByTestId('message-input')).toBeInTheDocument())
    expect(screen.getByTestId('send-btn')).toBeInTheDocument()
  })

  it('emits chat:send on form submit', async () => {
    const { io } = await import('socket.io-client')
    const mockIo = io as ReturnType<typeof vi.fn>
    const mockSocket = mockIo()

    renderPage()
    await waitFor(() => screen.getByTestId('conv-item-conv-1'))
    fireEvent.click(screen.getByTestId('conv-item-conv-1'))

    await waitFor(() => screen.getByTestId('message-input'))
    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'Hello team!' } })
    fireEvent.click(screen.getByTestId('send-btn'))

    expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', {
      conversationId: 'conv-1',
      content: 'Hello team!',
    })
  })

  it('opens new conversation modal', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('new-conv-btn'))
    fireEvent.click(screen.getByTestId('new-conv-btn'))
    expect(screen.getByTestId('participant-input')).toBeInTheDocument()
    expect(screen.getByTestId('create-conv-submit')).toBeInTheDocument()
  })

  it('creates conversation via API', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'conv-3', title: null, conversationType: 'direct', createdAt: '', lastMessage: null, lastMessageAt: null } })
    renderPage()
    await waitFor(() => screen.getByTestId('new-conv-btn'))
    fireEvent.click(screen.getByTestId('new-conv-btn'))

    fireEvent.change(screen.getByTestId('participant-input'), { target: { value: 'user-abc-123' } })
    fireEvent.click(screen.getByTestId('create-conv-submit'))

    await waitFor(() => expect(mockClient.post).toHaveBeenCalledWith(
      '/chat/conversations',
      expect.objectContaining({ participantIds: ['user-abc-123'] }),
    ))
  })
})
