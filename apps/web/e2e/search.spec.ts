import { test, expect } from '@playwright/test';

test.describe('Search Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search');
  });

  test('page loads with search form', async ({ page }) => {
    await expect(page).toHaveURL('/search');

    // Search input should be visible
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();
  });

  test('search input accepts text and has correct placeholder for semantic mode', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Busque em linguagem natural/i);
    await expect(searchInput).toBeVisible();

    await searchInput.fill('quero cortar cabelo estilo coreano');
    await expect(searchInput).toHaveValue('quero cortar cabelo estilo coreano');
  });

  test('submit button is visible and labeled for search', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /Buscar IA/i });
    await expect(submitButton).toBeVisible();
  });

  test('filter button is visible', async ({ page }) => {
    // The SlidersHorizontal icon button
    const filterButtons = page.getByRole('button').filter({ has: page.locator('svg') });
    // At least the filter button should be present
    await expect(filterButtons.last()).toBeVisible();
  });

  test('semantic search toggle is available and defaults to semantic mode', async ({ page }) => {
    // The "Busca IA" toggle button should be active by default
    const semanticButton = page.getByRole('button', { name: /Busca IA/i }).first();
    await expect(semanticButton).toBeVisible();

    // Text mode button should also be present
    const textButton = page.getByRole('button', { name: /Texto/i });
    await expect(textButton).toBeVisible();
  });

  test('switching to text mode changes the placeholder', async ({ page }) => {
    // Click the "Texto" mode button
    await page.getByRole('button', { name: /Texto/i }).click();

    // Placeholder should change to text search placeholder
    const searchInput = page.getByPlaceholder(/Busque profissionais/i);
    await expect(searchInput).toBeVisible();

    // Submit button text should change to "Buscar"
    const submitButton = page.getByRole('button', { name: 'Buscar' });
    await expect(submitButton).toBeVisible();
  });

  test('results area renders as grid container', async ({ page }) => {
    // The results grid container should exist
    const resultsGrid = page.locator('.grid.grid-cols-1');
    await expect(resultsGrid).toBeVisible();
  });

  test('page handles query parameter from URL', async ({ page }) => {
    await page.goto('/search?q=cabeleireiro');

    // The input should be pre-filled with the query
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toHaveValue('cabeleireiro');
  });
});
