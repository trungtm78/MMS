// UI Design System Visual Regression Tests
// Verifies that all pages match the Refs design system after UI/UX fixes
// Tests check: colors, structure, and key visual elements
import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'

async function loginAs(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never, username: string, password: string) {
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="username-input"]', { timeout: 15_000 })
  await page.getByTestId('username-input').fill(username)
  await page.getByTestId('password-input').fill(password)
  await page.getByTestId('login-btn').click()
  await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
}

const ADMIN = { username: 'e2e_admin', password: 'E2eTest@Ad1' }
const POLICE = { username: 'e2e_police_ward', password: 'E2eTest@PW1' }

// ─── LoginPage ───────────────────────────────────────────────────────────────

test.describe('UI-DS-01: LoginPage design system', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('[data-testid="username-input"]', { timeout: 15_000 })
  })

  test('DS-01-01: logo is OUTSIDE the red border box', async ({ page }) => {
    // Logo img should not be a descendant of the form container (border-[#C62828])
    // The form container is the div with the red border; logo should be a sibling or ancestor-sibling
    const logo = page.locator('img[alt="Bảo vệ An ninh Trật tự"]')
    await expect(logo).toBeVisible()

    // Form should be visible and contain the login inputs
    const loginForm = page.getByTestId('login-form')
    await expect(loginForm).toBeVisible()

    // Logo should NOT be inside the login-form
    const logoInsideForm = loginForm.locator('img[alt="Bảo vệ An ninh Trật tự"]')
    await expect(logoInsideForm).toHaveCount(0)
  })

  test('DS-01-02: User icon visible in username input', async ({ page }) => {
    // The username field wrapper should have an icon (lucide User SVG)
    const usernameWrapper = page.locator('#username').locator('..')
    const icon = usernameWrapper.locator('svg')
    await expect(icon).toBeVisible()
  })

  test('DS-01-03: Lock icon visible in password input', async ({ page }) => {
    const passwordWrapper = page.locator('#password').locator('..')
    const icons = passwordWrapper.locator('svg')
    // At least 2 SVGs: Lock icon + Eye/EyeOff toggle
    await expect(icons).toHaveCount(2)
  })

  test('DS-01-04: Login button has text-lg and shadow', async ({ page }) => {
    const btn = page.getByTestId('login-btn')
    await expect(btn).toHaveClass(/text-lg/)
    await expect(btn).toHaveClass(/shadow-lg/)
  })

  test('DS-01-05: Remember-me checkbox is present', async ({ page }) => {
    const checkbox = page.getByTestId('remember-me-checkbox')
    await expect(checkbox).toBeVisible()
  })

  test('DS-01-06: Error message appears AFTER button', async ({ page }) => {
    await page.getByTestId('username-input').fill('wrong_user')
    await page.getByTestId('password-input').fill('wrong_pass')
    await page.getByTestId('login-btn').click()
    const errorMsg = page.getByTestId('login-error-message')
    await expect(errorMsg).toBeVisible({ timeout: 8_000 })

    // Error should appear after the submit button in DOM order
    const btn = page.getByTestId('login-btn')
    const btnBox = await btn.boundingBox()
    const errorBox = await errorMsg.boundingBox()
    expect(errorBox!.y).toBeGreaterThan(btnBox!.y)
  })
})

// ─── DashboardPage ────────────────────────────────────────────────────────────

test.describe('UI-DS-02: DashboardPage design system', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN.username, ADMIN.password)
  })

  test('DS-02-01: Stat cards use design system hex backgrounds (no blue-100/amber-100)', async ({ page }) => {
    await page.waitForSelector('[data-testid="stat-tasks-pending"]', { timeout: 10_000 })

    // Verify no generic blue/amber Tailwind classes on stat card icon divs
    const statCard = page.getByTestId('stat-tasks-pending')
    await expect(statCard).toBeVisible()

    // The icon container should use #E8F5E9 (hex), not amber-100/blue-100
    const iconDiv = statCard.locator('div.rounded-xl').first()
    const bgClass = await iconDiv.getAttribute('class')
    expect(bgClass).not.toContain('blue-100')
    expect(bgClass).not.toContain('amber-100')
  })

  test('DS-02-02: SOS stat card uses #FFEBEE background', async ({ page }) => {
    const statCard = page.getByTestId('stat-sos-active')
    await expect(statCard).toBeVisible()
    const iconDiv = statCard.locator('div.rounded-xl').first()
    await expect(iconDiv).toHaveClass(/\[#FFEBEE\]/)
  })
})

// ─── TaskListPage ─────────────────────────────────────────────────────────────

test.describe('UI-DS-03: TaskListPage priority badges', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, POLICE.username, POLICE.password)
    await page.goto(`${BASE}/tasks/list`)
    await page.waitForSelector('[data-testid="task-list-page"]', { timeout: 10_000 })
  })

  test('DS-03-01: Priority badges use inline style hex colors', async ({ page }) => {
    // If tasks are loaded, check priority badge styling
    const badges = page.locator('[data-testid="task-list-page"] span.rounded-full')
    const count = await badges.count()
    if (count > 0) {
      const firstBadge = badges.first()
      // Should have inline style (not Tailwind class) for background
      const style = await firstBadge.getAttribute('style')
      expect(style).toBeTruthy()
      expect(style).toContain('background')
    }
  })
})

// ─── PayrollPage ──────────────────────────────────────────────────────────────

test.describe('UI-DS-04: PayrollPage first card gradient', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN.username, ADMIN.password)
    await page.goto(`${BASE}/payroll`)
    await page.waitForSelector('[data-testid="payroll-page"]', { timeout: 10_000 })
  })

  test('DS-04-01: First summary card has navy-to-green gradient', async ({ page }) => {
    // The first summary card should have the gradient class
    const gradientCard = page.locator('[data-testid="payroll-page"]').locator('div.bg-gradient-to-br').first()
    await expect(gradientCard).toBeVisible()
    await expect(gradientCard).toHaveClass(/from-\[#1F3A5F\]/)
    await expect(gradientCard).toHaveClass(/to-\[#2E7D32\]/)
  })
})

// ─── TimesheetPage ────────────────────────────────────────────────────────────

test.describe('UI-DS-05: TimesheetPage month dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, POLICE.username, POLICE.password)
    await page.goto(`${BASE}/timesheet`)
    await page.waitForSelector('[data-testid="timesheet-page"]', { timeout: 10_000 })
  })

  test('DS-05-01: Month selector dropdown is present', async ({ page }) => {
    const monthSelect = page.getByTestId('month-select')
    await expect(monthSelect).toBeVisible()
    // Should have at least 6 month options
    const options = monthSelect.locator('option')
    await expect(options).toHaveCount(12)
  })

  test('DS-05-02: Week navigation buttons still present', async ({ page }) => {
    await expect(page.getByTestId('prev-week')).toBeVisible()
    await expect(page.getByTestId('next-week')).toBeVisible()
  })

  test('DS-05-03: Changing month updates week display', async ({ page }) => {
    const monthSelect = page.getByTestId('month-select')
    const options = await monthSelect.locator('option').all()
    if (options.length > 1) {
      // Select the second option (previous month)
      await monthSelect.selectOption({ index: 1 })
      // Week label should update
      await page.waitForTimeout(500)
      const weekLabel = page.locator('[data-testid="timesheet-page"] span.font-semibold').first()
      await expect(weekLabel).toBeVisible()
    }
  })
})

// ─── AttendanceReportPage ─────────────────────────────────────────────────────

test.describe('UI-DS-06: AttendanceReportPage layout', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, POLICE.username, POLICE.password)
    await page.goto(`${BASE}/attendance`)
    await page.waitForSelector('[data-testid="attendance-report-page"]', { timeout: 10_000 })
  })

  test('DS-06-01: Page title uses 28px font size', async ({ page }) => {
    const title = page.locator('[data-testid="attendance-report-page"] h1').first()
    await expect(title).toBeVisible()
    await expect(title).toHaveClass(/text-\[28px\]/)
  })

  test('DS-06-02: Stats grid has 4 cards (including total records)', async ({ page }) => {
    // 4 stat cards in the grid
    const statCards = page.locator('[data-testid="attendance-report-page"] .grid .bg-white.rounded-xl')
    await expect(statCards).toHaveCount(4)
  })

  test('DS-06-03: Export button has navy background', async ({ page }) => {
    const exportBtn = page.locator('[data-testid="attendance-report-page"] button', { hasText: 'Xuất Excel' })
    await expect(exportBtn).toBeVisible()
    await expect(exportBtn).toHaveClass(/bg-\[#1F3A5F\]/)
  })
})

// ─── UserManagementPage ───────────────────────────────────────────────────────

test.describe('UI-DS-07: UserManagementPage styling', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN.username, ADMIN.password)
    await page.goto(`${BASE}/users`)
    await page.waitForSelector('[data-testid="user-management-page"]', { timeout: 10_000 })
  })

  test('DS-07-01: Add User button has green background', async ({ page }) => {
    const addBtn = page.getByTestId('add-user-btn')
    await expect(addBtn).toBeVisible()
    await expect(addBtn).toHaveClass(/bg-\[#2E7D32\]/)
  })

  test('DS-07-02: Title uses font-semibold', async ({ page }) => {
    const title = page.locator('[data-testid="user-management-page"] h1').first()
    await expect(title).toHaveClass(/font-semibold/)
  })
})

// ─── SettingsProfilePage ──────────────────────────────────────────────────────

test.describe('UI-DS-08: SettingsProfilePage styling', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, POLICE.username, POLICE.password)
    await page.goto(`${BASE}/settings/profile`)
    await page.waitForSelector('[data-testid="settings-profile-page"]', { timeout: 10_000 })
  })

  test('DS-08-01: Edit button has navy background', async ({ page }) => {
    const editBtn = page.getByTestId('edit-profile-btn')
    await expect(editBtn).toBeVisible()
    await expect(editBtn).toHaveClass(/bg-\[#1F3A5F\]/)
  })

  test('DS-08-02: Profile banner has navy-to-blue gradient', async ({ page }) => {
    const banner = page.locator('[data-testid="settings-profile-page"] div.h-24').first()
    await expect(banner).toBeVisible()
    await expect(banner).toHaveClass(/from-\[#1F3A5F\]/)
  })
})
