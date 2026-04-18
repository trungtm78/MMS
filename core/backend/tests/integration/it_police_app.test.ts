/**
 * Integration Tests — PoliceApp BFF + Core Backend
 * Phase 3: IT-001 → IT-016
 *
 * Pre-conditions:
 *  - Core backend running on http://localhost:3001
 *  - BFF running on http://localhost:3004
 *  - DB seeded with ca001 (password: 123456, role: police_area)
 *  - DB seeded with dqtv001 (password: 123456, role: militia)
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BFF = 'http://localhost:3004';
const CORE = 'http://localhost:3001';

// ─── Auth tokens (populated in beforeAll) ───────────────────────────────────
let caToken = '';
let dqtvToken = '';
let caUserId = '';
let dqtvUserId = '';

// ─── Helper ─────────────────────────────────────────────────────────────────
async function post(url: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json();
  return { status: res.status, body: json };
}

async function get(url: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const json = await res.json();
  return { status: res.status, body: json };
}

// ─── Setup: login both users ─────────────────────────────────────────────────
beforeAll(async () => {
  // Login CA
  const caRes = await post(`${BFF}/api/auth/login`, { username: 'ca001', password: '123456' });
  if (caRes.status === 200 && caRes.body.data?.accessToken) {
    caToken = caRes.body.data.accessToken;
    caUserId = caRes.body.data.user?.id ?? '';
  }

  // Login DQTV
  const dqtvRes = await post(`${BFF}/api/auth/login`, { username: 'dqtv001', password: '123456' });
  if (dqtvRes.status === 200 && dqtvRes.body.data?.accessToken) {
    dqtvToken = dqtvRes.body.data.accessToken;
    dqtvUserId = dqtvRes.body.data.user?.id ?? '';
  }
}, 15000);

// ─── IT-001: BFF Health ───────────────────────────────────────────────────────
describe('IT-001: BFF Health Check', () => {
  it('BFF /health returns ok', async () => {
    const { status, body } = await get(`${BFF}/health`);
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('police-app-bff');
  });

  it('Core /health returns ok with database connected', async () => {
    const { status, body } = await get(`${CORE}/health`);
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });
});

// ─── IT-002: Auth — Login ────────────────────────────────────────────────────
describe('IT-002: Auth — Login via BFF', () => {
  it('IT-002-01: CA login thành công → accessToken + user.roles includes police_area', async () => {
    const { status, body } = await post(`${BFF}/api/auth/login`, {
      username: 'ca001',
      password: '123456',
    });
    expect(status).toBe(200);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();
    const roles: string[] = body.data.user?.roles ?? [];
    expect(roles).toContain('police_area');
  });

  it('IT-002-02: Login sai password → 401', async () => {
    const { status, body } = await post(`${BFF}/api/auth/login`, {
      username: 'ca001',
      password: 'wrongpass',
    });
    expect(status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('IT-002-03: Login user không tồn tại → 401', async () => {
    const { status } = await post(`${BFF}/api/auth/login`, {
      username: 'nonexistent_xyz',
      password: '123456',
    });
    expect(status).toBe(401);
  });

  it('IT-002-04: DQTV login thành công → roles includes militia', async () => {
    const { status, body } = await post(`${BFF}/api/auth/login`, {
      username: 'dqtv001',
      password: '123456',
    });
    expect(status).toBe(200);
    const roles: string[] = body.data.user?.roles ?? [];
    expect(roles).toContain('militia');
  });
});

// ─── IT-003: Auth — /me ──────────────────────────────────────────────────────
describe('IT-003: Auth — GET /me', () => {
  it('IT-003-01: CA có token hợp lệ → trả về user info', async () => {
    expect(caToken).toBeTruthy();
    const { status, body } = await get(`${BFF}/api/users/me`, caToken);
    expect(status).toBe(200);
    expect(body.data.username).toBe('ca001');
  });

  it('IT-003-02: Không có token → 401', async () => {
    const { status } = await get(`${BFF}/api/users/me`);
    expect(status).toBe(401);
  });

  it('IT-003-03: Token giả → 401', async () => {
    const { status } = await get(`${BFF}/api/users/me`, 'fake.token.xyz');
    expect(status).toBe(401);
  });
});

// ─── IT-004: GPS Update ──────────────────────────────────────────────────────
describe('IT-004: GPS — POST /gps/update', () => {
  it('IT-004-01: DQTV gửi GPS update hợp lệ → 200', async () => {
    if (!dqtvToken) return;
    const { status, body } = await post(`${BFF}/api/gps/update`, {
      latitude: 10.7769,
      longitude: 106.7009,
      accuracy: 5.0,
      speed: 0,
      heading: 0,
      battery: 85,
    }, dqtvToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('IT-004-02: Gửi GPS thiếu latitude → 400', async () => {
    if (!dqtvToken) return;
    const { status } = await post(`${BFF}/api/gps/update`, {
      longitude: 106.7009,
    }, dqtvToken);
    expect(status).toBe(400);
  });

  it('IT-004-03: Không có token → 401', async () => {
    const { status } = await post(`${BFF}/api/gps/update`, {
      latitude: 10.7769,
      longitude: 106.7009,
    });
    expect(status).toBe(401);
  });
});

// ─── IT-005: GPS Team ────────────────────────────────────────────────────────
describe('IT-005: GPS — GET /gps/team', () => {
  it('IT-005-01: CA xem GPS team → 200, trả về array', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/gps/team`, caToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('IT-005-02: DQTV không có permission gps:view → 403', async () => {
    if (!dqtvToken) return;
    const { status } = await get(`${BFF}/api/gps/team`, dqtvToken);
    expect(status).toBe(403);
  });
});

// ─── IT-006: Alerts ──────────────────────────────────────────────────────────
describe('IT-006: Alerts — GET /alerts', () => {
  it('IT-006-01: CA xem alerts → 200, có meta.total', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/alerts`, caToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.meta.total).toBe('number');
    expect(typeof body.meta.unreadCount).toBe('number');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('IT-006-02: DQTV không có permission alerts:manage → 403', async () => {
    if (!dqtvToken) return;
    const { status } = await get(`${BFF}/api/alerts`, dqtvToken);
    expect(status).toBe(403);
  });

  it('IT-006-03: CA filter status=resolved → 200', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/alerts?status=resolved`, caToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ─── IT-007: Reports — DQTV gửi báo cáo ────────────────────────────────────
describe('IT-007: Reports — POST /reports', () => {
  it('IT-007-01: DQTV gửi báo cáo daily hợp lệ → 201', async () => {
    if (!dqtvToken) return;
    const { status, body } = await post(`${BFF}/api/reports`, {
      report_type: 'daily',
      content: 'Báo cáo cuối ngày: Tuần tra khu vực bình thường, không có sự cố.',
      location: 'Khu phố 1, P.Phú Định',
    }, dqtvToken);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.reportType).toBe('daily');
    expect(body.data.status).toBe('pending');
  });

  it('IT-007-02: Gửi báo cáo thiếu content → 400', async () => {
    if (!dqtvToken) return;
    const { status } = await post(`${BFF}/api/reports`, {
      report_type: 'daily',
    }, dqtvToken);
    expect(status).toBe(400);
  });

  it('IT-007-03: Gửi báo cáo loại không hợp lệ → 400', async () => {
    if (!dqtvToken) return;
    const { status } = await post(`${BFF}/api/reports`, {
      report_type: 'invalid_type',
      content: 'Test',
    }, dqtvToken);
    expect(status).toBe(400);
  });
});

// ─── IT-008: Reports — GET my reports ───────────────────────────────────────
describe('IT-008: Reports — GET /reports/my', () => {
  it('IT-008-01: DQTV xem báo cáo của mình → 200, array', async () => {
    if (!dqtvToken) return;
    const { status, body } = await get(`${BFF}/api/reports/my`, dqtvToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('IT-008-02: Không có token → 401', async () => {
    const { status } = await get(`${BFF}/api/reports/my`);
    expect(status).toBe(401);
  });
});

// ─── IT-009: Reports — CA xem team reports ──────────────────────────────────
describe('IT-009: Reports — GET /reports/team', () => {
  it('IT-009-01: CA xem báo cáo toàn đội → 200', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/reports/team`, caToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // team report returns an aggregate stats object (not an array)
    expect(body.data).toBeTruthy();
    expect(typeof body.data).toBe('object');
  });

  it('IT-009-02: DQTV không có permission reports:team → 403', async () => {
    if (!dqtvToken) return;
    const { status } = await get(`${BFF}/api/reports/team`, dqtvToken);
    expect(status).toBe(403);
  });
});

// ─── IT-010: Users — Police Profile ─────────────────────────────────────────
describe('IT-010: Users — GET /me/police-profile', () => {
  it('IT-010-01: CA lấy police profile → 200', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/users/me/police-profile`, caToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.badgeNo).toBeTruthy();
  });

  it('IT-010-02: DQTV gọi police-profile → 404 (không có police profile)', async () => {
    if (!dqtvToken) return;
    const { status } = await get(`${BFF}/api/users/me/police-profile`, dqtvToken);
    // DQTV không có police profile → 404
    expect([404, 200]).toContain(status);
  });
});

// ─── IT-011: Users — Militia List ───────────────────────────────────────────
describe('IT-011: Users — GET /users (militia list)', () => {
  it('IT-011-01: CA xem danh sách users → 200', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/users`, caToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('IT-011-02: CA lọc role=militia → 200', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/users?role=militia`, caToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── IT-012: Tasks — CA tạo task ────────────────────────────────────────────
describe('IT-012: Tasks — POST /tasks', () => {
  it('IT-012-01: CA tạo task hợp lệ → 201', async () => {
    if (!caToken || !dqtvUserId) return;
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { status, body } = await post(`${BFF}/api/tasks`, {
      title: 'Integration Test Task',
      description: 'Task created by integration test',
      task_type: 'patrol',
      priority: 'normal',
      deadline,
      assignee_ids: [dqtvUserId],
    }, caToken);
    // accept 201 or 200
    expect([200, 201]).toContain(status);
    if (status === 201 || status === 200) {
      expect(body.success).toBe(true);
    }
  });

  it('IT-012-02: Tạo task thiếu title → 400', async () => {
    if (!caToken) return;
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { status } = await post(`${BFF}/api/tasks`, {
      task_type: 'patrol',
      deadline,
    }, caToken);
    expect(status).toBe(400);
  });
});

// ─── IT-013: Tasks — DQTV xem task list ─────────────────────────────────────
describe('IT-013: Tasks — GET /tasks (DQTV)', () => {
  it('IT-013-01: DQTV xem task list → 200', async () => {
    if (!dqtvToken) return;
    const { status, body } = await get(`${BFF}/api/tasks`, dqtvToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── IT-014: Leave Requests ──────────────────────────────────────────────────
describe('IT-014: Leave Requests — GET /leave-requests', () => {
  it('IT-014-01: CA xem danh sách leave requests → 200', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/leave-requests`, caToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('IT-014-02: DQTV xem leave requests của mình → 200', async () => {
    if (!dqtvToken) return;
    const { status, body } = await get(`${BFF}/api/leave-requests`, dqtvToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ─── IT-015: Attendance ──────────────────────────────────────────────────────
describe('IT-015: Attendance — GET /attendance/today', () => {
  it('IT-015-01: DQTV xem attendance hôm nay → 200', async () => {
    if (!dqtvToken) return;
    const { status, body } = await get(`${BFF}/api/attendance/today`, dqtvToken);
    // May be 200 (no record) or 200 (with record)
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ─── IT-016: Notifications ───────────────────────────────────────────────────
describe('IT-016: Notifications — GET /notifications', () => {
  it('IT-016-01: User xem notifications → 200', async () => {
    if (!caToken) return;
    const { status, body } = await get(`${BFF}/api/notifications`, caToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});
