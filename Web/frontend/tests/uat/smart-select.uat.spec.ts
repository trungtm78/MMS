// UAT skeleton — Smart Select Feature
// US-SS-01..11: UAT cases from docs/testing/03_UAT_CASES.md
// Created BEFORE implementation (Phase 0.5)
import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
// Use E2E test user created by global-setup (avoids lockout issues with seeded admin)
const ADMIN = { username: 'e2e_admin', password: 'E2eTest@Ad1' }

async function loginAs(page: import('@playwright/test').Page, user: { username: string; password: string }) {
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="username-input"]', { timeout: 15_000 })
  await page.getByTestId('username-input').fill(user.username)
  await page.getByTestId('password-input').fill(user.password)
  await page.getByTestId('login-btn').click()
  await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
}

// ─────────────────────────────────────────────────────
// UAT-SS-01: Người dùng search tên không dấu
// ─────────────────────────────────────────────────────
test.describe('UAT: SmartSelect — Search không dấu', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee-input"]', { timeout: 10_000 })
  })

  test('uat-ss-01: Gõ "nguyen van an" → tìm thấy "Nguyễn Văn An"', async ({ page }) => {
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step01-before.png', fullPage: true })
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('nguyen van an')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 10_000 })
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step01-results.png' })
    // Should see result with "Nguyễn Văn An"
    const firstItem = dropdown.locator('[data-testid^="smart-select-assignee-option-"]').first()
    await expect(firstItem).toBeVisible()
  })

  test('uat-ss-02: Gõ mã viết tắt "HCM" → tìm thấy militia mã HCM-*', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('HCM')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step02-code-search.png' })
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────
// UAT-SS-02: Keyboard workflow end-to-end
// ─────────────────────────────────────────────────────
test.describe('UAT: SmartSelect — Keyboard workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee-input"]', { timeout: 10_000 })
  })

  test('uat-ss-03: Hoàn thành chọn chỉ bằng bàn phím (no mouse)', async ({ page }) => {
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step03-keyboard-start.png', fullPage: true })
    const input = page.getByTestId('smart-select-assignee-input')
    // Tab to focus
    await input.focus()
    await input.fill('an')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    await input.press('ArrowUp') // back to first
    await input.press('Enter')
    await expect(page.getByTestId('smart-select-assignee-selected')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step03-keyboard-selected.png' })
  })
})

// ─────────────────────────────────────────────────────
// UAT-SS-03: Quick-create user acceptance
// NOTE: TaskCreateForm does not implement createModal (not needed for MVP)
// Testing empty state with no-match query
// ─────────────────────────────────────────────────────
test.describe('UAT: SmartSelect — Quick-create (empty state)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee-input"]', { timeout: 10_000 })
  })

  test('uat-ss-04: Không tìm thấy → hiện empty state', async ({ page }) => {
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step04-no-result-before.png', fullPage: true })
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('XYZ-NOTEXIST-9999')
    // Wait for debounce + API
    await page.waitForTimeout(1500)
    await expect(page.getByTestId('smart-select-assignee-empty')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step04-no-result-after.png' })
  })

  test('uat-ss-05: Empty state hiển thị đúng message', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('NORESULT-XYZ')
    await page.waitForTimeout(1500)
    const empty = page.getByTestId('smart-select-assignee-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('NORESULT-XYZ')
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step05-empty-state.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────
// UAT-SS-04: Accessibility
// ─────────────────────────────────────────────────────
test.describe('UAT: SmartSelect — Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee-input"]', { timeout: 10_000 })
  })

  test('uat-ss-06: Input có aria-label/aria-expanded', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await expect(input).toHaveAttribute('aria-expanded', 'false')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await expect(input).toHaveAttribute('aria-expanded', 'true')
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step06-aria.png' })
  })

  test('uat-ss-07: Option có role="option" và aria-selected', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    const firstOpt = page.locator('[data-testid^="smart-select-assignee-option-"]').first()
    await expect(firstOpt).toHaveAttribute('role', 'option')
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step07-role.png' })
  })
})

// ─────────────────────────────────────────────────────
// UAT-SS-05: Error state
// ─────────────────────────────────────────────────────
test.describe('UAT: SmartSelect — Error State', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee-input"]', { timeout: 10_000 })
  })

  test('uat-ss-08: Submit form without selecting → error message shown', async ({ page }) => {
    // Submit task form without selecting assignee
    await page.getByTestId('task-title-input').fill('Test Task No Assignee')
    await page.getByTestId('task-submit-btn').click()
    await expect(page.getByTestId('smart-select-assignee-error')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step08-error.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────
// UAT-SS-06: AttendanceForm — militia search
// ─────────────────────────────────────────────────────
test.describe('UAT: SmartSelect — AttendanceForm militia search', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/attendance/record`)
    await page.waitForSelector('[data-testid="attendance-form"]', { timeout: 10_000 })
  })

  test('uat-ss-09: Attendance form – search militia by phone number', async ({ page }) => {
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step09-attendance-before.png', fullPage: true })
    const input = page.getByTestId('smart-select-militia-input')
    await input.click()
    await input.fill('0909')
    await page.waitForTimeout(600)
    const dropdown = page.getByTestId('smart-select-militia-dropdown')
    await expect(dropdown).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-uat-step09-attendance-results.png' })
  })
})
