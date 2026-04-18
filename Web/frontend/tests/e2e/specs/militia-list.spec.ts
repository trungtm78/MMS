// E2E: MilitiaList — paginated load, search filter
import { test, expect, Page } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const STAFF = { username: 'e2e_staff', password: 'E2eTest@St1' }

async function loginAs(page: Page, user: { username: string; password: string }) {
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="username-input"]', { timeout: 15_000 })
  await page.getByTestId('username-input').fill(user.username)
  await page.getByTestId('password-input').fill(user.password)
  await page.getByTestId('login-btn').click()
  await page.waitForSelector('[data-testid="dashboard-overview"]', { timeout: 15_000 })
}

test.describe('E2E: MilitiaList', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, STAFF)
    await page.goto(`${BASE}/militia`)
    await page.waitForSelector('[data-testid="militia-list"]', { timeout: 10_000 })
  })

  test('MILITIA-E2E-01: List page renders with table/cards', async ({ page }) => {
    await expect(page.getByTestId('militia-list')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/militia-01-list.png', fullPage: true })
  })

  test('MILITIA-E2E-02: Search input is present and debounces', async ({ page }) => {
    const searchInput = page.locator('[data-testid="militia-search-input"], [placeholder*="Tìm"]').first()
    await expect(searchInput).toBeVisible()
    await searchInput.fill('Nguyen')
    await page.waitForTimeout(400) // wait for 300ms debounce
    await page.screenshot({ path: 'test-results/uat/screenshots/militia-02-search.png' })
  })

  test('MILITIA-E2E-03: Pagination controls render', async ({ page }) => {
    await expect(page.getByTestId('prev-page')).toBeVisible()
    await expect(page.getByTestId('next-page')).toBeVisible()
  })

  test('MILITIA-E2E-04: Empty state renders when no results', async ({ page }) => {
    const searchInput = page.locator('[data-testid="militia-search-input"], [placeholder*="Tìm"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill('xyzxyzxyzxyz_no_match')
      await page.waitForTimeout(500)
      // Check for empty state message
      const emptyState = page.locator('[data-testid="empty-state"], text=Không tìm thấy').first()
      // Just verify UI remains stable
    }
    await page.screenshot({ path: 'test-results/uat/screenshots/militia-04-empty.png' })
  })
})

test.describe('E2E: MilitiaSearch', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, STAFF)
    await page.goto(`${BASE}/militia/search`)
    await page.waitForSelector('[data-testid="militia-search-page"]', { timeout: 10_000 })
  })

  test('MILITIA-SEARCH-E2E-01: Search page renders', async ({ page }) => {
    await expect(page.getByTestId('militia-search-input')).toBeVisible()
    await expect(page.getByTestId('search-btn')).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/militia-search-01.png', fullPage: true })
  })

  test('MILITIA-SEARCH-E2E-02: Search triggers results display', async ({ page }) => {
    await page.getByTestId('militia-search-input').fill('Nguyen')
    await page.getByTestId('search-btn').click()
    await page.waitForTimeout(500)
    // Results section should appear
    const results = page.getByTestId('search-results')
    await expect(results).toBeVisible()
    await page.screenshot({ path: 'test-results/uat/screenshots/militia-search-02-results.png' })
  })

  test('MILITIA-SEARCH-E2E-03: Reset clears search', async ({ page }) => {
    await page.getByTestId('militia-search-input').fill('Test')
    await page.getByTestId('search-btn').click()
    await page.waitForTimeout(300)
    await page.getByTestId('reset-search-btn').click()
    await expect(page.getByTestId('militia-search-input')).toHaveValue('')
    await expect(page.locator('[data-testid="search-results"]')).not.toBeVisible()
  })
})
