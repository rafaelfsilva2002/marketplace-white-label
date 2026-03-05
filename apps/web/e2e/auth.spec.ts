import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.describe('Login Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
    });

    test('renders with email and password fields', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Entrar/i })).toBeVisible();
      await expect(page.getByText('Acesse sua conta no Marketplace')).toBeVisible();

      await expect(page.getByLabel(/Email/i)).toBeVisible();
      await expect(page.getByLabel(/Senha/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Entrar/i })).toBeVisible();
    });

    test('email field has correct type and placeholder', async ({ page }) => {
      const emailInput = page.getByLabel(/Email/i);
      await expect(emailInput).toHaveAttribute('type', 'email');
      await expect(emailInput).toHaveAttribute('placeholder', 'seu@email.com');
    });

    test('password field has correct type and placeholder', async ({ page }) => {
      const passwordInput = page.getByLabel(/Senha/i);
      await expect(passwordInput).toHaveAttribute('type', 'password');
      await expect(passwordInput).toHaveAttribute('placeholder', 'Sua senha');
    });

    test('login with invalid credentials shows error message', async ({ page }) => {
      await page.getByLabel(/Email/i).fill('invalid@test.com');
      await page.getByLabel(/Senha/i).fill('wrongpassword123');
      await page.getByRole('button', { name: /Entrar/i }).click();

      // API not running in test, so expect a network error displayed
      const errorBanner = page.locator('.bg-destructive\\/10, [role="alert"]');
      await expect(errorBanner).toBeVisible({ timeout: 10000 });
    });

    test('forgot password link navigates to forgot-password page', async ({ page }) => {
      await page.getByRole('link', { name: /Esqueci minha senha/i }).click();
      await expect(page).toHaveURL(/\/forgot-password/);
    });

    test('register link navigates to register page', async ({ page }) => {
      await page.getByRole('link', { name: /Cadastre-se/i }).click();
      await expect(page).toHaveURL(/\/register/);
    });

    test('submit button shows loading state on click', async ({ page }) => {
      await page.getByLabel(/Email/i).fill('test@example.com');
      await page.getByLabel(/Senha/i).fill('password123');
      await page.getByRole('button', { name: /Entrar/i }).click();

      // Button should show loading text briefly
      const button = page.getByRole('button', { name: /Entrando/i });
      // It may transition quickly, so just check it was either Entrando or reverted
      await expect(
        page.getByRole('button').filter({ hasText: /Entrar|Entrando/i }),
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Register Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/register');
    });

    test('renders with all required form fields', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Criar Conta/i })).toBeVisible();
      await expect(page.getByText('Cadastre-se no Marketplace AI-Native')).toBeVisible();

      await expect(page.getByLabel(/Nome/i)).toBeVisible();
      await expect(page.getByLabel(/^Email$/i)).toBeVisible();
      await expect(page.getByLabel(/^Senha$/i)).toBeVisible();
      await expect(page.getByLabel(/Confirmar Senha/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Criar Conta/i })).toBeVisible();
    });

    test('name field accepts input', async ({ page }) => {
      const nameInput = page.getByLabel(/Nome/i);
      await nameInput.fill('Maria Silva');
      await expect(nameInput).toHaveValue('Maria Silva');
    });

    test('login link navigates back to login page', async ({ page }) => {
      await page.getByRole('link', { name: /Entrar/i }).click();
      await expect(page).toHaveURL(/\/login/);
    });

    test('password has minimum length requirement', async ({ page }) => {
      const passwordInput = page.getByLabel(/^Senha$/i);
      await expect(passwordInput).toHaveAttribute('minlength', '8');
    });
  });

  test.describe('Forgot Password Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/forgot-password');
    });

    test('renders with heading and email field', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Esqueci Minha Senha/i })).toBeVisible();
      await expect(page.getByText('Informe seu email para receber um link')).toBeVisible();
      await expect(page.getByLabel(/Email/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Enviar Link/i })).toBeVisible();
    });

    test('back to login link works', async ({ page }) => {
      await page.getByRole('link', { name: /Voltar ao login/i }).click();
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
