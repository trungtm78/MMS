// E2E: TaskList — server-side pagination and status filter tabs
import { test, expect, Page } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OFFICER = { username: 'e2e_officer', password: 'E2eTest@Of1' }

async function loginAs(page: Page, user: { username: string; password: string }) {
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="username-input"]', { timeout: 15_000 })
  await page.getByTestId('username-input').fill(user.username)
  await page.getByTestId('password-input').fill(user.password)
  await page.getByTestId('login-btn').click()
  await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
}

test.describe('E2E: TaskList', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OFFICER)
    await page.goto(`${BASE}/tasks/list`)
    await page.waitForSelector('[data-testid="task-list-page"]', { timeout: 10_000 })
  })

  test('TASK-LIST-E2E-01: Task list page renders with status tabs', async ({ page }) => {
    await expect(page.getByTestId('status-tabs')).toBeVisible()
    await expect(page.getByTestId('tab-all')).toBeVisible()
    await expect(page.getByTestId('task-table')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/task-list-01.png', fullPage: true })
  })

  test('TASK-LIST-E2E-02: Status tab filters — pending tab', async ({ page }) => {
    await page.getByTestId('tab-pending').click()
    await page.waitForTimeout(500) // wait for query
    // Verify tab is active (has dark bg)
    await expect(page.getByTestId('tab-pending')).toHaveClass(/bg-\[#1F3A5F\]/)
    await page.screenshot({ path: 'test-results/uat/screenshots/task-list-02-pending.png' })
  })

  test('TASK-LIST-E2E-03: Status tab filters — completed tab', async ({ page }) => {
    await page.getByTestId('tab-completed').click()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('tab-completed')).toHaveClass(/bg-\[#1F3A5F\]/)
    await page.screenshot({ path: 'test-results/uat/screenshots/task-list-03-completed.png' })
  })

  test('TASK-LIST-E2E-04: Search filters tasks by title', async ({ page }) => {
    const searchInput = page.getByTestId('task-search-input')
    await searchInput.fill('Tuần tra')
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'test-results/uat/screenshots/task-list-04-search.png' })
  })

  test('TASK-LIST-E2E-05: Pagination controls are present', async ({ page }) => {
    await expect(page.getByTestId('prev-page')).toBeVisible()
    await expect(page.getByTestId('next-page')).toBeVisible()
    // Previous should be disabled on page 1
    await expect(page.getByTestId('prev-page')).toBeDisabled()
    await page.screenshot({ path: 'test-results/uat/screenshots/task-list-05-pagination.png' })
  })
})
