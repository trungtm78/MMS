import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { success, paginated, badRequest, notFound } from '../utils/response';
import {
  getConversations,
  getMessages,
  createMessage,
  getOrCreateDirectConversation,
} from '../services/chat.service';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

const sendMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Nội dung không được để trống').max(4000),
    messageType: z.enum(['text', 'image', 'file', 'location']).default('text'),
    metadata: z.record(z.unknown()).optional(),
  }),
});

const createDirectSchema = z.object({
  body: z.object({
    targetUserId: z.string().uuid('userId không hợp lệ'),
  }),
});

// GET /chat/conversations — list conversations for current user
router.get(
  '/conversations',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const conversations = await getConversations(req.user!.id);
      return success(res, conversations);
    } catch (error) {
      console.error('Get conversations error:', error);
      return badRequest(res, 'Không thể tải danh sách hội thoại');
    }
  }
);

// POST /chat/conversations/direct — find or create a direct conversation
router.post(
  '/conversations/direct',
  authMiddleware,
  validate(createDirectSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { targetUserId } = req.body;
      const conversationId = await getOrCreateDirectConversation(
        req.user!.id,
        targetUserId
      );
      return success(res, { conversationId });
    } catch (error) {
      console.error('Create direct conversation error:', error);
      return badRequest(res, 'Không thể tạo hội thoại');
    }
  }
);

// GET /chat/conversations/:id/messages
router.get(
  '/conversations/:id/messages',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit } = req.query;
      const result = await getMessages(
        String(req.params.id),
        req.user!.id,
        {
          page: typeof page === 'string' ? parseInt(page) : 1,
          limit: typeof limit === 'string' ? parseInt(limit) : 50,
        }
      );
      return paginated(
        res,
        result.messages,
        result.total,
        typeof page === 'string' ? parseInt(page) : 1,
        typeof limit === 'string' ? parseInt(limit) : 50
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('quyền')) {
        return notFound(res, error.message);
      }
      console.error('Get messages error:', error);
      return badRequest(res, 'Không thể tải tin nhắn');
    }
  }
);

// POST /chat/conversations/:id/messages — REST fallback for sending
router.post(
  '/conversations/:id/messages',
  authMiddleware,
  validate(sendMessageSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { content, messageType, metadata } = req.body;
      const message = await createMessage(
        String(req.params.id),
        req.user!.id,
        content,
        messageType,
        metadata
      );
      return success(res, message, 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('quyền')) {
        return notFound(res, error.message);
      }
      console.error('Send message error:', error);
      return badRequest(res, 'Không thể gửi tin nhắn');
    }
  }
);

export default router;
