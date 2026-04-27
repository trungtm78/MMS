import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:5173'

test('DIAG: Capture login network + console', async ({ page }) => {
  const requests: Array<{ url: string; method: string; status?: number; body?: string }> = []
  const consoleMsgs: string[] = []

  page.on('request', (req) => {
    if (req.url().includes('/auth/login') || req.url().includes('api')) {
      requests.push({ url: req.url(), method: req.method() })
    }
  })
  page.on('response', async (res) => {
    if (res.url().includes('/auth/login')) {
      try {
        const body = await res.text()
        requests.push({ url: res.url(), method: 'RESPONSE', status: res.status(), body: body.substring(0, 200) })
      } catch {}
    }
  })
  page.on('console', (msg) => {
    consoleMsgs.push(`[${msg.type()}] ${msg.text()}`)
  })
  page.on('pageerror', (err) => {
    consoleMsgs.push(`[pageerror] ${err.message}`)
  })

  await page.goto(`${BASE}/login`)
  await page.waitForSelector('[data-testid="username-input"]', { timeout: 10_000 })
  await page.getByTestId('username-input').fill('uat_admin')
  await page.getByTestId('password-input').fill('Test@1234')

  // Check value was set
  const usernameVal = await page.getByTestId('username-input').inputValue()
  const passwordVal = await page.getByTestId('password-input').inputValue()
  console.log('USERNAME VALUE:', usernameVal)
  console.log('PASSWORD VALUE:', passwordVal)

  await page.getByTestId('login-btn').click()
  await page.waitForTimeout(5000)

  console.log('FINAL URL:', page.url())
  console.log('REQUESTS:', JSON.stringify(requests, null, 2))
  console.log('CONSOLE:', consoleMsgs.join('\n'))

  // Save screenshot
  await page.screenshot({ path: 'test-results/uat/diag2-after-login.png', fullPage: true })

  // Just pass - this is diagnostic
  expect(requests.length).toBeGreaterThan(0)
})
