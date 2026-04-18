import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.getByTestId('login-username')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.getByTestId('login-username').fill('dqtv001');
    await page.getByTestId('login-password').fill('123456');
    await page.getByTestId('login-submit').click();
    
    await expect(page).toHaveURL(/.*home/);
    await expect(page.getByText('Chào buổi sáng')).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.getByTestId('login-username').fill('invalid');
    await page.getByTestId('login-password').fill('wrong');
    await page.getByTestId('login-submit').click();
    
    await expect(page.getByText('Sai tên đăng nhập hoặc mật khẩu')).toBeVisible();
  });
});
