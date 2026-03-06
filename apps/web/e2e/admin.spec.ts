import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createTestJwt(
  payload: Record<string, string | number>,
  secret = process.env.JWT_SECRET ?? 'e2e-jwt-secret-change-in-production',
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${header}.${body}.${signature}`;
}

async function seedAdminAuth(page: import('@playwright/test').Page, token: string) {
  await page.context().addCookies([
    {
      name: 'accessToken',
      value: token,
      url: 'http://localhost:3000',
    },
  ]);

  await page.addInitScript((accessToken) => {
    window.localStorage.setItem('accessToken', accessToken);
    window.localStorage.setItem('refreshToken', 'e2e-refresh-token');
  }, token);
}

test.describe('Admin Panel', () => {
  test.describe('Unauthenticated Access', () => {
    test('admin dashboard redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });

    test('admin analytics redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/analytics');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });

    test('admin moderation redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/moderation');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });

    test('admin users page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/usuarios');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });

    test('admin redirects to login when token cookie is malformed', async ({ page }) => {
      await page.context().addCookies([
        {
          name: 'accessToken',
          value: 'invalid.jwt',
          url: 'http://localhost:3000',
        },
      ]);

      await page.goto('/admin');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });
  });

  test.describe('Authenticated Admin Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      const now = Math.floor(Date.now() / 1000);
      const token = createTestJwt({
        sub: 'e2e-admin-user',
        role: 'admin',
        exp: now + 60 * 60,
      });

      await seedAdminAuth(page, token);
      await page.goto('/admin');
    });

    test('dashboard renders with page header', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Dashboard/i }).first()).toBeVisible();
      await expect(page.getByText('Visao geral da plataforma')).toBeVisible();
    });

    test('sidebar navigation is present with all admin sections', async ({ page }) => {
      // Check sidebar nav items exist
      const sidebar = page.locator('aside');

      await expect(sidebar.getByText('Painel Admin')).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /Dashboard/i })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /Analytics/i })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /Moderacao/i })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /Usuarios/i })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /Workflows/i })).toBeVisible();
    });

    test('refresh button is visible in dashboard header', async ({ page }) => {
      const refreshButton = page.getByRole('button', { name: /Atualizar/i });
      await expect(refreshButton).toBeVisible();
    });

    test('quick links section renders with navigation shortcuts', async ({ page }) => {
      await expect(page.getByText('Acesso Rapido')).toBeVisible();

      // Quick links should include these destinations
      await expect(page.getByRole('link', { name: /Analytics/i }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /Moderacao|Ver Fila/i }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /Usuarios|Gerenciar/i }).first()).toBeVisible();
    });

    test('stat cards area renders with loading skeletons or data', async ({ page }) => {
      // Should show either skeleton loaders or actual stat cards
      const statsGrid = page.locator('.grid.gap-4');
      await expect(statsGrid.first()).toBeVisible();

      // Either skeletons (animate-pulse) or stat card content should be present
      const hasSkeletons = await page.locator('.animate-pulse').count();
      const hasStatCards = await page.locator('[class*="CardTitle"]').count();

      expect(hasSkeletons > 0 || hasStatCards > 0).toBe(true);
    });

    test('recent users section is visible', async ({ page }) => {
      await expect(page.getByText('Usuarios Recentes')).toBeVisible();
      await expect(page.getByText('Ultimos usuarios cadastrados')).toBeVisible();
    });

    test('sidebar logout button is present', async ({ page }) => {
      const logoutButton = page.getByRole('button', { name: /Sair/i });
      await expect(logoutButton).toBeVisible();
    });
  });

  test.describe('Admin Analytics Page (Authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      const now = Math.floor(Date.now() / 1000);
      const token = createTestJwt({
        sub: 'e2e-admin-user',
        role: 'admin',
        exp: now + 60 * 60,
      });

      await seedAdminAuth(page, token);
      await page.goto('/admin/analytics');
    });

    test('analytics page renders with header and period selector', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Analytics/i }).first()).toBeVisible();
      await expect(page.getByText('Metricas detalhadas da plataforma')).toBeVisible();

      // Period selector buttons
      await expect(page.getByRole('button', { name: /7 dias/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /30 dias/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /90 dias/i })).toBeVisible();
    });
  });
});
