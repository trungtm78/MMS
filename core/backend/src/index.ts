import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { testConnection, closePool } from './db/pool';
import { createMessage, markConversationRead } from './services/chat.service';

// Import routes
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import tasksRoutes from './routes/tasks.routes';
import attendanceRoutes from './routes/attendance.routes';
import leaveRoutes from './routes/leave.routes';
import incidentsRoutes from './routes/incidents.routes';
import notificationsRoutes from './routes/notifications.routes';
import kpiRoutes from './routes/kpi.routes';
import chatRoutes from './routes/chat.routes';
import gpsRoutes from './routes/gps.routes';
import alertsRoutes from './routes/alerts.routes';
import reportsRoutes from './routes/reports.routes';

const app = express();
const httpServer = http.createServer(app);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbConnected = await testConnection();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
const API_PREFIX = '/api/v1/mms_core';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/tasks`, tasksRoutes);
app.use(`${API_PREFIX}/attendance`, attendanceRoutes);
app.use(`${API_PREFIX}/leave-requests`, leaveRoutes);
app.use(`${API_PREFIX}/incidents`, incidentsRoutes);
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${API_PREFIX}/kpi`, kpiRoutes);
app.use(`${API_PREFIX}/chat`, chatRoutes);
app.use(`${API_PREFIX}/gps`, gpsRoutes);
app.use(`${API_PREFIX}/alerts`, alertsRoutes);
app.use(`${API_PREFIX}/reports`, reportsRoutes);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Socket.IO setup ──────────────────────────────────────────────────────────
// Expose io on app so routes can emit events (e.g. gps location_update)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  },
  path: '/socket.io',
});

interface SocketUser {
  userId: string;
  username: string;
}

// Authenticate Socket connections using the same JWT
io.use((socket, next) => {
  const token =
    (socket.handshake.auth.token as string | undefined) ||
    (socket.handshake.query.token as string | undefined) ||
    (socket.handshake.headers.authorization?.replace('Bearer ', ''));

  if (!token) {
    return next(new Error('Chưa xác thực'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.accessTokenSecret) as {
      userId: string;
      sessionId: string;
    };
    (socket as typeof socket & { user: SocketUser }).user = {
      userId: payload.userId,
      username: payload.userId, // resolved to full user lazily
    };
    next();
  } catch {
    next(new Error('Token không hợp lệ'));
  }
});

// Make io accessible from routes via req.app.get('io')
app.set('io', io);

io.on('connection', (socket) => {
  const user = (socket as typeof socket & { user: SocketUser }).user;
  console.log(`[WS] Connected: ${user.userId} (${socket.id})`);

  // Join a conversation room
  socket.on('join_conversation', ({ conversationId }: { conversationId: string }) => {
    socket.join(`conv:${conversationId}`);
    console.log(`[WS] ${user.userId} joined conv:${conversationId}`);
  });

  // Leave a conversation room
  socket.on('leave_conversation', ({ conversationId }: { conversationId: string }) => {
    socket.leave(`conv:${conversationId}`);
  });

  // Send a message via WebSocket (real-time path)
  socket.on('send_message', async (data: {
    conversationId: string;
    content: string;
    messageType?: string;
    metadata?: Record<string, unknown>;
  }) => {
    try {
      const message = await createMessage(
        data.conversationId,
        user.userId,
        data.content,
        data.messageType ?? 'text',
        data.metadata
      );
      // Broadcast to all participants in the room (including sender for confirmation)
      io.to(`conv:${data.conversationId}`).emit('new_message', message);
    } catch (err) {
      socket.emit('error', { message: (err as Error).message });
    }
  });

  // Typing indicators
  socket.on('typing_start', ({ conversationId }: { conversationId: string }) => {
    socket.to(`conv:${conversationId}`).emit('user_typing', { userId: user.userId });
  });

  socket.on('typing_stop', ({ conversationId }: { conversationId: string }) => {
    socket.to(`conv:${conversationId}`).emit('user_stopped_typing', { userId: user.userId });
  });

  // Mark messages read
  socket.on('mark_read', async ({ conversationId }: { conversationId: string }) => {
    try {
      await markConversationRead(conversationId, user.userId);
      socket.to(`conv:${conversationId}`).emit('messages_read', {
        conversationId,
        userId: user.userId,
        readAt: new Date().toISOString(),
      });
    } catch { /* ignore */ }
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Disconnected: ${user.userId} (${socket.id})`);
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
async function start() {
  try {
    console.log('Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    httpServer.listen(config.port, () => {
      console.log(`🚀 MMS Core API running on port ${config.port}`);
      console.log(`📍 Health check: http://localhost:${config.port}/health`);
      console.log(`📍 API base URL: http://localhost:${config.port}${API_PREFIX}`);
      console.log(`📍 WebSocket: ws://localhost:${config.port}/socket.io`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  io.close();
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  io.close();
  await closePool();
  process.exit(0);
});

// ─── Prevent process crash from unhandled async exceptions ──────────────────
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] — server stays alive:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION] — server stays alive:', reason);
});

start();
