import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { queryOne, queryMany } from '../db/pool';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  permissions: string[];
  unitScopes: { unitId: string; scopeType: string }[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

interface JwtPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        code: 'E001',
        message: 'Token không hợp lệ',
        details: { field: 'authorization' }
      });
    }

    const token = authHeader.substring(7);

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.jwt.accessTokenSecret) as JwtPayload;
    } catch {
      return res.status(401).json({
        code: 'E002',
        message: 'Token đã hết hạn hoặc không hợp lệ',
        details: { field: 'token' }
      });
    }

    // Check if session is still valid
    const session = await queryOne<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM sessions WHERE id = $1 AND expires_at > NOW()',
      [payload.sessionId]
    );

    if (!session || session.revoked_at) {
      return res.status(401).json({
        code: 'E003',
        message: 'Phiên đăng nhập đã hết hạn',
        details: { field: 'session' }
      });
    }

    // Get user with roles and permissions
    const user = await queryOne<AuthUser>(
      `SELECT 
        u.id, u.username, u.full_name, u.email, u.phone, u.status,
        ARRAY_AGG(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL) as roles,
        ARRAY_AGG(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL) as permissions
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.id = $1
      GROUP BY u.id, u.username, u.full_name, u.email, u.phone, u.status`,
      [payload.userId]
    );

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        code: 'E004',
        message: 'Tài khoản không tồn tại hoặc đã bị khóa',
        details: { field: 'account' }
      });
    }

    // Get unit scopes
    const scopes = await queryMany<{ unitId: string; scopeType: string }>(
      `SELECT unit_id as "unitId", scope_type as "scopeType" 
       FROM user_unit_scopes 
       WHERE user_id = $1`,
      [user.id]
    );

    user.unitScopes = scopes;
    req.user = user;

    // Update last seen
    await queryOne(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      code: 'E005',
      message: 'Lỗi xác thực',
      details: {}
    });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  return authMiddleware(req, res, next);
}

export function requireRoles(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'E001',
        message: 'Chưa đăng nhập',
        details: {}
      });
    }

    const hasRole = req.user.roles.some(role => roles.includes(role));
    
    if (!hasRole) {
      return res.status(403).json({
        code: 'E006',
        message: 'Không có quyền truy cập',
        details: { required: roles, current: req.user.roles }
      });
    }

    next();
  };
}

export function requirePermissions(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'E001',
        message: 'Chưa đăng nhập',
        details: {}
      });
    }

    // System admin has all permissions
    if (req.user.roles.includes('system_admin')) {
      return next();
    }

    const hasPermission = permissions.some(perm => 
      req.user!.permissions.includes(perm)
    );
    
    if (!hasPermission) {
      return res.status(403).json({
        code: 'E006',
        message: 'Không có quyền thực hiện thao tác này',
        details: { required: permissions, current: req.user.permissions }
      });
    }

    next();
  };
}
