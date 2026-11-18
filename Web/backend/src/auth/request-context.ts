import type { RequestContext } from './auth.service';

export interface ContextRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

// Where a sign-in or MFA request came from, for sessions and audit rows. req.ip is the
// client address once "trust proxy" covers the reverse proxy in front of the API.
export function requestContext(req: ContextRequest): RequestContext {
  const agent = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: (Array.isArray(agent) ? agent[0] : agent) ?? null,
  };
}
