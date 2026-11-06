import { expect, test } from '@playwright/test';

test('combos por defecto, ocho imágenes y feedback de 1500 ms después de sumar', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', 'https://wa.me/5491151354489');
  await expect(page.getByRole('link', { name: 'Instagram', exact: true })).toHaveAttribute('href', 'https://www.instagram.com/burgerplanet/');
  await expect(page.getByRole('link', { name: 'TikTok', exact: true })).toHaveAttribute('href', 'https://www.tiktok.com/@burgerplanet');
  await expect(page.locator('#promos')).toContainText('ORBITA10');
  await expect(page.locator('#business-hours-list')).toContainText('12:00 a 15:00 y 19:00 a 23:00');
  await expect(page.locator('#copyright-year')).toHaveText(String(new Date().getFullYear()));
  for (const link of await page.locator('footer a[href^="https://"]').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  const instagram = page.getByRole('link', { name: 'Instagram', exact: true });
  await instagram.hover();
  await expect(instagram).toHaveCSS('background-color', 'rgb(255, 121, 63)');
  for (const [label, path] of [['Privacidad', '/privacidad/'], ['Términos', '/terminos/']]) {
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', path);
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('<h1>' + label + '</h1>');
  }
  await expect(page.getByRole('link', { name: 'Ramiro García', exact: true })).toHaveAttribute('href', 'https://ramita.dev');
  const names = await page.getByRole('tab').allTextContents();
  expect(names.map((name) => name.trim())).toEqual(['Combos', 'Hamburguesas', 'Papas', 'Bebidas']);
  await expect(page.getByRole('tab', { name: 'Combos', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: 'Ver menú' })).toHaveCount(0);

  const panel = page.getByRole('tabpanel', { name: 'Combos' });
  const sources = await panel.locator('article img').evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
  expect(new Set(sources).size).toBe(8);
  const results = await Promise.all(sources.map((source) => page.request.get(source)));
  expect(results.every((response) => response.ok())).toBe(true);
  await page.getByRole('link', { name: 'Hacé tu pedido' }).click();
  await panel.locator('article img').first().evaluate((node) => (node as HTMLImageElement).decode());
  await page.screenshot({ path: testInfo.outputPath('catalogo.png') });

  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
  const trigger = panel.getByRole('button', { name: 'Agregar Mercurio con papas', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Mercurio con papas' });
  await expect(dialog).toBeVisible();
  await expect(panel.locator('[data-pick="combo-mercurio"]')).not.toHaveAttribute('data-added');
  await dialog.getByRole('button', { name: 'Sumar al pedido' }).click();

  const added = panel.getByRole('button', { name: 'Agregado Mercurio con papas', exact: true });
  await expect(added).toHaveAttribute('aria-disabled', 'true');
  await added.click({ force: true });
  await expect(page.getByRole('button', { name: 'Abrir carrito, 1 producto' }).first()).toBeVisible();
  await page.clock.runFor(1499);
  await expect(added).toBeVisible();
  await page.clock.runFor(1);
  await expect(trigger).toBeEnabled();
});
