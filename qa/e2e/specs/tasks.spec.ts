import { test, expect } from '@playwright/test';

test.describe('Task Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').fill('dqtv001');
    await page.getByTestId('login-password').fill('123456');
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/.*home/);
    
    // Navigate to tasks tab
    await page.getByRole('button', { name: /Nhiệm vụ/i }).click();
  });

  test('should display task list', async ({ page }) => {
    await expect(page.getByText('Nhiệm Vụ Củа Tôi')).toBeVisible();
  });

  test('should accept a task', async ({ page }) => {
    const acceptButton = page.getByRole('button', { name: /Tiếp nhận/i }).first();
    if (await acceptButton.isVisible().catch(() => false)) {
      await acceptButton.click();
      await expect(page.getByText('Đang làm')).toBeVisible();
    }
  });
});
