import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Marketplace/i);
  });

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading')).toContainText(/login|entrar/i);
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading')).toContainText(/cadastr|register|criar conta/i);
  });

  test('search page loads', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL('/search');
  });

  test('admin redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
