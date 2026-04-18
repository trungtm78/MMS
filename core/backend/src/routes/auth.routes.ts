import { Router, Request, Response } from 'express';
import {
  login,
  refreshAccessToken,
  setupMfa,
  issueMfaTempToken,
  verifyMfaAndLogin,
  verifyRecoveryCodeAndLogin,
} from '../services/auth.service';
import { queryOne } from '../db/pool';
import { validate, authSchemas } from '../middleware/validate';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { success, unauthorized, badRequest, internalError } from '../utils/response';

const router = Router();

// ─── Password login ─────────────────────────────────────────────────────────
// Returns full tokens when MFA not enabled, or tempToken when MFA is required.
router.post(
  '/login',
  validate(authSchemas.login),
  async (req: Request, res: Response) => {
    try {
      const { username, password, device } = req.body;
      const ip = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      const result = await login(username, password, device, ip, userAgent);

      if (!result) {
        return unauthorized(res, 'Sai tên đăng nhập hoặc mật khẩu');
      }

      // MFA enabled → issue temp token for step-2
      if (result.requiresMfa) {
        const tempToken = await issueMfaTempToken(result.userId);
        return success(res, {
          requiresMfa: true,
          tempToken,
          user: result.user,
        });
      }

      // MFA not set up yet → signal Flutter to push to /mfa-setup
      if (result.requiresMfaSetup) {
        const tempToken = await issueMfaTempToken(result.userId);
        return success(res, {
          requiresMfaSetup: true,
          tempToken,
          user: result.user,
        });
      }

      return success(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (error) {
      console.error('Login error:', error);
      return badRequest(res, 'Đăng nhập thất bại');
    }
  }
);

// ─── Refresh token ───────────────────────────────────────────────────────────
router.post(
  '/refresh',
  validate(authSchemas.refresh),
  async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      const ip = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      const result = await refreshAccessToken(refreshToken, ip, userAgent);

      if (!result) {
        return unauthorized(res, 'Token không hợp lệ hoặc đã hết hạn');
      }

      return success(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      return unauthorized(res, 'Làm mới token thất bại');
    }
  }
);

// ─── Logout ──────────────────────────────────────────────────────────────────
router.post('/logout', async (req: Request, res: Response) => {
  return success(res, { message: 'Đăng xuất thành công' });
});

// ─── MFA: Setup (generate secret + QR + recovery codes) ─────────────────────
// Called AFTER password login when requiresMfaSetup=true, using Bearer tempToken logic
// or can be called with a full accessToken from settings page.
router.post(
  '/setup-mfa',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const result = await setupMfa(userId);

      return success(res, {
        secret: result.secret,
        otpauthUrl: result.otpauthUrl,
        recoveryCodes: result.recoveryCodes,
      });
    } catch (error) {
      console.error('Setup MFA error:', error);
      return internalError(res, 'Không thể khởi tạo xác thực 2 bước');
    }
  }
);

// ─── MFA: Verify OTP and complete login ──────────────────────────────────────
router.post(
  '/verify-mfa',
  validate(authSchemas.verifyMfa),
  async (req: Request, res: Response) => {
    try {
      const { tempToken, code } = req.body;
      const ip = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      const result = await verifyMfaAndLogin(tempToken, code, ip, userAgent);

      if (!result) {
        return unauthorized(res, 'Mã OTP không hợp lệ hoặc đã hết hạn');
      }

      const user = await _getUserPublic(result.userId);
      return success(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user,
      });
    } catch (error) {
      console.error('Verify MFA error:', error);
      return internalError(res, 'Xác thực 2 bước thất bại');
    }
  }
);

// ─── MFA: Verify recovery code and complete login ────────────────────────────
router.post(
  '/verify-recovery',
  validate(authSchemas.verifyRecovery),
  async (req: Request, res: Response) => {
    try {
      const { tempToken, recoveryCode } = req.body;
      const ip = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      const result = await verifyRecoveryCodeAndLogin(tempToken, recoveryCode, ip, userAgent);

      if (!result) {
        return unauthorized(res, 'Mã khôi phục không hợp lệ hoặc đã được sử dụng');
      }

      const user = await _getUserPublic(result.userId);
      return success(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user,
      });
    } catch (error) {
      console.error('Verify recovery code error:', error);
      return internalError(res, 'Xác thực mã khôi phục thất bại');
    }
  }
);

// ─── MFA: Confirm setup — verify first OTP after scanning QR ─────────────────
// Called by mfa_setup_screen.dart after showing QR code; uses temp token flow.
router.post(
  '/setup-mfa/confirm',
  validate(authSchemas.verifyMfa),
  async (req: Request, res: Response) => {
    try {
      const { tempToken, code } = req.body;
      const ip = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      // Reuse verifyMfaAndLogin — it enables MFA on first successful verify
      const result = await verifyMfaAndLogin(tempToken, code, ip, userAgent);

      if (!result) {
        return unauthorized(res, 'Mã OTP không hợp lệ. Vui lòng thử lại.');
      }

      const user = await _getUserPublic(result.userId);
      return success(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user,
      });
    } catch (error) {
      console.error('Confirm MFA setup error:', error);
      return internalError(res, 'Xác nhận cài đặt 2 bước thất bại');
    }
  }
);

// ─── Helper: get public user info for response ────────────────────────────────
async function _getUserPublic(userId: string) {
  return queryOne<{
    id: string; username: string; full_name: string; email: string | null;
  }>(
    'SELECT id, username, full_name, email FROM users WHERE id = $1',
    [userId]
  ).then(u => u ? {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    email: u.email,
  } : null);
}

export default router;
