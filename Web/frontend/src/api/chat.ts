// Chat API — Web/backend/src/chat/chat.controller.ts (conversations, history),
// Web/backend/src/notifications/chat-messages.controller.ts (REST twins of chat:send and mark_read)
import { errorCodeText } from '@/lib/api-error'
import client from './client'

/** ChatService.MAX_MESSAGE_LENGTH — the backend counts code points; UTF-16 units here are stricter */
export const CHAT_MAX_MESSAGE_LENGTH = 4000

/** GET /users/search q (users.controller.ts UserSearchQueryDto): 2–100 code points once trimmed */
export const PARTICIPANT_SEARCH_MIN_LENGTH = 2
export const PARTICIPANT_SEARCH_MAX_LENGTH = 100
/** People listed per search in the new-conversation dialog (the API allows 1–50) */
export const PARTICIPANT_SEARCH_LIMIT = 20

/** The q to search people with for the typed text, or null while it is too short to search */
export function participantSearchQuery(text: string): string | null {
  // Cut to the maximum, then trimmed again so the backend's own trim cannot shorten it
  const query = Array.from(text.trim()).slice(0, PARTICIPANT_SEARCH_MAX_LENGTH).join('').trim()
  return Array.from(query).length >= PARTICIPANT_SEARCH_MIN_LENGTH ? query : null
}

export type ConversationType = 'direct' | 'group'

/** Another member of a conversation (the caller is never listed) */
export interface ChatParticipant {
  id: string
  fullName: string | null
  username: string
}

export interface Conversation {
  id: string
  title: string | null
  conversationType: ConversationType
  createdAt: string
  lastMessage: string | null
  lastMessageAt: string | null
  participants: ChatParticipant[]
  /** Messages from others since the caller last read the conversation */
  unreadCount: number
}

/** A stored message; history rows omit conversationId, saved/broadcast messages include it */
export interface ChatMessage {
  id: string
  conversationId?: string
  senderId: string
  senderName?: string
  content: string
  createdAt: string
}

export interface MessagesPage {
  data: ChatMessage[]
  total: number
  page: number
  limit: number
}

export interface CreateConversationBody {
  /** Ids from GET /users/search; anyone outside the caller's contact scope: 400 participant_not_found */
  participantIds: string[]
  title?: string
  conversationType?: ConversationType
}

export interface OpenedConversation {
  conversation: Conversation
  /** false when the pair already had a direct conversation, which is returned instead */
  created: boolean
}

/** Payload of the 'chat:typing' broadcast */
export interface ChatTypingEvent {
  conversationId: string
  userId: string
  typing: boolean
}

/** Payload of the 'chat:read' broadcast */
export interface ChatReadEvent {
  conversationId: string
  userId: string
  readAt: string
}

/**
 * Text of a code returned in a socket acknowledgement ({ error }) or a REST error body, from the
 * error table (errors.chat.<code>); null when the code is not a chat code.
 */
export function chatErrorText(code: string): string | null {
  return errorCodeText('chat', code, { max: CHAT_MAX_MESSAGE_LENGTH })
}

export const chatKeys = {
  conversations: ['chat-conversations'] as const,
  messages: (conversationId: string) => ['chat-messages', conversationId] as const,
}

export const chatApi = {
  // GET /chat/conversations
  listConversations: async (): Promise<Conversation[]> => {
    const response = await client.get<Conversation[]>('/chat/conversations')
    return response.data
  },

  // GET /chat/conversations/:id/messages — newest first
  getMessages: async (conversationId: string, page = 1, limit = 50): Promise<MessagesPage> => {
    const response = await client.get<MessagesPage>(`/chat/conversations/${conversationId}/messages`, {
      params: { page, limit },
    })
    return response.data
  },

  // POST /chat/conversations — 201 with a new conversation, 200 with the pair's existing direct
  // conversation; both shaped like an item of the conversation list
  createConversation: async (body: CreateConversationBody): Promise<OpenedConversation> => {
    const response = await client.post<Conversation>('/chat/conversations', body)
    return { conversation: response.data, created: response.status === 201 }
  },

  // POST /chat/conversations/:id/messages { content } — for clients without a live socket
  sendMessage: async (conversationId: string, content: string): Promise<ChatMessage> => {
    const response = await client.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { content })
    return response.data
  },

  // POST /chat/conversations/:id/read — the server then broadcasts 'chat:read'
  markRead: async (conversationId: string): Promise<{ conversationId: string; readAt: string }> => {
    const response = await client.post<{ conversationId: string; readAt: string }>(
      `/chat/conversations/${conversationId}/read`,
    )
    return response.data
  },
}
