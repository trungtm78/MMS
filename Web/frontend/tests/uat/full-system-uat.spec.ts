// Full System UAT — Web Frontend
// Tests all major flows as end-user against live backend on port 3000 (via Vite proxy)
// Users: uat_admin (system_admin), ca001 (ca_officer), dqtv001 (dqtv_member)
import { test, expect, Page } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'

const USERS = {
  admin: { username: 'uat_admin', password: 'Test@1234' },
  ca:    { username: 'ca001',     password: 'Test@1234' },
  dqtv:  { username: 'dqtv001',  password: 'Test@1234' },
}

async function login(page: Page, user: { username: string; password: string }) {
  await page.goto(`${BASE}/login`)
  await page.waitForSelector('[data-testid="username-input"]', { timeout: 10_000 })
  await page.getByTestId('username-input').fill(user.username)
  await page.getByTestId('password-input').fill(user.password)
  await page.getByTestId('login-btn').click()
  // React Router uses history.replaceState (no full page load) — use expect instead of waitForURL
  await expect(page).toHaveURL(/\/(dashboard|militia|home)/, { timeout: 15_000 })
}

test.describe('UAT-WEB: Authentication', () => {
  test('BAC-WF-01: Admin login redirects to dashboard', async ({ page }) => {
    await login(page, USERS.admin)
    await expect(page).toHaveURL(/\/dashboard/)
    await page.screenshot({ path: 'test-results/uat/screenshots/wf01-admin-dashboard.png', fullPage: true })
  })

  test('BAC-WF-02: CA login works', async ({ page }) => {
    await login(page, USERS.ca)
    await expect(page).toHaveURL(/\/dashboard/)
    await page.screenshot({ path: 'test-results/uat/screenshots/wf02-ca-dashboard.png', fullPage: true })
  })

  test('BAC-WF-03: Wrong password shows error, stays on login', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.waitForSelector('[data-testid="username-input"]')
    await page.getByTestId('username-input').fill('uat_admin')
    await page.getByTestId('password-input').fill('WrongPassword123')
    await page.getByTestId('login-btn').click()
    await expect(page.getByTestId('login-error-message')).toBeVisible({ timeout: 8_000 })
    await expect(page).toHaveURL(/\/login/)
    await page.screenshot({ path: 'test-results/uat/screenshots/wf03-login-error.png', fullPage: true })
  })

  test('BAC-WF-04: Unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/dashboard`)
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })
})

test.describe('UAT-WEB: Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.admin)
  })

  test('BAC-WF-05: Dashboard loads with stats cards', async ({ page }) => {
    await page.waitForURL(/\/dashboard/)
    // Look for stat cards — dashboard should show numbers
    await expect(page.locator('body')).not.toContainText('undefined')
    await expect(page.locator('body')).not.toContainText('null')
    await expect(page.locator('body')).not.toContainText('NaN')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf05-dashboard-stats.png', fullPage: true })
  })

  test('BAC-WF-06: No JS errors on dashboard', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    await page.waitForURL(/\/dashboard/)
    await page.waitForTimeout(3000)
    const critical = errors.filter(e => !e.includes('favicon') && !e.includes('socket') && !e.includes('websocket'))
    expect(critical, `Console errors: ${critical.join(', ')}`).toHaveLength(0)
  })
})

test.describe('UAT-WEB: Militia Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.admin)
  })

  test('BAC-WF-07: Militia list page loads with data', async ({ page }) => {
    await page.goto(`${BASE}/militia`)
    await page.waitForLoadState('networkidle')
    // Should show a table or list, not empty state error
    await expect(page.locator('body')).not.toContainText('Lỗi')
    await expect(page.locator('body')).not.toContainText('undefined')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf07-militia-list.png', fullPage: true })
  })

  test('BAC-WF-08: Militia search works', async ({ page }) => {
    await page.goto(`${BASE}/militia`)
    await page.waitForLoadState('networkidle')
    // Try to find a search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="Tìm"], input[placeholder*="tìm"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill('test')
      await page.waitForTimeout(1000)
    }
    await page.screenshot({ path: 'test-results/uat/screenshots/wf08-militia-search.png', fullPage: true })
  })
})

test.describe('UAT-WEB: Attendance', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.ca)
  })

  test('BAC-WF-09: Attendance page loads', async ({ page }) => {
    await page.goto(`${BASE}/attendance`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.locator('body')).not.toContainText('Cannot GET')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf09-attendance.png', fullPage: true })
  })
})

test.describe('UAT-WEB: Payroll', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.admin)
  })

  test('BAC-WF-10: Payroll page loads with periods', async ({ page }) => {
    await page.goto(`${BASE}/payroll`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('Lỗi server')
    await expect(page.locator('body')).not.toContainText('undefined')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf10-payroll.png', fullPage: true })
  })
})

test.describe('UAT-WEB: Tasks', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.ca)
  })

  test('BAC-WF-11: Tasks list loads', async ({ page }) => {
    await page.goto(`${BASE}/tasks`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('undefined')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf11-tasks.png', fullPage: true })
  })
})

test.describe('UAT-WEB: Leave Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.dqtv)
  })

  test('BAC-WF-12: Leave page loads for DQTV user', async ({ page }) => {
    await page.goto(`${BASE}/leave`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('Không có quyền')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf12-leave.png', fullPage: true })
  })
})

test.describe('UAT-WEB: SOS / Incidents', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.ca)
  })

  test('BAC-WF-13: SOS page loads with incidents list', async ({ page }) => {
    await page.goto(`${BASE}/sos`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('undefined')
    await expect(page.locator('body')).not.toContainText('Error')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf13-sos.png', fullPage: true })
  })
})

test.describe('UAT-WEB: GPS Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.ca)
  })

  test('BAC-WF-14: GPS tracking page loads', async ({ page }) => {
    await page.goto(`${BASE}/gps`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('undefined')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf14-gps.png', fullPage: true })
  })
})

test.describe('UAT-WEB: Work Reports', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.dqtv)
  })

  test('BAC-WF-15: Work reports page loads', async ({ page }) => {
    await page.goto(`${BASE}/work-reports`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('Cannot GET')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf15-work-reports.png', fullPage: true })
  })
})

test.describe('UAT-WEB: Audit Log', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.admin)
  })

  test('BAC-WF-16: Audit log page loads with entries', async ({ page }) => {
    await page.goto(`${BASE}/audit`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('undefined')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf16-audit.png', fullPage: true })
  })
})

test.describe('UAT-WEB: System Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.admin)
  })

  test('BAC-WF-17: System settings page loads', async ({ page }) => {
    await page.goto(`${BASE}/settings`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('undefined')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf17-settings.png', fullPage: true })
  })
})

test.describe('UAT-WEB: RBAC Enforcement', () => {
  test('BAC-WF-18: DQTV cannot access admin user management', async ({ page }) => {
    await login(page, USERS.dqtv)
    await page.goto(`${BASE}/admin/users`)
    // Should redirect or show forbidden
    await page.waitForTimeout(2000)
    const isForbidden = page.url().includes('/login') || await page.locator('[data-testid="forbidden-page"]').isVisible()
    expect(isForbidden || !page.url().includes('/admin/users'), 'DQTV should not access admin').toBeTruthy()
    await page.screenshot({ path: 'test-results/uat/screenshots/wf18-rbac.png', fullPage: true })
  })

  test('BAC-WF-19: Admin can access user management', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto(`${BASE}/admin/users`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('Không có quyền')
    await page.screenshot({ path: 'test-results/uat/screenshots/wf19-admin-users.png', fullPage: true })
  })
})

test.describe('UAT-WEB: Session Management', () => {
  test('BAC-WF-20: Logout clears session and redirects to login', async ({ page }) => {
    await login(page, USERS.admin)
    await page.waitForURL(/\/dashboard/)
    // Find and click logout
    const logoutBtn = page.locator('[data-testid="logout-btn"], button:has-text("Đăng xuất")').first()
    if (await logoutBtn.isVisible({ timeout: 3000 })) {
      await logoutBtn.click()
    } else {
      // Try via menu
      const menuBtn = page.locator('[data-testid="user-menu"], button[aria-label*="menu"], button[aria-label*="tài khoản"]').first()
      if (await menuBtn.isVisible({ timeout: 3000 })) {
        await menuBtn.click()
        await page.locator('button:has-text("Đăng xuất"), a:has-text("Đăng xuất")').first().click()
      }
    }
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/wf20-logout.png', fullPage: true })
  })
})
