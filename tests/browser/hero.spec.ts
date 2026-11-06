import { expect, test } from '@playwright/test';

for (const [width, height] of [[320, 780], [390, 844], [1440, 1000]]) {
  test('hero con animación libre y navegación por Scroll a ' + width + ' px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const hero = page.locator('.hero');
    const burger = hero.locator('.solar-burger img');
    const planet = hero.locator('.jupiter .planet');
    await expect(burger).toHaveCSS('animation-name', 'drift');
    await expect(planet).toHaveCSS('animation-name', 'orbit');
    expect(await hero.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await burger.evaluate((image) => image.getBoundingClientRect().width / image.closest('.solar')!.clientWidth)).toBeLessThan(.5);
    await burger.evaluate((image) => (image as HTMLImageElement).decode());
    await page.screenshot({ path: testInfo.outputPath('hero.png') });

    const top = await hero.evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate(() => window.scrollTo({ top: 150, behavior: 'instant' }));
    expect(await hero.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(top - 100);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(burger).toHaveCSS('animation-name', 'none');
    await expect(planet).toHaveCSS('animation-name', 'none');
    await hero.getByRole('link', { name: 'Scroll', exact: true }).click();
    await expect(page).toHaveURL(/#menu$/);
    await expect(page.getByRole('heading', { name: /Elegí tu órbita/ })).toBeInViewport();
  });
}
