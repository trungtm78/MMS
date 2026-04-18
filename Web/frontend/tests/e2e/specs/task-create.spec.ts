// E2E skeleton — TaskCreateForm
// US-SS-06: Task creation with SmartSelect assignee
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

test.describe('E2E: TaskCreateForm', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto(`${BASE}/tasks/new`)
    await page.waitForSelector('[data-testid="task-create-form"]', { timeout: 10_000 })
  })

  test('TASK-E2E-01: Form renders all fields', async ({ page }) => {
    await expect(page.getByTestId('task-title-input')).toBeVisible()
    await expect(page.getByTestId('task-description-input')).toBeVisible()
    await expect(page.getByTestId('task-due-date-input')).toBeVisible()
    await expect(page.getByTestId('smart-select-assignee')).toBeVisible()
    await expect(page.getByTestId('task-submit-btn')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step01-task-form.png', fullPage: true })
  })

  test('TASK-E2E-02: Validation — required fields', async ({ page }) => {
    await page.getByTestId('task-submit-btn').click()
    await expect(page.getByTestId('task-title-error')).toBeVisible()
    await expect(page.getByTestId('smart-select-assignee-error')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step02-task-validation.png', fullPage: true })
  })

  test('TASK-E2E-03: Happy path — create task with assignee', async ({ page }) => {
    await page.getByTestId('task-title-input').fill('E2E Task Happy Path')
    await page.getByTestId('task-description-input').fill('Created by E2E test')
    await page.getByTestId('task-due-date-input').fill('2026-12-31')

    const input = page.getByTestId('smart-select-assignee-input')
    await input.click()
    await input.fill('an')
    await page.waitForSelector('[data-testid^="smart-select-assignee-option-"]', { timeout: 5_000 })
    await page.locator('[data-testid^="smart-select-assignee-option-"]').first().click()
    await expect(page.getByTestId('smart-select-assignee-selected')).toBeVisible()

    await page.getByTestId('task-submit-btn').click()
    await page.waitForSelector('[data-testid="task-create-success"]', { timeout: 10_000 })
    await page.screenshot({ path: 'test-results/uat/screenshots/smartselect-step03-task-success.png', fullPage: true })
  })
})
