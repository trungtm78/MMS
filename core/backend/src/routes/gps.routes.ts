import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requireRoles, requirePermissions } from '../middleware/auth';
import { success, badRequest } from '../utils/response';
import { upsertGpsLatest, getTeamGps } from '../services/gps.service';

const router = Router();

/** Validate coordinate range. */
function isValidCoord(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Parse and validate GPS coordinates from request body. Returns error string or coords. */
function parseGpsCoords(body: Record<string, unknown>): { lat: number; lng: number } | { error: string } {
  const lat = body.lat ?? body.latitude;
  const lng = body.lng ?? body.longitude;
  if (lat == null || lng == null) return { error: 'lat/latitude và lng/longitude là bắt buộc' };
  const latNum = parseFloat(String(lat));
  const lngNum = parseFloat(String(lng));
  if (isNaN(latNum) || isNaN(lngNum)) return { error: 'lat và lng phải là số hợp lệ' };
  if (!isValidCoord(latNum, lngNum)) return { error: 'Tọa độ GPS không hợp lệ' };
  return { lat: latNum, lng: lngNum };
}

/** Emit location_update Socket.IO event to CA clients. */
function emitLocationUpdate(req: AuthRequest, lat: number, lng: number, body: Record<string, unknown>): void {
  const io = req.app.get('io');
  if (!io) return;
  io.emit('location_update', {
    userId: req.user!.id,
    fullName: req.user!.fullName,
    lat, lng,
    accuracy: body.accuracy != null ? parseFloat(String(body.accuracy)) : null,
    speed: body.speed != null ? parseFloat(String(body.speed)) : null,
    battery: body.battery != null ? parseInt(String(body.battery)) : null,
    status: 'online',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /gps/update
 * DQTV gửi vị trí GPS. Upsert gps_latest + emit Socket.IO.
 */
router.post(
  '/update',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    try {
      const coords = parseGpsCoords(req.body);
      if ('error' in coords) return badRequest(res, coords.error);

      const { accuracy, speed, heading, battery } = req.body;
      await upsertGpsLatest(req.user!.id, {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: accuracy != null ? parseFloat(accuracy) : undefined,
        speed: speed != null ? parseFloat(speed) : undefined,
        heading: heading != null ? parseFloat(heading) : undefined,
        battery: battery != null ? parseInt(battery) : undefined,
      });

      emitLocationUpdate(req, coords.lat, coords.lng, req.body);
      return success(res, { updated: true, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[GPS] update error:', err);
      return res.status(500).json({ success: false, error: { code: 'E005', message: 'Lỗi cập nhật GPS' } });
    }
  }
);

/**
 * GET /gps/team
 * CA xem snapshot vị trí tất cả DQTV.
 */
router.get(
  '/team',
  authMiddleware,
  requirePermissions('gps:view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { unitId, status } = req.query as { unitId?: string; status?: string };
      const data = await getTeamGps(unitId, status);
      return success(res, data);
    } catch (err) {
      console.error('[GPS] team error:', err);
      return res.status(500).json({ success: false, error: { code: 'E005', message: 'Lỗi lấy GPS team' } });
    }
  }
);

export default router;
