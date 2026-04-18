import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3004', 10);
const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:3001';

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'police-app-bff',
    port: PORT,
    coreApi: CORE_API_URL,
    timestamp: new Date().toISOString(),
  });
});

// Proxy all API + WebSocket traffic to core backend
// BFF: /api/* -> Core: /api/v1/mms_core/*
// IMPORTANT: proxy must be registered BEFORE express.json() to avoid consuming body stream
const proxy = createProxyMiddleware({
  target: CORE_API_URL,
  changeOrigin: true,
  ws: true, // enable WebSocket proxying
  pathRewrite: { '^/': '/api/v1/mms_core/' },
  on: {
    proxyReq: (_proxyReq, req) => {
      console.log(`[BFF:3004] ${req.method} ${req.url} -> ${CORE_API_URL}`);
    },
    proxyRes: (_proxyRes, _req, _res) => {
      // silent
    },
    error: (err, _req, res) => {
      console.error('[BFF:3004] Proxy error:', err);
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
  console.log(`🚔 PoliceApp BFF running on port ${PORT}`);
  console.log(`📍 Core API: ${CORE_API_URL}`);
  console.log(`📍 API base: http://localhost:${PORT}/api/v1/mms_core`);
  console.log(`📍 WebSocket proxy: ws://localhost:${PORT} -> ${CORE_API_URL}`);
});
