// Central configuration — no hardcoded secrets
export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1/mms_core',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'MMS',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  throttle: {
    ttl: 60_000, // 1 minute
    limit: 100, // requests per ttl
    loginTtl: 300_000, // 5 minutes for login endpoint
    loginLimit: 5, // max login attempts — US-W001 BR: lockout after 5
  },
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
  },
});
