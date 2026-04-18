// E2E skeleton — AttendanceForm
// US-SS-07: Attendance recording with SmartSelect militia
// Created BEFORE implementation (Phase 0.5)
import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const ADMIN = { username: 'e2e_admin', password: 'E2eTest@Ad1' }

async function loginAs(page: import('@playwright/test').Page, user: { username: string; password: string }) {
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="username-input"]', { timeout: 15_000 })
  await page.getByTestId('username-input').fill(user.username)
  await page.getByTestId('password-input').fill(user.password)
  await page.getByTestId('login-btn').click()
  await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
}

test.describe('E2E: AttendanceForm', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/attendance/record`)
    await page.waitForSelector('[data-testid="attendance-form"]', { timeout: 10_000 })
  })

  test('ATT-E2E-01: Form renders militia SmartSelect and date fields', async ({ page }) => {
    await expect(page.getByTestId('smart-select-militia')).toBeVisible()
    await expect(page.getByTestId('attendance-date-input')).toBeVisible()
    await expect(page.getByTestId('attendance-status-select')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step01-att-form.png', fullPage: true })
  })

  test('ATT-E2E-02: Happy path — record attendance for militia member', async ({ page }) => {
    const input = page.getByTestId('smart-select-militia-input')
    await input.click()
    await input.fill('an')
    await page.waitForSelector('[data-testid^="smart-select-militia-option-"]', { timeout: 5_000 })
    await page.locator('[data-testid^="smart-select-militia-option-"]').first().click()

    await page.getByTestId('attendance-date-input').fill('2026-03-08')
    await page.getByTestId('attendance-status-select').selectOption('present')
    await page.getByTestId('attendance-submit-btn').click()
    await page.waitForSelector('[data-testid="attendance-create-success"]', { timeout: 5_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step02-att-success.png', fullPage: true })
  })
})
