import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads and shows hero section with heading', async ({ page }) => {
    const hero = page.locator('.bg-gradient-to-br');
    await expect(hero).toBeVisible();

    const heading = hero.locator('h1');
    await expect(heading).toContainText('Encontre o profissional ideal');
  });

  test('hero section displays AI-powered search description', async ({ page }) => {
    const description = page.getByText('Busca inteligente powered by IA');
    await expect(description).toBeVisible();
  });

  test('search bar is visible and accepts input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/quero alguem pra cortar cabelo/i);
    await expect(searchInput).toBeVisible();

    await searchInput.fill('cabeleireiro em Sao Paulo');
    await expect(searchInput).toHaveValue('cabeleireiro em Sao Paulo');
  });

  test('location input is visible in hero search form', async ({ page }) => {
    const locationInput = page.getByPlaceholder(/cidade ou bairro/i);
    await expect(locationInput).toBeVisible();

    await locationInput.fill('Sao Paulo');
    await expect(locationInput).toHaveValue('Sao Paulo');
  });

  test('search suggestion tags are rendered and clickable', async ({ page }) => {
    const suggestions = ['Cabeleireiro', 'Personal Trainer', 'Massagista', 'Manicure', 'Fotografo'];

    for (const suggestion of suggestions) {
      const tag = page.getByRole('button', { name: suggestion });
      await expect(tag).toBeVisible();
    }

    // Clicking a suggestion should navigate to search
    await page.getByRole('button', { name: 'Cabeleireiro' }).click();
    await expect(page).toHaveURL(/\/search\?q=Cabeleireiro/);
  });

  test('featured profiles section renders heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /Profissionais em Destaque/i });
    await expect(heading).toBeVisible();
  });

  test('navigation links are present in header', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();

    await expect(header.getByRole('link', { name: /Categorias/i })).toBeVisible();
    await expect(header.getByRole('link', { name: /Buscar/i })).toBeVisible();
    await expect(header.getByRole('link', { name: /Entrar/i })).toBeVisible();
    await expect(header.getByRole('link', { name: /Cadastrar/i })).toBeVisible();
  });

  test('footer is visible with marketplace branding', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('Marketplace AI-Native');
  });
});
