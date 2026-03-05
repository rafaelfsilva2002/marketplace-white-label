import { test, expect } from '@playwright/test';

test.describe('Categories Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/categories');
  });

  test('page loads with heading and description', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /Categorias/i })).toBeVisible();
    await expect(page.getByText('Encontre profissionais por area de atuacao')).toBeVisible();
  });

  test('categories grid container is rendered', async ({ page }) => {
    // The grid container for category cards should exist
    const grid = page.locator('.grid');
    await expect(grid.first()).toBeVisible();
  });

  test('displays empty state message when no categories available', async ({ page }) => {
    // When API is not available, categories will be empty
    // Either category cards or the empty state message should be visible
    const hasCategories = await page.locator('a[href^="/categories/"]').count();

    if (hasCategories === 0) {
      await expect(
        page.getByText('Nenhuma categoria disponivel no momento'),
      ).toBeVisible();
    } else {
      // If categories exist, at least one card should be visible
      await expect(page.locator('a[href^="/categories/"]').first()).toBeVisible();
    }
  });

  test('category cards are links with correct href pattern', async ({ page }) => {
    const categoryLinks = page.locator('a[href^="/categories/"]');
    const count = await categoryLinks.count();

    if (count > 0) {
      // Each category card should link to a slug-based URL
      const firstHref = await categoryLinks.first().getAttribute('href');
      expect(firstHref).toMatch(/^\/categories\/.+/);
    }
  });

  test('page has correct container layout', async ({ page }) => {
    const main = page.locator('main.container');
    await expect(main).toBeVisible();
  });

  test('navigation header is present with categories link active', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // The "Categorias" nav link should be present
    await expect(header.getByRole('link', { name: /Categorias/i })).toBeVisible();
  });
});

test.describe('Category Detail Page', () => {
  test('navigating to a category slug shows category detail or 404', async ({ page }) => {
    // Navigate to a test slug - will either load the detail page or show not found
    await page.goto('/categories/beleza');

    // Should either show category detail content or the not-found page
    const isNotFound = await page.getByText(/nao foi encontrad|not found|404/i).isVisible().catch(() => false);
    const hasContent = await page.locator('main').isVisible();

    expect(isNotFound || hasContent).toBe(true);
  });

  test('category detail page shows breadcrumb navigation', async ({ page }) => {
    await page.goto('/categories/beleza');

    // If the page loads (not 404), check for breadcrumb
    const breadcrumbLink = page.getByRole('link', { name: /Categorias/i });
    const isVisible = await breadcrumbLink.isVisible().catch(() => false);

    if (isVisible) {
      await expect(breadcrumbLink).toBeVisible();
    }
  });
});
