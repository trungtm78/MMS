// E2E Pre-Commitment skeleton — Smart Select Feature
// US-SS-01..11: SmartSelect FK lookup component
// Created BEFORE implementation (Phase 0.5)
import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'

// Use E2E test user created by global-setup (system_admin role, avoids seed lockout issues)
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
// US-SS-01: Render & initial state
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-01 Render & Initial State', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee"]', { timeout: 10_000 })
  })

  // SS-E2E-01: Component renders with placeholder
  test('SS-E2E-01: SmartSelect renders with placeholder text', async ({ page }) => {
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step01-render.png', fullPage: true })
    const input = page.getByTestId('smart-select-assignee-input')
    await expect(input).toBeVisible()
    // Placeholder contains some search-related text
    const placeholder = await input.getAttribute('placeholder')
    expect(placeholder).toBeTruthy()
  })

  // SS-E2E-02: Dropdown hidden when not focused
  test('SS-E2E-02: Dropdown hidden on initial render', async ({ page }) => {
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).not.toBeVisible()
  })
})

// ─────────────────────────────────────────────────────
// US-SS-02: Search — debounce + API call
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-02 Search Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee"]', { timeout: 10_000 })
  })

  // SS-E2E-03: Typing opens dropdown and shows results
  test('SS-E2E-03: Type query → dropdown opens with results', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('an')
    // Wait for debounce (300ms) + API response
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step03-search-results.png' })
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).toBeVisible()
  })

  // SS-E2E-04: Loading state appears during search
  test('SS-E2E-04: Loading spinner appears while searching', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    // Intercept API to delay response
    await page.route('**/militia/search*', async (route) => {
      await new Promise((r) => setTimeout(r, 1000))
      await route.continue()
    })
    await input.fill('nguyen')
    const loading = page.getByTestId('smart-select-assignee-loading')
    await expect(loading).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step04-loading.png' })
  })

  // SS-E2E-05: Unaccent search — "Nguyen" matches "Nguyễn"
  test('SS-E2E-05: Unaccent search — ASCII matches accented name', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('Nguyen Van An')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step05-unaccent.png' })
    // Should find "Nguyễn Văn An" even without diacritics
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).toBeVisible()
    const items = dropdown.locator('[data-testid^="smart-select-assignee-option-"]')
    await expect(items.first()).toBeVisible()
  })

  // SS-E2E-06: Empty state shown when no results
  test('SS-E2E-06: Empty state shown for no-match query', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('zzz-no-match-xyz')
    await page.waitForTimeout(600) // debounce + API
    const empty = page.getByTestId('smart-select-assignee-empty')
    await expect(empty).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step06-empty.png' })
  })
})

// ─────────────────────────────────────────────────────
// US-SS-03: Keyboard navigation
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-03 Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee"]', { timeout: 10_000 })
  })

  // SS-E2E-07: ArrowDown highlights first option
  test('SS-E2E-07: ArrowDown → first option highlighted', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await input.press('ArrowDown')
    const active = page.getByTestId('smart-select-assignee-option-active')
    await expect(active).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step07-keyboard-nav.png' })
  })

  // SS-E2E-08: Enter selects highlighted option
  test('SS-E2E-08: Enter key selects highlighted option', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await input.press('ArrowDown')
    await input.press('Enter')
    const selected = page.getByTestId('smart-select-assignee-selected')
    await expect(selected).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step08-enter-select.png' })
  })

  // SS-E2E-09: Escape closes dropdown
  test('SS-E2E-09: Escape key closes dropdown', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await input.press('Escape')
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).not.toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step09-escape.png' })
  })

  // SS-E2E-10: Tab closes dropdown and moves focus
  test('SS-E2E-10: Tab key closes dropdown', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await input.press('Tab')
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).not.toBeVisible()
  })
})

// ─────────────────────────────────────────────────────
// US-SS-04: Mouse interaction
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-04 Mouse Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee"]', { timeout: 10_000 })
  })

  // SS-E2E-11: Click option selects it
  test('SS-E2E-11: Click on option → selects it, dropdown closes', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    const firstOption = page.locator('[data-testid^="smart-select-assignee-option-"]').first()
    await firstOption.click()
    const selected = page.getByTestId('smart-select-assignee-selected')
    await expect(selected).toBeVisible()
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).not.toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step11-click-select.png' })
  })

  // SS-E2E-12: Click outside closes dropdown
  test('SS-E2E-12: Click outside → dropdown closes', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await page.mouse.click(10, 10) // click outside
    const dropdown = page.getByTestId('smart-select-assignee-dropdown')
    await expect(dropdown).not.toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step12-click-outside.png' })
  })

  // SS-E2E-13: Clear button resets selection
  test('SS-E2E-13: Clear button resets selection', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('a')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await page.locator('[data-testid^="smart-select-assignee-option-"]').first().click()
    await expect(page.getByTestId('smart-select-assignee-selected')).toBeVisible()
    await page.getByTestId('smart-select-assignee-clear').click()
    await expect(page.getByTestId('smart-select-assignee-selected')).not.toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step13-clear.png' })
  })
})

// ─────────────────────────────────────────────────────
// US-SS-05: Quick-create inline modal
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-05 Quick-Create Modal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee"]', { timeout: 10_000 })
  })

  // SS-E2E-14: Create button appears in empty state
  test('SS-E2E-14: "Tạo mới" button appears when no results', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('zzz-no-match-xyz')
    await page.waitForTimeout(600)
    const createBtn = page.getByTestId('smart-select-assignee-create-btn')
    await expect(createBtn).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step14-create-btn.png' })
  })

  // SS-E2E-15: Click create opens modal
  test('SS-E2E-15: Click "Tạo mới" → inline modal opens', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('zzz-no-match-xyz')
    await page.waitForTimeout(600)
    await page.getByTestId('smart-select-assignee-create-btn').click()
    const modal = page.getByTestId('smart-select-assignee-modal')
    await expect(modal).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step15-modal-open.png', fullPage: true })
  })

  // SS-E2E-16: Modal cancel closes without selection
  test('SS-E2E-16: Modal cancel → closes, no selection', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('zzz-no-match-xyz')
    await page.waitForTimeout(600)
    await page.getByTestId('smart-select-assignee-create-btn').click()
    await page.getByTestId('smart-select-assignee-modal-cancel').click()
    const modal = page.getByTestId('smart-select-assignee-modal')
    await expect(modal).not.toBeVisible()
    await expect(page.getByTestId('smart-select-assignee-selected')).not.toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step16-modal-cancel.png' })
  })

  // SS-E2E-17: Modal submit creates record and auto-selects it
  test('SS-E2E-17: Modal submit → creates record, auto-selects', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('Test Create')
    await page.waitForTimeout(600)
    await page.getByTestId('smart-select-assignee-create-btn').click()
    const modal = page.getByTestId('smart-select-assignee-modal')
    await expect(modal).toBeVisible()
    // Fill modal form (fields depend on createForm prop)
    await page.getByTestId('smart-select-assignee-modal-submit').click()
    await page.waitForSelector('[data-testid="smart-select-assignee-selected"]', { timeout: 5_000 })
    await expect(modal).not.toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step17-modal-submit.png' })
  })
})

// ─────────────────────────────────────────────────────
// US-SS-06: Integration with TaskCreateForm
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-06 TaskCreateForm Integration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="task-create-form"]', { timeout: 10_000 })
  })

  test('SS-E2E-18: TaskCreateForm has assignee SmartSelect', async ({ page }) => {
    await expect(page.getByTestId('smart-select-assignee')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step18-task-form.png', fullPage: true })
  })

  test('SS-E2E-19: Full happy path — select assignee and submit task', async ({ page }) => {
    // Fill form fields
    await page.getByTestId('task-title-input').fill('E2E Test Task')
    await page.getByTestId('task-description-input').fill('Auto-created by E2E')
    await page.getByTestId('task-due-date-input').fill('2026-12-31')
    // SmartSelect assignee — search by E2E militia code created in global-setup
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('QS-E2E-001')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 8_000 })
    await page.locator('[data-testid^="smart-select-assignee-option-"]').first().click()
    await expect(page.getByTestId('smart-select-assignee-selected')).toBeVisible()
    // Submit
    await page.getByTestId('task-submit-btn').click()
    await page.waitForSelector('[data-testid="task-create-success"]', { timeout: 10_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step19-task-created.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────
// US-SS-07: Integration with AttendanceForm
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-07 AttendanceForm Integration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/attendance/record`)
    await page.waitForSelector('[data-testid="attendance-form"]', { timeout: 10_000 })
  })

  test('SS-E2E-20: AttendanceForm has militia SmartSelect', async ({ page }) => {
    await expect(page.getByTestId('smart-select-militia')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step20-attendance-form.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────
// US-SS-08: Integration with UserForm
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-08 UserForm Integration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/users/new`)
    await page.waitForSelector('[data-testid="user-form"]', { timeout: 10_000 })
  })

  test('SS-E2E-21: UserForm has unit SmartSelect', async ({ page }) => {
    await expect(page.getByTestId('smart-select-unit')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step21-user-form.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────
// US-SS-09: Integration with PayrollKpiFilter
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-09 PayrollKpiFilter Integration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/payroll/kpi`)
    await page.waitForSelector('[data-testid="payroll-kpi-filter"]', { timeout: 10_000 })
  })

  test('SS-E2E-22: PayrollKpiFilter has unit and militia SmartSelects', async ({ page }) => {
    await expect(page.getByTestId('smart-select-unit')).toBeVisible()
    await expect(page.getByTestId('smart-select-militia')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step22-payroll-filter.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────
// US-SS-03 AC-5..9: Quick-Create Modal — additional ACs
// ─────────────────────────────────────────────────────
test.describe('E2E: SmartSelect — US-SS-03 Quick-Create Extended ACs', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="smart-select-assignee"]', { timeout: 10_000 })
  })

  // SS-E2E-23: US-SS-03 AC-5 — no createModal prop → no "Tạo mới" button
  // AttendanceForm has SmartSelect WITHOUT createModal → tests canCreate=false behaviour
  test('SS-E2E-23: No createModal prop → "Tạo mới" button absent (AC-5)', async ({ page }) => {
    await page.goto(`${BASE}/attendance/record`)
    await page.waitForSelector('[data-testid="smart-select-militia"]', { timeout: 10_000 })
    const input = page.getByTestId('smart-select-militia-input')
    await input.click()
    await input.fill('zzz-no-match-xyz')
    await page.waitForTimeout(600)
    // Empty state shown but NO create button (no createModal prop on attendance form)
    await expect(page.getByTestId('smart-select-militia-empty')).toBeVisible()
    await expect(page.getByTestId('smart-select-militia-create-btn')).not.toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step23-no-create-btn.png' })
  })

  // SS-E2E-24: US-SS-03 AC-6 — Modal submit with empty name → inline error, modal stays open
  test('SS-E2E-24: Modal submit with empty required field → inline error shown (AC-6)', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('zzz-no-match-xyz')
    await page.waitForTimeout(600)
    await page.getByTestId('smart-select-assignee-create-btn').click()
    const modal = page.getByTestId('smart-select-assignee-modal')
    await expect(modal).toBeVisible()
    // Clear the name field so it's empty
    await page.getByTestId('quick-create-militia-name').fill('')
    // Submit with empty name
    await page.getByTestId('smart-select-assignee-modal-submit').click()
    // Modal must stay open (AC-6: không đóng khi lỗi)
    await expect(modal).toBeVisible()
    // Inline error shown for name
    await expect(page.getByTestId('quick-create-name-error')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step24-modal-validation-error.png' })
  })

  // SS-E2E-25: US-SS-03 AC-7 — Duplicate militia_code → inline conflict error
  test('SS-E2E-25: Duplicate militia_code → inline conflict error shown (AC-7)', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('zzz-no-match-xyz')
    await page.waitForTimeout(600)
    await page.getByTestId('smart-select-assignee-create-btn').click()
    const modal = page.getByTestId('smart-select-assignee-modal')
    await expect(modal).toBeVisible()
    // Use an existing militia code to trigger duplicate error
    await page.getByTestId('quick-create-militia-code').fill('HCM-PHD-T12-0001')
    await page.getByTestId('quick-create-militia-name').fill('Test Duplicate')
    await page.getByTestId('smart-select-assignee-modal-submit').click()
    // Modal must stay open
    await expect(modal).toBeVisible()
    // Inline code error shown for duplicate
    await expect(page.getByTestId('quick-create-code-error')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step25-modal-conflict-error.png' })
  })

  // SS-E2E-26: US-SS-03 AC-8 — Submit button shows loading state while POST pending
  test('SS-E2E-26: Modal submit pending → button shows loading spinner (AC-8)', async ({ page }) => {
    // Slow down the API response to catch the loading state
    let resolveRoute: (() => void) | null = null
    await page.route('**/militia/quick-create', async (route) => {
      await new Promise<void>((resolve) => { resolveRoute = resolve })
      await route.continue()
    })
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('zzz-pending-test')
    await page.waitForTimeout(600)
    await page.getByTestId('smart-select-assignee-create-btn').click()
    const modal = page.getByTestId('smart-select-assignee-modal')
    await expect(modal).toBeVisible()
    // Fill valid data
    await page.getByTestId('quick-create-militia-name').fill('Test Pending')
    // Click submit
    const submitBtn = page.getByTestId('smart-select-assignee-modal-submit')
    await submitBtn.click()
    // Button should be disabled/loading during API call (before route resolves)
    await expect(submitBtn).toBeDisabled()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step26-modal-loading.png' })
    // Unblock the route and clean up
    resolveRoute?.()
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  // SS-E2E-27: US-SS-03 AC-9 — Partial results (<5) + "Tạo mới" button shown simultaneously
  test('SS-E2E-27: Partial results (<5) shows results AND "Tạo mới" button (AC-9)', async ({ page }) => {
    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    // "an" matches some results but fewer than 5 — create btn should appear alongside
    await input.fill('an')
    await page.waitForTimeout(600)
    // At least one result visible
    await expect(page.locator('[data-testid^="smart-select-assignee-option-"]').first()).toBeVisible()
    // AND create button visible (partial results, AC-9)
    await expect(page.getByTestId('smart-select-assignee-create-btn')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step27-partial-results-create-btn.png' })
  })
})
