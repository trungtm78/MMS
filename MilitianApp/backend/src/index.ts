import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3003', 10);
const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:3001';

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'militian-app-bff',
    timestamp: new Date().toISOString(),
  });
});

// Proxy all API + WebSocket traffic to core backend
const proxy = createProxyMiddleware({
  target: CORE_API_URL,
  changeOrigin: true,
  ws: true, // enable WebSocket proxying
  on: {
    proxyReq: (proxyReq, req) => {
      console.log(`[BFF] ${req.method} ${req.url} -> ${CORE_API_URL}${req.url}`);
    },
    proxyRes: (_proxyRes, _req, _res) => {
      // silent
    },
    error: (err, _req, res) => {
      console.error('[BFF] Proxy error:', err);
      (res as express.Response).status(502).json({
        success: false,
        error: { code: 'E011', message: 'Core API unavailable' },
      });
    },
  },
});

app.use('/api', proxy);

// Create HTTP server so we can also upgrade WebSocket connections
const server = http.createServer(app);

// Forward WebSocket upgrade requests (for socket.io)
server.on('upgrade', proxy.upgrade as (...args: unknown[]) => void);

server.listen(PORT, () => {
  console.log(`🚀 MilitianApp BFF running on port ${PORT}`);
  console.log(`📍 Core API: ${CORE_API_URL}`);
  console.log(`📍 WebSocket proxy: ws://localhost:${PORT} -> ${CORE_API_URL}`);
});
