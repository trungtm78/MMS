// E2E skeleton — UserForm
// US-SS-08: User creation with unit SmartSelect
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

test.describe('E2E: UserForm', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/users/new`)
    await page.waitForSelector('[data-testid="user-form"]', { timeout: 10_000 })
  })

  test('USER-E2E-01: Form renders unit SmartSelect', async ({ page }) => {
    await expect(page.getByTestId('smart-select-unit')).toBeVisible()
    await expect(page.getByTestId('user-username-input')).toBeVisible()
    await expect(page.getByTestId('user-role-select')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step01-user-form.png', fullPage: true })
  })

  test('USER-E2E-02: Search unit by name', async ({ page }) => {
    const input = page.getByTestId('smart-select-unit-input')
    await input.click()
    await input.fill('phu')
    await page.waitForTimeout(600)
    const dropdown = page.getByTestId('smart-select-unit-dropdown')
    await expect(dropdown).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step02-user-unit-search.png' })
  })
})
