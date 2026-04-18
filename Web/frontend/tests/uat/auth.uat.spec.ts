// UAT skeleton — TASK-2026-001 — Created BEFORE implementation
// US-W001: Auth UAT cases from docs/testing/03_UAT_CASES.md
// Uses E2E test users created in global-setup.ts with known passwords
import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'

const USERS = {
  police_ward: { username: 'e2e_police_ward', password: 'E2eTest@PW1' },
  militia: { username: 'e2e_militia', password: 'E2eTest@DQ1' },
  admin: { username: 'e2e_admin', password: 'E2eTest@Ad1' },
}

test.describe('UAT: Authentication & RBAC — US-W001', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('[data-testid="username-input"]', { timeout: 15_000 })
  })

  // UAT-W001-01: CA Phường đăng nhập đầu ca — sees dashboard + SOS + correct menu
  test('uat-w001-01: police_ward login → dashboard + SOS + correct menu', async ({ page }) => {
    await page.screenshot({ path: 'test-results/uat/screenshots/uat-w001-01-initial.png', fullPage: true })
    await page.getByTestId('username-input').fill(USERS.police_ward.username)
    await page.getByTestId('password-input').fill(USERS.police_ward.password)
    await page.getByTestId('remember-me-checkbox').check()
    await page.getByTestId('login-btn').click()
    await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/uat-w001-01-dashboard.png' })
    await expect(page.getByTestId('nav-militia-list')).toBeVisible()
    await expect(page.getByTestId('nav-gps-tracking')).toBeVisible()
    await expect(page.getByTestId('nav-user-management')).not.toBeVisible()
  })

  // UAT-W001-02: DQTV (militia) login — sees militia-appropriate menu
  test('uat-w001-02: militia login → sees militia dashboard', async ({ page }) => {
    await page.getByTestId('username-input').fill(USERS.militia.username)
    await page.getByTestId('password-input').fill(USERS.militia.password)
    await page.getByTestId('login-btn').click()
    await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/uat-w001-02-militia.png' })
    // Militia: sees tasks, attendance, leave — NOT user management, GPS tracking
    await expect(page.getByTestId('dashboard-overview')).toBeVisible()
    await expect(page.getByTestId('nav-user-management')).not.toBeVisible()
  })

  // UAT-W001-03: Session token expired — silent refresh
  test('uat-w001-03: silent token refresh preserves form data', async ({ page }) => {
    test.skip(true, 'Requires backend + time manipulation — implement with backend')
  })

  // UAT-W001-04: ForbiddenPage when accessing unauthorized URL
  test('uat-w001-04: militia access /admin/users → forbidden page', async ({ page }) => {
    // Login as militia (no admin access)
    await page.getByTestId('username-input').fill(USERS.militia.username)
    await page.getByTestId('password-input').fill(USERS.militia.password)
    await page.getByTestId('login-btn').click()
    await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
    // Navigate to admin route
    await page.goto(`${BASE}/admin/users`)
    await page.screenshot({ path: 'test-results/uat/screenshots/uat-w001-04-forbidden.png' })
    await expect(page.getByTestId('forbidden-page')).toBeVisible()
  })
})
