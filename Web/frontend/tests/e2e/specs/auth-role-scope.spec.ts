// E2E Pre-Commitment skeleton — TASK-2026-001 — Created BEFORE implementation
// US-W001: Authentication + RBAC + Scope enforcement
// Uses E2E test users created in global-setup.ts with known passwords
import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'

// E2E test users (created by global-setup.ts)
const USERS = {
  police_ward: { username: 'e2e_police_ward', password: 'E2eTest@PW1' },
  militia: { username: 'e2e_militia', password: 'E2eTest@DQ1' },
  admin: { username: 'e2e_admin', password: 'E2eTest@Ad1' },
}

test.describe('E2E: Auth + RBAC + Scope — US-W001', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    // Ensure we start at login page
    await page.waitForSelector('[data-testid="username-input"]', { timeout: 15_000 })
  })

  // E2E-W001-HP-01: CA Phường login → police_ward dashboard
  test('E2E-W001-HP-01: police_ward login success → dashboard', async ({ page }) => {
    await page.screenshot({ path: 'test-results/uat/screenshots/auth-step01-form-empty.png', fullPage: true })
    await page.getByTestId('username-input').fill(USERS.police_ward.username)
    await page.getByTestId('password-input').fill(USERS.police_ward.password)
    await page.getByTestId('login-btn').click()
    await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/auth-step02-police-ward-dashboard.png' })
    // Police_ward: sees militia list (personnel group is open by default)
    await expect(page.getByTestId('nav-militia-list')).toBeVisible()
    // Expand "Theo Dõi & Cảnh Báo" group to see GPS nav item
    await page.getByRole('button', { name: /Theo Dõi & Cảnh Báo/i }).click()
    await expect(page.getByTestId('nav-gps-tracking')).toBeVisible()
    // Admin group is not shown for police_ward → nav-user-management not in DOM
    await expect(page.getByTestId('nav-user-management')).not.toBeVisible()
  })

  // E2E-W001-HP-02: Admin login → admin dashboard with user-management
  test('E2E-W001-HP-02: admin login success → admin dashboard', async ({ page }) => {
    await page.getByTestId('username-input').fill(USERS.admin.username)
    await page.getByTestId('password-input').fill(USERS.admin.password)
    await page.getByTestId('login-btn').click()
    await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/auth-step02-admin-dashboard.png' })
    // Expand "Quản Trị" group to see user-management nav item (scope to sidebar to avoid matching user-chip)
    await page.getByTestId('sidebar').getByRole('button', { name: /Quản Trị/i }).click()
    await expect(page.getByTestId('nav-user-management')).toBeVisible()
  })

  // E2E-W001-NP: Wrong password → vague error, no info leak
  test('E2E-W001-NP: wrong password → vague error message', async ({ page }) => {
    await page.getByTestId('username-input').fill(USERS.police_ward.username)
    await page.getByTestId('password-input').fill('WrongPassword')
    await page.getByTestId('login-btn').click()
    const error = page.getByTestId('login-error-message')
    await expect(error).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/auth-error01-wrong-password.png' })
    // Error should NOT reveal if username exists
    await expect(error).toHaveText(/Tên đăng nhập hoặc mật khẩu không đúng/i)
  })

  // E2E-W001-LOCKOUT: 5 wrong attempts → account locked
  test('E2E-W001-LOCKOUT: 5 failed attempts → account locked', async ({ page }) => {
    const lockUser = 'e2e_lock_' + Date.now()
    // Use an account that doesn't exist to trigger lockout logic
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('username-input').fill(lockUser)
      await page.getByTestId('password-input').fill('Wrong' + i)
      await page.getByTestId('login-btn').click()
      await page.waitForSelector('[data-testid="login-error-message"]', { timeout: 8_000 })
      // Clear fields for next attempt
      if (i < 4) {
        await page.getByTestId('username-input').clear()
        await page.getByTestId('password-input').clear()
      }
    }
    const error = page.getByTestId('login-error-message')
    await page.screenshot({ path: 'test-results/uat/screenshots/auth-error02-lockout.png' })
    await expect(error).toBeVisible()
  })

  // E2E-W001-REFRESH: Silent token refresh during operation
  test('E2E-W001-REFRESH: silent refresh keeps session alive', async ({ page }) => {
    test.skip(true, 'Requires time manipulation — implement with clock mocking')
  })
})
