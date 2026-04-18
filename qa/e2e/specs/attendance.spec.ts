import { test, expect } from '@playwright/test';

test.describe('Attendance Check-in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').fill('dqtv001');
    await page.getByTestId('login-password').fill('123456');
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/.*home/);
    
    // Navigate to check-in tab
    await page.getByRole('button', { name: /Điểm danh/i }).click();
  });

  test('should display check-in screen', async ({ page }) => {
    await expect(page.getByText('Điểm Danh')).toBeVisible();
    await expect(page.getByTestId('attendance-checkin-btn')).toBeVisible();
  });

  test('should check-in successfully', async ({ page }) => {
    // Mock geolocation
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({
          coords: {
            latitude: 10.762622,
            longitude: 106.660172,
            accuracy: 10,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      };
    });
    
    await page.getByTestId('attendance-checkin-btn').click();
    await expect(page.getByText('Thành công')).toBeVisible();
  });
});
