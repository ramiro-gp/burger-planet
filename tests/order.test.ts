import test from 'node:test';
import assert from 'node:assert/strict';
import { alcoholNotice, categories, isAvailable, parseCatalog, tabs } from '../src/lib/catalog';
import { createCatalogClient, validateSource } from '../src/lib/source';
import { defaultSelection, orderMessage, quoteChanges, quoteLine, quoteOrder, readCart, validateCustomer, whatsappLink, type Line } from '../src/lib/order';
import { catalog, csv, mockNumber, testUrls } from './fixtures';

const simple = { ...defaultSelection(catalog, catalog.hamburguesas[0]), id: 'test-line' };
const customer = { name: 'Ana & Leo', phone: '202-555-0123', address: 'Calle de prueba 123', notes: 'Timbre & puerta', adult: false };

test('el catálogo de muestra tiene ocho hamburguesas y sus combos relacionados, tres papas y cuatro bebidas', () => {
  assert.deepEqual([catalog.hamburguesas.length, catalog.combos.length, catalog.papas.length, catalog.bebidas.length], [8, 8, 3, 4]);
  assert.equal(catalog.settings.shipping, 2000);
  assert.deepEqual(categories, ['combos', 'hamburguesas', 'papas', 'bebidas']);
  assert.equal(new Set(catalog.combos.map((combo) => combo.image)).size, 8);
  assert.equal(catalog.settings.whatsapp, '5491151354489');
  assert.equal(catalog.combos[1].burgerId, 'venus');
});

test('suma discos y extras por unidad, aplica el envío una vez y mantiene dos configuraciones distintas', () => {
  const special: Line = { ...simple, id: 'special', quantity: 2, discs: 4, extras: ['cheddar', 'bacon'], notes: 'Sin pepinos' };
  const quote = quoteOrder(catalog, [simple, special], 'envio');
  assert.equal(quote.lines.length, 2);
  assert.equal(quote.lines[0].unit, 8400);
  assert.equal(quote.lines[1].unit, 16800);
  assert.equal(quote.lines[1].subtotal, 33600);
  assert.equal(quote.total, 44000);
  assert.equal(quoteOrder(catalog, [simple, special], 'retiro').total, 42000);
});

test('el combo usa precio propio, disco de la hamburguesa y recargos de las papas y la bebida', () => {
  const combo = defaultSelection(catalog, catalog.combos[1]);
  assert.equal(combo.fries, 'papas-normales');
  assert.equal(combo.drink, '');
  const quote = quoteLine(catalog, { ...combo, discs: 2, fries: 'papas-cheddar', drink: 'coca-cola', extras: ['cheddar'] });
  assert.equal(quote.unit, 20200);
  assert.equal(quote.alcohol, false);
  assert.ok(quote.parts.some((part) => part.label.includes('Coca-Cola')));
});

test('valida cantidades, opciones incompatibles, extras duplicados y productos deshabilitados', () => {
  assert.throws(() => quoteLine(catalog, { ...simple, discs: 0 }), /discos/);
  assert.throws(() => quoteLine(catalog, { ...simple, quantity: 26 }), /Cantidad/);
  assert.throws(() => quoteLine(catalog, { ...simple, extras: ['bacon', 'bacon'] }), /Extras/);
  assert.throws(() => quoteLine(catalog, { ...simple, fries: 'papas-normales' }), /combo/);
  const updated = structuredClone(catalog);
  updated.hamburguesas[0].available = false;
  assert.equal(isAvailable(updated, updated.combos[0]), false);
  assert.throws(() => quoteLine(updated, simple), /disponible/);
  updated.extras[0].available = false;
  assert.throws(() => quoteLine(updated, { ...simple, productId: 'venus', extras: ['cheddar'] }), /extra/);
});

test('confirma mayoría de edad y aplica las modalidades autorizadas para bebidas sueltas y de combo', () => {
  const updated = structuredClone(catalog);
  updated.settings.alcoholMode = 'retiro';
  const beer = { ...defaultSelection(updated, updated.bebidas[2]), id: 'beer' };
  const combo = { ...defaultSelection(updated, updated.combos[0]), drink: 'heineken', id: 'combo' };
  const order = quoteOrder(updated, [beer, combo], 'envio');
  assert.ok(order.lines.every((line) => line.alcohol));
  assert.match(validateCustomer(customer, order).adult!, /18/);
  assert.match(validateCustomer(customer, order).delivery!, /únicamente/);
  assert.deepEqual(validateCustomer({ ...customer, adult: true, address: '' }, quoteOrder(updated, [beer], 'retiro')), {});
  updated.settings.alcoholMode = 'desactivado';
  assert.throws(() => quoteLine(updated, beer), /disponible/);
  assert.throws(() => quoteLine(updated, combo), /bebida/);
});

test('cambios de precios, importes, entrega y ajustes se comparan con el pedido revisado', () => {
  const before = quoteOrder(catalog, [simple], 'envio');
  const updated = structuredClone(catalog);
  updated.hamburguesas[0].price += 1000;
  updated.hamburguesas[0].description = 'Nueva receta';
  updated.settings.shipping += 600;
  updated.settings.whatsapp = mockNumber;
  const differences = quoteChanges(before, quoteOrder(updated, [simple], 'envio'));
  assert.equal(differences.length, 4);
  assert.match(differences[0], /8\.400.*9\.400/);
  assert.match(differences[2], /2\.000.*2\.600/);
});

test('arma un mensaje íntegro y un enlace codificado sin enviar nada', () => {
  const sample = structuredClone(catalog);
  sample.settings.whatsapp = mockNumber;
  const combo = { ...defaultSelection(sample, sample.combos[1]), id: 'combo', drink: 'heineken', notes: 'Sin pepinos', quantity: 2 };
  const order = quoteOrder(sample, [combo, simple], 'envio');
  const data = { ...customer, adult: true };
  const link = new URL(whatsappLink(order, data));
  assert.equal(link.origin, 'https://wa.me');
  assert.equal(link.pathname, '/' + mockNumber);
  const body = link.searchParams.get('text')!;
  assert.equal(body, orderMessage(order, data));
  for (const phrase of ['2x Venus con papas', '1x Mercurio', 'Precio por unidad', 'Sin pepinos', 'TOTAL ESTIMADO', 'Ana & Leo', 'Timbre & puerta', 'Confirmo que tengo 18 años o más.']) {
    assert.ok(body.includes(phrase), phrase);
  }
  assert.ok(!body.includes(alcoholNotice));
  assert.ok(!orderMessage(order, customer).includes('Confirmo que tengo 18 años o más.'));
  const preview = new URL(whatsappLink(quoteOrder(catalog, [simple], 'retiro'), customer, true));
  assert.equal(preview.pathname, '/5491151354489');
  assert.ok(preview.searchParams.get('text')?.startsWith('PEDIDO DE PRUEBA · PRECIOS DE MUESTRA SIN VERIFICAR'));
  assert.throws(() => whatsappLink({ ...order, whatsapp: '' }, customer), /configuró/);
});

test('valida datos de checkout y requiere dirección solo para envío', () => {
  const invalid = { ...customer, name: ' ', phone: 'abcdef', address: '' };
  assert.deepEqual(Object.keys(validateCustomer(invalid, quoteOrder(catalog, [simple], 'envio'))), ['name', 'phone', 'address']);
  assert.deepEqual(Object.keys(validateCustomer(invalid, quoteOrder(catalog, [simple], 'retiro'))), ['name', 'phone']);
});

test('recupera solo líneas válidas, descarta datos personales y resiste almacenamiento dañado', () => {
  assert.deepEqual(readCart('not json'), []);
  assert.deepEqual(readCart(JSON.stringify([{ ...simple, notes: 'Mi dirección personal', name: 'Test' }, simple, { ...simple, id: 'broken', quantity: -1 }])), [simple]);
});

test('rechaza datos remotos inválidos e importes negativos', () => {
  assert.throws(() => parseCatalog({ ...csv, hamburguesas: csv.hamburguesas.replace(',8400,', ',-100,') }), /fila/);
  assert.throws(() => parseCatalog({ ...csv, combos: csv.combos.replace(',mercurio,', ',inexistente,') }), /referencia/);
  assert.throws(() => parseCatalog({ ...csv, papas: csv.papas.replace('/images/papas-normales.webp', 'javascript:evil') }), /URL/);
  assert.throws(() => parseCatalog({ ...csv, configuracion: csv.configuracion.replace('whatsapp,', 'whatsapp,+549') }), /internacional/);
  assert.throws(() => validateSource({ mode: 'sheets', urls: { ...testUrls, extras: 'https://example.invalid/csv' } }), /publicada/);
  assert.throws(() => validateSource({ mode: 'sheets', urls: { ...testUrls, extras: testUrls.papas } }), /distintas/);
});

test('las redes opcionales conservan compatibilidad con planillas anteriores y solo enlazan perfiles HTTPS', () => {
  const old = csv.configuracion.replace(/^(instagram|tiktok),.*\r?\n?/gm, '');
  assert.equal(parseCatalog({ ...csv, configuracion: old }).settings.instagram, '');
  const input = old.trimEnd() + '\ninstagram,https://www.instagram.com/perfil.prueba/?x=1\ntiktok,https://tiktok.com.example.invalid/@perfil\n';
  const { instagram, tiktok } = parseCatalog({ ...csv, configuracion: input }).settings;
  assert.equal(instagram, 'https://www.instagram.com/perfil.prueba/');
  assert.equal(tiktok, '');
});

test('el cliente valida las seis pestañas, reutiliza el caché y lo omite al verificar', async () => {
  const source = validateSource({ mode: 'sheets', urls: testUrls });
  if (source.mode !== 'sheets') assert.fail('Configuración de prueba incorrecta.');
  let now = 0;
  let requests = 0;
  let sourcePrice = '8400';
  let broken = false;
  const client = createCatalogClient(source, async (url, options) => {
    assert.equal(options?.cache, 'no-store');
    requests++;
    const tab = tabs[Number(new URL(String(url)).searchParams.get('gid'))];
    if (broken && tab === 'extras') return new Response('Unavailable', { status: 503 });
    const body = tab === 'hamburguesas' ? csv[tab].replace(',8400,', ',' + sourcePrice + ',') : csv[tab];
    return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8' } });
  }, () => now);
  await Promise.all([client.get(), client.get()]);
  assert.equal(requests, 6);
  sourcePrice = '9300';
  assert.equal((await client.get()).hamburguesas[0].price, 8400);
  assert.equal((await client.get(true)).hamburguesas[0].price, 9300);
  assert.equal(requests, 12);
  broken = true;
  await assert.rejects(client.get(true), /503/);
  assert.equal((await client.get()).hamburguesas[0].price, 9300);
  now = 45001;
  assert.equal(client.expired(), true);
  await assert.rejects(client.get(), /503/);
});
