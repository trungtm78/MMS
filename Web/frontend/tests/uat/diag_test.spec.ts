import { test, expect } from '@playwright/test'
test('diag: capture login network', async ({ page }) => {
  const responses: { url: string, status: number, body: string }[] = []
  page.on('response', async (res) => {
    if (res.url().includes('auth/login')) {
      try {
        const body = await res.text()
        responses.push({ url: res.url(), status: res.status(), body: body.slice(0, 300) })
      } catch {}
    }
  })
  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  
  await page.goto('http://localhost:5173/login')
  await page.waitForSelector('[data-testid="username-input"]')
  await page.getByTestId('username-input').fill('uat_admin')
  await page.getByTestId('password-input').fill('Test@1234')
  await page.getByTestId('login-btn').click()
  await page.waitForTimeout(5000)
  
  console.log('URL after 5s:', page.url())
  console.log('Network responses:', JSON.stringify(responses))
  console.log('Console errors:', JSON.stringify(errors))
  console.log('Page content snippet:', (await page.content()).slice(0, 500))
})
