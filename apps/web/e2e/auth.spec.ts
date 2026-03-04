import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('login form has email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/senha|password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar|login/i })).toBeVisible();
  });

  test('register form has required fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/senha|password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /cadastr|register/i })).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('invalid@test.com');
    await page.getByLabel(/senha|password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /entrar|login/i }).click();
    // Should show error message (API not running in test, so expect network error or validation error)
    await expect(page.locator('.text-destructive, [role="alert"]')).toBeVisible({ timeout: 5000 });
  });
});
