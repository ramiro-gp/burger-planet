import { expect, test, type Page } from '@playwright/test';
import { tabs } from '../../src/lib/catalog';
import { csv, mockNumber, testUrls } from '../fixtures';

const cart = (page: Page) => page.getByRole('dialog', { name: 'Carrito' });
const product = (page: Page) => page.locator('#product-dialog');
const checkout = (page: Page) => page.getByRole('dialog', { name: 'Confirmá los datos' });

async function addMercury(page: Page, discs = '1') {
  await page.getByRole('tab', { name: 'Hamburguesas' }).click();
  await page.getByRole('button', { name: 'Agregar Mercurio', exact: true }).click();
  if (discs !== '1') await product(page).getByRole('radio', { name: discs, exact: true }).check();
  await product(page).getByRole('button', { name: 'Sumar al pedido' }).click();
}

async function openCheckout(page: Page) {
  await page.getByRole('button', { name: /Abrir carrito/ }).first().click();
  await cart(page).getByRole('button', { name: 'Continuar pedido' }).click();
}

async function fillCustomer(page: Page) {
  const form = checkout(page);
  await form.getByRole('textbox', { name: 'Nombre' }).fill('Ana de Prueba');
  await form.getByRole('textbox', { name: 'Teléfono' }).fill('202-555-0123');
  await form.getByRole('textbox', { name: 'Dirección completa' }).fill('Calle de prueba 123, Buenos Aires');
}

async function mockSheets(page: Page) {
  const state = { price: 8400, shipping: 2000, percent: 10, disabled: false, failed: false, csvRequests: 0, opened: '' };
  await page.route('**/catalog-source.json', (route) => route.fulfill({ json: { mode: 'sheets', urls: testUrls } }));
  await page.route('https://docs.google.com/spreadsheets/**', async (route) => {
    state.csvRequests++;
    const gid = Number(new URL(route.request().url()).searchParams.get('gid'));
    const tab = tabs[gid];
    if (state.failed && tab === 'extras') { await route.abort('failed'); return; }
    let body = csv[tab];
    if (tab === 'hamburguesas') {
      body = body.replace(',8400,', ',' + state.price + ',');
      if (state.disabled) body = body.replace('/images/mercurio.webp,si,', '/images/mercurio.webp,no,');
    }
    if (tab === 'configuracion') {
      body = body .replace('costo_envio,2000', 'costo_envio,' + state.shipping).replace('cupon_porcentaje,10', 'cupon_porcentaje,' + state.percent).replace(/^whatsapp,.*$/m, 'whatsapp,' + mockNumber);
    }
    await route.fulfill({ body, contentType: 'text/csv; charset=utf-8', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.context().route('https://wa.me/**', (route) => {
    state.opened = route.request().url();
    return route.fulfill({ contentType: 'text/html', body: '<h1>WhatsApp interceptado por la prueba</h1>' });
  });
  return state;
}

test('escritorio: variantes, extras, edición, cantidades, retiro y persistencia', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Vista previa con precios de muestra.')).toBeVisible();
  await addMercury(page);
  await page.getByRole('button', { name: 'Agregar Mercurio', exact: true }).click();
  await product(page).getByRole('radio', { name: '4', exact: true }).check();
  await product(page).getByRole('checkbox', { name: /Cheddar adicional/ }).check();
  await product(page).getByRole('checkbox', { name: /Bacon/ }).check();
  await product(page).getByRole('textbox', { name: /Observaciones del producto/ }).fill('Sin pepinos');
  await expect(page.locator('#product-total')).toHaveText(/16\.800/);
  await product(page).getByRole('button', { name: 'Sumar al pedido' }).click();
  await page.getByRole('button', { name: /Abrir carrito/ }).first().click();
  const rows = cart(page).locator('.cart-line');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('4 discos');
  await expect(rows.nth(1)).toContainText('Sin pepinos');
  await rows.nth(1).getByRole('button', { name: 'Sumar una unidad' }).click();
  await expect(page.locator('#cart-total')).toHaveText(/44\.000/);
  await rows.nth(1).getByRole('button', { name: 'Restar una unidad' }).click();
  await expect(page.locator('#cart-total')).toHaveText(/27\.200/);
  await rows.nth(1).getByRole('button', { name: 'Sumar una unidad' }).click();
  await rows.nth(1).getByRole('button', { name: 'Editar' }).click();
  await expect(product(page).getByRole('radio', { name: '4', exact: true })).toBeChecked();
  await product(page).getByRole('radio', { name: '3', exact: true }).check();
  await product(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(rows.nth(1)).toContainText('3 discos');
  await rows.nth(0).getByRole('button', { name: 'Eliminar producto' }).click();
  await expect(rows).toHaveCount(1);
  await cart(page).getByRole('radio', { name: 'Retiro', exact: true }).check();
  await expect(page.locator('#cart-shipping')).toHaveText('Gratis');
  await expect(page.locator('#cart-total')).toHaveText(/29\.200/);
  await page.reload();
  await expect(page.getByText('Vista previa con precios de muestra.')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir carrito, 2 productos' }).first().click();
  await expect(rows.nth(0)).toContainText('3 discos');
  await expect(rows.nth(0)).toContainText('Extra: Cheddar');
  await expect(rows.nth(0)).not.toContainText('Sin pepinos');
  await expect(rows.nth(0)).toContainText(/29\.200/);
  const stored = await page.evaluate(() => localStorage.getItem('planet-burger:cart:v1'));
  expect(stored).not.toContain('Sin pepinos');
});

test('móvil: CTA a combos, papas y bebidas, edad, formulario y mensaje de muestra', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('Vista previa con precios de muestra.')).toBeVisible();
  await expect(page.locator('.hero')).toHaveCSS('position', 'static');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('link', { name: 'Hacé tu pedido' }).click();
  await expect(page.getByRole('tab', { name: 'Combos' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Agregar Venus con papas' }).click();
  await product(page).getByRole('radio', { name: '2', exact: true }).check();
  await product(page).getByRole('checkbox', { name: /Cheddar adicional/ }).check();
  await product(page).getByRole('radio', { name: /Papas con cheddar y bacon/ }).check();
  await expect(product(page).getByRole('radio', { name: 'Sin bebida' })).toBeChecked();
  await product(page).getByRole('radio', { name: /Heineken/ }).check();
  await expect(product(page).locator('#product-alcohol')).toHaveText('Prohibida la venta a menores de 18 años. Se solicitará DNI al entregar el pedido.');
  await expect(page.locator('#product-total')).toHaveText(/21\.600/);
  await product(page).getByRole('button', { name: 'Sumar al pedido' }).click();
  await page.getByRole('tab', { name: 'Papas' }).click();
  await page.getByRole('button', { name: 'Agregar Papas sazonadas' }).click();
  await page.getByRole('tab', { name: 'Bebidas' }).click();
  await page.getByRole('button', { name: 'Agregar Sprite' }).click();
  await openCheckout(page);
  const form = checkout(page);
  let opened = '';
  await page.context().route('https://wa.me/**', (route) => {
    opened = route.request().url();
    return route.fulfill({ contentType: 'text/html', body: '<h1>WhatsApp interceptado por la prueba</h1>' });
  });
  const preview = form.getByRole('button', { name: 'Hacer pedido' });
  await preview.click();
  await expect(form.getByRole('textbox', { name: 'Nombre' })).toBeFocused();
  await expect(form.getByText('Ingresá calle, número y localidad.')).toBeVisible();
  await fillCustomer(page);
  await preview.click();
  await expect(form.getByText('Confirmá que tenés 18 años o más.')).toBeVisible();
  await form.getByRole('checkbox', { name: 'Confirmo que tengo 18 años o más.' }).check();
  await form.getByRole('radio', { name: 'Retiro en local', exact: true }).check();
  await expect(form.getByRole('textbox', { name: 'Dirección completa' })).toBeHidden();
  await expect(page.locator('#checkout-total')).toHaveText(/28\.600/);
  const popup = page.context().waitForEvent('page');
  await preview.click();
  await expect((await popup).getByRole('heading', { name: 'WhatsApp interceptado por la prueba' })).toBeVisible();
  await expect(page.locator('#checkout-whatsapp')).toHaveAttribute('target', '_blank');
  const link = new URL(opened);
  expect(link.pathname).toBe('/5491151354489');
  const message = link.searchParams.get('text');
  for (const text of ['PRECIOS DE MUESTRA SIN VERIFICAR', '1x Venus con papas', 'Bebida: Heineken', '1x Papas sazonadas', '1x Sprite', 'Confirmo que tengo 18 años o más.']) {
    expect(message).toContain(text);
  }
  expect(message).not.toContain('DNI');
});

test('teclado: selección de pestañas, foco de diálogo y Escape', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Vista previa con precios de muestra.')).toBeVisible();
  const tab = page.getByRole('tab', { name: 'Hamburguesas' });
  await tab.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Combos' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Combos' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(tab).toBeFocused();
  const trigger = page.getByRole('button', { name: 'Agregar Mercurio', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(product(page).getByRole('heading', { name: 'Mercurio' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(product(page).getByRole('button', { name: 'Cerrar personalización' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(product(page)).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Sheets: cambios de precio y envío exigen aceptación antes de abrir WhatsApp', async ({ page }) => {
  const state = await mockSheets(page);
  await page.goto('/');
  await expect.poll(() => state.csvRequests).toBe(6);
  await expect(page.getByText('Vista previa con precios de muestra.')).toBeHidden();
  await addMercury(page);
  await openCheckout(page);
  await fillCustomer(page);
  await checkout(page).getByRole('textbox', { name: /Código de descuento/ }).fill('orbita10');
  await expect(page.locator('#checkout-discount')).toHaveText(/840/);
  state.price = 9100;
  state.shipping = 2400;
  state.percent = 5;
  const send = checkout(page).getByRole('button', { name: 'Hacer pedido' });
  await send.click();
  await expect(checkout(page).getByText('Tu pedido se actualizó')).toBeVisible();
  await expect(page.locator('#changes-list')).toContainText(/8\.400.*9\.100/);
  await expect(page.locator('#changes-list')).toContainText(/2\.000.*2\.400/);
  await expect(page.locator('#changes-list')).toContainText(/840.*455/);
  expect(state.opened).toBe('');
  await send.click();
  await expect(checkout(page).getByText('Aceptá los cambios antes de continuar.')).toBeVisible();
  await checkout(page).getByRole('checkbox', { name: /Acepto los cambios/ }).check();
  const popup = page.context().waitForEvent('page');
  await send.click();
  await expect((await popup).getByRole('heading', { name: 'WhatsApp interceptado por la prueba' })).toBeVisible();
  const link = new URL(state.opened);
  expect(link.pathname).toBe('/' + mockNumber);
  expect(link.searchParams.get('text')).toContain('TOTAL ESTIMADO: $\u00a011.045');
  expect(link.searchParams.get('text')).toContain('Ana de Prueba');
  expect(state.csvRequests).toBe(18);
});

test('Sheets: red caída y producto deshabilitado bloquean el envío', async ({ page }) => {
  const state = await mockSheets(page);
  await page.goto('/');
  await expect(page.getByText('Vista previa con precios de muestra.')).toBeHidden();
  await addMercury(page);
  await openCheckout(page);
  await fillCustomer(page);
  state.failed = true;
  const send = checkout(page).getByRole('button', { name: 'Hacer pedido' });
  await send.click();
  await expect(checkout(page).getByText(/No pudimos verificar los precios/)).toBeVisible();
  expect(state.opened).toBe('');
  state.failed = false;
  state.disabled = true;
  await send.click();
  await expect(checkout(page).getByText(/El producto ya no está disponible/)).toBeVisible();
  expect(state.opened).toBe('');
  await checkout(page).getByRole('button', { name: 'Volver al carrito' }).click();
  await expect(cart(page).getByRole('button', { name: 'Continuar pedido' })).toBeDisabled();
  await cart(page).getByRole('button', { name: 'Cerrar carrito' }).click();
  await expect(page.getByRole('button', { name: 'Mercurio sin stock' })).toBeDisabled();
});

test('Sheets: la primera carga fallida no ofrece precios de muestra ni permite comprar', async ({ page }) => {
  const state = await mockSheets(page);
  state.failed = true;
  await page.goto('/');
  await expect(page.getByText('No pudimos cargar el menú. Probá actualizar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar Mercurio', exact: true })).toHaveCount(0);
  state.failed = false;
  await page.getByRole('button', { name: 'Actualizar menú' }).click();
  await page.getByRole('tab', { name: 'Hamburguesas' }).click();
  await expect(page.getByRole('button', { name: 'Agregar Mercurio', exact: true })).toBeVisible();
});
