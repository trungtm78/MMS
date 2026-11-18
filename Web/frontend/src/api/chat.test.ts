import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chatApi, participantSearchQuery, PARTICIPANT_SEARCH_LIMIT, type Conversation } from './chat'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

// GET /users/search?q= takes q of 2–100 characters once trimmed (users.controller.ts
// UserSearchQueryDto; the backend counts code points)
describe('participantSearchQuery', () => {
  it.each([
    ['', null],
    ['N', null],
    ['   N   ', null],
    ['😀', null],
    [' Ng ', 'Ng'],
    ['😀😀', '😀😀'],
    ['a'.repeat(150), 'a'.repeat(100)],
    // Cut to 100 characters, then trimmed again so the backend's own trim changes nothing
    [` ${'a'.repeat(99)} b`, 'a'.repeat(99)],
  ])('turns %j into %j', (text, query) => {
    expect(participantSearchQuery(text)).toBe(query)
  })

  it('asks for one page of at most 20 people', () => {
    expect(PARTICIPANT_SEARCH_LIMIT).toBe(20)
  })
})

// POST /chat/conversations (chat.controller.ts): 201 with a new conversation, 200 with the
// existing direct conversation of the pair, both shaped like an item of the conversation list
describe('chatApi.createConversation', () => {
  const conversation: Conversation = {
    id: 'conv-2',
    title: null,
    conversationType: 'direct',
    createdAt: '2024-01-03T00:00:00Z',
    lastMessage: null,
    lastMessageAt: null,
    participants: [{ id: 'user-4', fullName: 'Lê Văn Cường', username: 'lvc' }],
    unreadCount: 0,
  }
  const body = { participantIds: ['user-4'], conversationType: 'direct' as const }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [201, true],
    [200, false],
  ])('answers %i as created: %s', async (status, created) => {
    api.post.mockResolvedValue({ status, data: conversation })

    await expect(chatApi.createConversation(body)).resolves.toStrictEqual({ conversation, created })
    expect(api.post).toHaveBeenCalledWith('/chat/conversations', body)
  })
})
