import {
  categories, isAvailable, productById, type Catalog, type Category, type Delivery, type Product,
} from '../lib/catalog';
import { createCatalogClient, validateSource } from '../lib/source';
import {
  defaultSelection, formatArs, maxLines, maxQuantity, quoteChanges, quoteLine, quoteOrder, readCart,
  validateCustomer, whatsappLink, type Customer, type Line, type OrderQuote, type QuoteLine, type Selection,
} from '../lib/order';

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const inside = <T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector)!;
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
};
const write = (id: string, value: string) => { get(id).textContent = value; };
const message = (id: string, value: string) => {
  const node = get(id);
  node.textContent = value;
  node.hidden = !value;
};
const dialog = {
  product: get<HTMLDialogElement>('product-dialog'), cart: get<HTMLDialogElement>('cart-dialog'), checkout: get<HTMLDialogElement>('checkout-dialog'),
};
const mobilePanelMotion = matchMedia('(max-width: 520px) and (prefers-reduced-motion: no-preference)');
const panelMotion = new WeakMap<HTMLDialogElement, { animation: Animation; closing: boolean }>();
const productForm = get<HTMLFormElement>('product-form');
const checkoutForm = get<HTMLFormElement>('checkout-form');
const checkoutSubmit = get<HTMLButtonElement>('checkout-submit');
const checkoutCoupon = get<HTMLInputElement>('checkout-coupon');
const checkoutWhatsApp = get<HTMLAnchorElement>('checkout-whatsapp');
const cartTemplate = get<HTMLTemplateElement>('cart-line-template');
const cardTemplate = get<HTMLTemplateElement>('product-card-template');
const fallbackImage = '/images/placeholder.svg';
const cartKey = 'planet-burger:cart:v1';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Ocurrió un error.';
let catalog: Catalog | undefined;
let client: ReturnType<typeof createCatalogClient> | undefined;
let preview = false;
let booting = false;
let active: Category = categories[0];
const addedTimers = new Map<string, number>();
let delivery: Delivery = 'envio';
let lines: Line[] = [];
let selected: Selection | undefined;
let editedId: string | undefined;
let reviewed: Catalog | undefined;
let proposed: OrderQuote | undefined;
let checkoutVersion = 0;

try { lines = readCart(localStorage.getItem(cartKey)); } catch { /* El carrito sigue disponible durante la visita. */ }

function announce(value: string) { write('shop-announcement', value); }

function persist() {
  try {
    // Las observaciones libres pueden contener datos personales. Se conservan solo durante la visita.
    localStorage.setItem(cartKey, JSON.stringify(lines.map(({ notes: _notes, ...line }) => line)));
  } catch { /* El carrito sigue disponible durante la visita. */ }
}

function fillImage(image: HTMLImageElement, source: string) {
  image.onerror = () => {
    image.onerror = null;
    if (image.getAttribute('src') !== fallbackImage) image.src = fallbackImage;
  };
  image.src = source;
}

function sourceStatus(text: string, retry = false) {
  write('source-message', text);
  get('catalog-status').hidden = !text && !retry;
  get('catalog-retry').hidden = !retry;
}

function updateCardAction(button: HTMLButtonElement, product: Product, available: boolean) {
  const added = available && addedTimers.has(product.id);
  const action = available ? (added ? 'Agregado' : 'Agregar') : 'Sin stock';
  button.disabled = !available;
  button.toggleAttribute('data-added', added);
  if (added) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
  button.setAttribute('aria-label', available ? action + ' ' + product.name : product.name + ' sin stock');
  inside(button, '[data-card-action]').textContent = action;
}

function refreshCardAction(id: string) {
  const button = document.querySelector<HTMLButtonElement>('[data-pick="' + id + '"]');
  if (!catalog || !button) return;
  const product = productById(catalog, id);
  if (product) updateCardAction(button, product, isAvailable(catalog, product));
}

function showAdded(id: string) {
  addedTimers.set(id, window.setTimeout(() => {
    addedTimers.delete(id);
    refreshCardAction(id);
  }, 1500));
  refreshCardAction(id);
}

window.addEventListener('pagehide', () => {
  for (const [id, timer] of addedTimers) {
    clearTimeout(timer);
    addedTimers.delete(id);
    refreshCardAction(id);
  }
});

function renderCategory() {
  const grid = inside(document, '[data-product-grid="' + active + '"]');
  if (!catalog) { grid.replaceChildren(); return; }
  const current = catalog;
  const products = current[active];
  const cards = products.map((product, index) => {
    const card = inside((cardTemplate.content.cloneNode(true) as DocumentFragment), 'article');
    card.dataset.kind = product.kind;
    card.dataset.productId = product.id;
    const image = inside<HTMLImageElement>(card, '[data-card-image]');
    if (index < 4) image.loading = 'eager';
    fillImage(image, product.image);
    inside(card, '[data-card-name]').textContent = product.name;
    inside(card, '[data-card-description]').textContent = product.description;
    inside(card, '[data-card-price]').textContent = formatArs(product.price);
    const isAlcohol = product.kind === 'bebidas' && product.alcohol;
    inside(card, '[data-card-tag]').hidden = !isAlcohol;
    inside(card, '[data-card-legal]').hidden = !isAlcohol;
    const button = inside<HTMLButtonElement>(card, '[data-pick]');
    button.dataset.pick = product.id;
    updateCardAction(button, product, isAvailable(current, product));
    return card;
  });
  grid.replaceChildren(...(cards.length ? cards : [element('p', 'Por el momento no hay productos en esta categoría.', 'muted')]));
}

function setCategory(category: Category, focus = false) {
  const changed = active !== category;
  active = category;
  for (const name of categories) {
    const button = get('tab-' + name);
    button.setAttribute('aria-selected', String(name === category));
    button.tabIndex = name === category ? 0 : -1;
    get('panel-' + name).hidden = name !== category;
  }
  if (changed) renderCategory();
  if (focus) get('tab-' + category).focus();
}

function renderOffers(current: Catalog | undefined) {
  let bestSaving = 0;
  if (current) {
    const fries = current.papas.find((item) => item.id === current.settings.defaultFries);
    for (const combo of current.combos) {
      if (!fries || !isAvailable(current, combo)) continue;
      const burger = current.hamburguesas.find((item) => item.id === combo.burgerId);
      if (burger) bestSaving = Math.max(bestSaving, burger.price + fries.price - combo.price);
    }
  }
  const coupon = current?.settings.coupon;
  get('promos').hidden = !bestSaving && !coupon;
  get('combo-promo').hidden = !bestSaving;
  get('coupon-promo').hidden = !coupon;
  write('combo-promo-text', bestSaving ? 'Ahorrá hasta ' + formatArs(bestSaving) + ' frente a pedir los productos por separado.' : '');
  write('coupon-promo-title', coupon ? coupon.percent + ' % de descuento' : '');
  write('coupon-promo-code', coupon?.code ?? '');
}

function applyCatalog(next: Catalog | undefined) {
  catalog = next;
  write('delivery-price', next ? formatArs(next.settings.shipping) : '—');
  write('pickup-address', next?.settings.address ?? 'Dirección pendiente.');
  const settings = next?.settings;
  for (const [network, url] of [
    ['instagram', settings?.instagram],
    ['tiktok', settings?.tiktok],
    ['whatsapp', settings?.whatsapp && 'https://wa.me/' + settings.whatsapp],
  ]) {
    const link = inside<HTMLAnchorElement>(document, '[data-social="' + network + '"]');
    const destination = url || link.dataset.defaultUrl;
    if (destination) {
      link.href = destination;
      link.removeAttribute('aria-disabled');
      link.title = link.getAttribute('aria-label') ?? '';
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.title = (link.getAttribute('aria-label') ?? '') + ' sin configurar';
    }
  }
  const hours = settings?.hours ?? [];
  get('business-hours').hidden = !hours.length;
  get('business-hours-list').replaceChildren(...hours.map((entry) => element('li', entry)));
  renderOffers(next);
  renderCategory();
  renderCart();
}

async function refresh(force = false) {
  if (booting) return;
  booting = true;
  get<HTMLButtonElement>('catalog-retry').disabled = true;
  try {
    if (!client) {
      sourceStatus('Cargando el menú…');
      const response = await fetch('/catalog-source.json', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('No se pudo leer la configuración del catálogo.');
      const source = validateSource(await response.json());
      preview = source.mode === 'preview';
      if (source.mode === 'preview') {
        const { previewCatalog } = await import('../lib/fixture');
        applyCatalog(previewCatalog);
        sourceStatus('Vista previa con precios de muestra.');
        return;
      }
      applyCatalog(undefined);
      client = createCatalogClient(source);
    }
    applyCatalog(await client.get(force));
    sourceStatus('', true);
  } catch (error) {
    sourceStatus(catalog ? 'No pudimos actualizar el menú. Los importes visibles requieren verificación.' : 'No pudimos cargar el menú. Probá actualizar.', true);
    console.warn('Burger Planet:', errorText(error));
  } finally {
    booting = false;
    get<HTMLButtonElement>('catalog-retry').disabled = false;
  }
}

function stopPanelMotion(panel: HTMLDialogElement) {
  panelMotion.get(panel)?.animation.cancel();
  panelMotion.delete(panel);
}

function slidePanel(panel: HTMLDialogElement, closing: boolean, afterClose?: () => void) {
  const offscreen = 'translateY(100%)';
  const from = closing ? getComputedStyle(panel).transform : offscreen;
  stopPanelMotion(panel);
  const animation = panel.animate({ transform: [from, closing ? offscreen : 'none'] }, {
    duration: closing ? 210 : 280,
    easing: closing ? 'cubic-bezier(.4, 0, 1, 1)' : 'cubic-bezier(.2, .7, .2, 1)',
    fill: 'both',
  });
  panelMotion.set(panel, { animation, closing });
  animation.onfinish = () => {
    if (panelMotion.get(panel)?.animation !== animation) return;
    if (closing) panel.close();
    stopPanelMotion(panel);
    afterClose?.();
  };
}

function dismiss(panel: HTMLDialogElement, afterClose?: () => void) {
  if (!panel.open || panelMotion.get(panel)?.closing) return;
  if (mobilePanelMotion.matches) {
    slidePanel(panel, true, afterClose);
  } else {
    stopPanelMotion(panel);
    panel.close();
    afterClose?.();
  }
}

function show(next: HTMLDialogElement) {
  for (const current of Object.values(dialog)) {
    if (current === next || !current.open) continue;
    stopPanelMotion(current);
    current.close();
  }
  if (!next.open) {
    next.showModal();
    if (mobilePanelMotion.matches) slidePanel(next, false);
  }
  inside(next, 'h2').focus({ preventScroll: true });
}

function radios(title: string, name: string, entries: Array<{ value: string; label: string }>, checked: string, stacked = false) {
  const fieldset = element('fieldset');
  const group = element('div', '', stacked ? 'segments option-radios' : 'segments');
  for (const option of entries) {
    const label = element('label');
    const input = element('input');
    input.type = 'radio';
    input.name = name;
    input.value = option.value;
    input.checked = option.value === checked;
    label.append(input, element('span', option.label));
    group.append(label);
  }
  fieldset.append(element('legend', title), group);
  return fieldset;
}

function priceSuffix(value: number) { return value ? ' (+' + formatArs(value) + ')' : ''; }

function openProduct(product: Product, existing?: Line) {
  if (!catalog || !isAvailable(catalog, product)) return;
  const current = catalog;
  const burger = product.kind === 'hamburguesas' ? product : product.kind === 'combos'
    ? current.hamburguesas.find((item) => item.id === product.burgerId) : undefined;
  const availableExtras = current.extras.filter((item) => item.available);
  const availableFries = current.papas.filter((item) => item.available);
  const availableDrinks = current.bebidas.filter((item) => isAvailable(current, item));
  selected = existing ? {
    ...existing, extras: existing.extras.filter((id) => availableExtras.some((item) => item.id === id)),
    fries: availableFries.some((item) => item.id === existing.fries) ? existing.fries : (product.kind === 'combos' ? current.settings.defaultFries : ''),
    drink: availableDrinks.some((item) => item.id === existing.drink) ? existing.drink : '',
  } : defaultSelection(current, product);
  editedId = existing?.id;
  const options = get('product-options');
  options.replaceChildren();
  write('product-title', product.name);
  write('product-description', burger && burger.id !== product.id ? product.description + '\n' + burger.description : product.description);
  fillImage(get<HTMLImageElement>('product-image'), product.image);
  write('product-submit-label', editedId ? 'Guardar cambios' : 'Sumar al pedido');
  inside<HTMLTextAreaElement>(productForm, '[name="product-notes"]').value = selected.notes;
  if (burger) {
    options.append(radios('Discos de carne', 'discs', [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })), String(selected.discs)));
    if (burger.discPrice) options.firstElementChild?.append(element('p', '+' + formatArs(burger.discPrice) + ' por disco adicional', 'muted text-sm mt-2'));
    if (availableExtras.length) {
      const extras = element('fieldset');
      extras.append(element('legend', 'Extras opcionales'));
      for (const extra of availableExtras) {
        const label = element('label', '', 'check-row');
        const input = element('input');
        input.type = 'checkbox';
        input.name = 'extra';
        input.value = extra.id;
        input.checked = selected.extras.includes(extra.id);
        label.append(input, element('span', extra.name), element('small', '+' + formatArs(extra.price)));
        extras.append(label);
      }
      options.append(extras);
    }
  }
  if (product.kind === 'combos') {
    options.append(radios('Papas del combo', 'fries', availableFries.map((f) => ({ value: f.id, label: f.name + (f.surcharge ? priceSuffix(f.surcharge) : ' · Incluidas') })), selected.fries, true));
    options.append(radios('Bebida opcional', 'drink', [
      { value: '', label: 'Sin bebida' },
      ...availableDrinks.map((d) => ({ value: d.id, label: d.name + (d.alcohol ? ' · +18' : '') + priceSuffix(d.price) })),
    ], selected.drink, true));
  }
  updateProduct();
  show(dialog.product);
  inside(dialog.product, '.dialog-scroll').scrollTop = 0;
}

function updateProduct() {
  if (!catalog || !selected) return;
  const data = new FormData(productForm);
  selected = {
    ...selected, discs: Number(data.get('discs') ?? 1), extras: data.getAll('extra').map(String),
    fries: String(data.get('fries') ?? ''), drink: String(data.get('drink') ?? ''), notes: String(data.get('product-notes') ?? '').trim(),
  };
  write('product-quantity', String(selected.quantity));
  get<HTMLButtonElement>('product-less').disabled = selected.quantity === 1;
  get<HTMLButtonElement>('product-more').disabled = selected.quantity === maxQuantity;
  const submit = get<HTMLButtonElement>('product-submit');
  try {
    const quote = quoteLine(catalog, selected);
    write('product-total', formatArs(quote.subtotal));
    get('product-alcohol').hidden = !quote.alcohol;
    message('product-error', !editedId && lines.length >= maxLines ? 'El carrito admite hasta ' + maxLines + ' líneas.' : '');
    submit.disabled = !editedId && lines.length >= maxLines;
  } catch (error) {
    message('product-error', errorText(error));
    submit.disabled = true;
  }
}

function storeSelection(selection: Selection, existingId?: string) {
  if (!catalog || (!existingId && addedTimers.has(selection.productId))) return false;
  const quote = quoteLine(catalog, selection);
  if (existingId) lines = lines.map((line) => line.id === existingId ? { ...selection, id: existingId } : line);
  else if (lines.length < maxLines) lines = [...lines, { ...selection, id: crypto.randomUUID() }];
  else { announce('El carrito admite hasta ' + maxLines + ' líneas.'); return false; }
  persist();
  renderCart();
  if (!existingId) showAdded(selection.productId);
  announce(quote.name + (existingId ? ' actualizado en el carrito.' : ' agregado al carrito.'));
  return true;
}

function partDetails(quote: QuoteLine): string {
  return [
    ...quote.parts.map((part) => part.label + priceSuffix(part.amount)),
    ...(quote.notes ? ['Nota: ' + quote.notes] : []),
  ].join(' · ');
}

function renderTotals(prefix: 'cart' | 'checkout', subtotal: number, shipping: number | undefined, total: number | undefined) {
  write(prefix + '-subtotal', formatArs(subtotal));
  write(prefix + '-shipping', shipping === undefined ? '—' : shipping ? formatArs(shipping) : 'Gratis');
  write(prefix + '-total', total === undefined ? '—' : formatArs(total));
}

function renderCart() {
  const current = catalog;
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  let subtotal = 0;
  let hasInvalid = !current;
  const items = lines.map((line) => {
    const row = inside(cartTemplate.content.cloneNode(true) as DocumentFragment, 'li');
    row.dataset.lineId = line.id;
    inside(row, '[data-line-quantity]').textContent = String(line.quantity);
    const name = inside(row, '[data-line-name]');
    const product = current && productById(current, line.productId);
    name.textContent = product?.name ?? line.productId;
    const edit = inside<HTMLButtonElement>(row, '[data-line-action="edit"]');
    edit.disabled = !current || !product || !isAvailable(current, product);
    inside<HTMLButtonElement>(row, '[data-line-action="less"]').disabled = line.quantity <= 1;
    inside<HTMLButtonElement>(row, '[data-line-action="more"]').disabled = line.quantity >= maxQuantity;
    try {
      if (!current) throw new Error('Esperando el menú para calcular el precio.');
      const quote = quoteLine(current, line, line.id);
      subtotal += quote.subtotal;
      inside(row, '[data-line-subtotal]').textContent = formatArs(quote.subtotal);
      inside(row, '[data-line-parts]').textContent = partDetails(quote);
    } catch (error) {
      hasInvalid = true;
      const errorNode = inside(row, '[data-line-error]');
      errorNode.textContent = errorText(error) + (edit.disabled ? ' Quitá esta línea o actualizá el menú.' : ' Editá esta línea para continuar.');
      errorNode.hidden = false;
    }
    return row;
  });
  get('cart-lines').replaceChildren(...items);
  for (const node of document.querySelectorAll('[data-cart-count]')) node.textContent = String(count);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-open-cart]')) {
    button.setAttribute('aria-label', 'Abrir carrito, ' + count + (count === 1 ? ' producto' : ' productos'));
  }
  inside(document, '.mobile-cart').hidden = !count;
  write('mobile-subtotal', formatArs(subtotal));
  get('cart-empty').hidden = Boolean(lines.length);
  get('cart-footer').hidden = !lines.length;
  get<HTMLButtonElement>('checkout-open').disabled = hasInvalid || !lines.length;
  const shipping = current ? (delivery === 'envio' ? current.settings.shipping : 0) : undefined;
  renderTotals('cart', subtotal, shipping, hasInvalid ? undefined : subtotal + (shipping ?? 0));
  inside<HTMLInputElement>(dialog.cart, '[name="cart-delivery"][value="' + delivery + '"]').checked = true;
}

function customerData(): Customer {
  const values = new FormData(checkoutForm);
  return {
    name: String(values.get('name') ?? ''), phone: String(values.get('phone') ?? ''), address: String(values.get('address') ?? ''),
    notes: String(values.get('notes') ?? ''), adult: values.get('adult') === 'on',
  };
}

function clearErrors() {
  for (const key of ['name', 'phone', 'address', 'notes', 'adult', 'delivery']) {
    message('err-' + key, '');
    for (const control of checkoutForm.querySelectorAll('[name="' + key + '"]')) control.removeAttribute('aria-invalid');
  }
}

function showErrors(errors: ReturnType<typeof validateCustomer>) {
  let first: HTMLElement | undefined;
  for (const [key, value] of Object.entries(errors)) {
    message('err-' + key, value);
    for (const control of checkoutForm.querySelectorAll<HTMLElement>('[name="' + key + '"]')) {
      first ??= control;
      control.setAttribute('aria-invalid', 'true');
    }
  }
  first?.focus();
}

function clearWhatsAppLink() {
  checkoutWhatsApp.hidden = true;
  checkoutWhatsApp.removeAttribute('href');
}

function openWhatsApp(url: string) {
  checkoutWhatsApp.href = url;
  checkoutWhatsApp.hidden = false;
  checkoutWhatsApp.click();
}

function renderCheckout(order: OrderQuote) {
  get('coupon-field').hidden = !catalog?.settings.coupon;
  const enteredCode = checkoutCoupon.value.trim();
  checkoutCoupon.setAttribute('aria-invalid', String(Boolean(enteredCode && !order.couponCode)));
  message('coupon-status', enteredCode ? (order.couponCode ? 'Código aplicado.' : 'El código no está disponible.') : '');
  get('checkout-discount-row').hidden = !order.couponCode;
  write('checkout-discount', '−' + formatArs(order.discount));
  inside<HTMLInputElement>(checkoutForm, '[name="delivery"][value="' + order.delivery + '"]').checked = true;
  const address = inside<HTMLInputElement>(checkoutForm, '[name="address"]');
  address.required = order.delivery === 'envio';
  address.disabled = !address.required;
  get('address-field').hidden = address.disabled;
  message('checkout-pickup', order.pickupAddress);
  get('checkout-alcohol').hidden = !order.alcohol;
  message('alcohol-terms', order.alcoholTerms);
  const items = order.lines.map((line) => {
    const li = element('li');
    const top = element('div', '', 'cart-line-top');
    top.append(element('strong', line.quantity + ' × ' + line.name), element('strong', formatArs(line.subtotal)));
    li.append(top, element('p', formatArs(line.unit) + ' por unidad', 'muted'));
    if (line.ingredients) li.append(element('p', line.ingredients, 'muted'));
    const details = partDetails(line);
    if (details) li.append(element('p', details, 'muted'));
    return li;
  });
  get('checkout-lines').replaceChildren(...items);
  renderTotals('checkout', order.subtotal, order.shipping, order.total);
}

function resetChanges() {
  proposed = undefined;
  get('checkout-changes').hidden = true;
  inside<HTMLInputElement>(checkoutForm, '[name="accept"]').checked = false;
}

function showChanges(latest: OrderQuote, changes: string[], focus = true) {
  proposed = latest;
  get('changes-list').replaceChildren(...changes.map((change) => element('li', change)));
  get('checkout-changes').hidden = false;
  inside<HTMLInputElement>(checkoutForm, '[name="accept"]').checked = false;
  renderCheckout(latest);
  if (focus) get('changes-title').focus();
}

function openCheckout() {
  if (!catalog) return;
  const order = quoteOrder(catalog, lines, delivery);
  reviewed = catalog;
  checkoutForm.reset();
  clearWhatsAppLink();
  resetChanges();
  clearErrors();
  message('checkout-error', '');
  write('checkout-caption', preview
    ? 'Pedido de prueba por WhatsApp. Los importes de muestra no están verificados.'
    : 'Revisá el mensaje y envialo en WhatsApp. El comercio confirma disponibilidad y cobro por chat.');
  write('checkout-submit-label', 'Hacer pedido');
  renderCheckout(order);
  show(dialog.checkout);
  inside(dialog.checkout, '.dialog-scroll').scrollTop = 0;
}

function checkoutProblem(text: string) {
  message('checkout-error', text);
  get('checkout-error').focus();
}

async function submitCheckout() {
  if (!catalog || !reviewed || checkoutSubmit.disabled || panelMotion.get(dialog.checkout)?.closing) return;
  clearWhatsAppLink();
  clearErrors();
  message('checkout-error', '');
  const accepted = inside<HTMLInputElement>(checkoutForm, '[name="accept"]').checked;
  if (proposed && !accepted) {
    checkoutProblem('Aceptá los cambios antes de continuar.');
    return;
  }
  const currentCustomer = customerData();
  const code = checkoutCoupon.value.trim();
  let baseline: OrderQuote;
  try { baseline = proposed ?? quoteOrder(reviewed, lines, delivery, code); }
  catch (error) { checkoutProblem(errorText(error)); return; }
  if (code && !baseline.couponCode) {
    checkoutCoupon.focus();
    return;
  }
  const errors = validateCustomer(currentCustomer, baseline);
  if (Object.keys(errors).length) {
    showErrors(errors);
    return;
  }
  if (preview) {
    try { openWhatsApp(whatsappLink(baseline, currentCustomer, true)); }
    catch (error) { checkoutProblem(errorText(error)); }
    return;
  }
  if (!client) { checkoutProblem('El menú todavía no está conectado.'); return; }
  const version = checkoutVersion;
  checkoutSubmit.disabled = true;
  checkoutForm.setAttribute('aria-busy', 'true');
  write('checkout-submit-label', 'Verificando el menú…');
  const stillOpen = () => dialog.checkout.open && !panelMotion.get(dialog.checkout)?.closing && version === checkoutVersion;
  try {
    let fresh: Catalog;
    try { fresh = await client.get(true); }
    catch {
      sourceStatus('No pudimos verificar el menú. Los importes visibles podrían haber cambiado.', true);
      if (stillOpen()) checkoutProblem('No pudimos verificar los precios y la disponibilidad. Volvé a intentar en unos segundos.');
      return;
    }
    if (!stillOpen()) return;
    if (delivery !== baseline.delivery || code !== checkoutCoupon.value.trim() || JSON.stringify(currentCustomer) !== JSON.stringify(customerData())
        || (proposed && !inside<HTMLInputElement>(checkoutForm, '[name="accept"]').checked)) {
      checkoutProblem('Revisá tus datos y volvé a verificar el pedido.');
      return;
    }
    applyCatalog(fresh);
    sourceStatus('', true);
    let latest: OrderQuote;
    try { latest = quoteOrder(fresh, lines, delivery, code); }
    catch (error) {
      checkoutProblem(errorText(error) + ' Volvé al carrito para editar o quitar el producto.');
      return;
    }
    const changes = quoteChanges(baseline, latest);
    if (changes.length) {
      if (code && !latest.couponCode) checkoutCoupon.value = '';
      showChanges(latest, changes);
      return;
    }
    const latestErrors = validateCustomer(currentCustomer, latest);
    if (Object.keys(latestErrors).length) { renderCheckout(latest); showErrors(latestErrors); return; }
    const url = whatsappLink(latest, currentCustomer);
    write('checkout-caption', 'Si WhatsApp se abre, enviá el mensaje desde el chat. El comercio confirma tu pedido.');
    openWhatsApp(url);
  } catch (error) {
    if (stillOpen()) checkoutProblem(errorText(error));
  } finally {
    checkoutSubmit.disabled = false;
    checkoutForm.removeAttribute('aria-busy');
    write('checkout-submit-label', 'Hacer pedido');
  }
}

for (const category of categories) {
  get('tab-' + category).addEventListener('click', () => setCategory(category));
  get('tab-' + category).addEventListener('keydown', (event) => {
    const key = event.key;
    const i = categories.indexOf(category);
    const target = key === 'Home' ? 0 : key === 'End' ? categories.length - 1
      : key === 'ArrowRight' ? (i + 1) % categories.length : key === 'ArrowLeft' ? (i - 1 + categories.length) % categories.length : -1;
    if (target < 0) return;
    event.preventDefault();
    setCategory(categories[target], true);
  });
}

for (const link of document.querySelectorAll<HTMLElement>('[data-select-category]')) {
  link.addEventListener('click', () => setCategory(link.dataset.selectCategory as Category));
}
inside(document, '.site-header nav a[href="#menu"]').addEventListener('click', () => setCategory(categories[0]));
get('catalog-retry').addEventListener('click', () => { void refresh(true); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && client?.expired() && !Object.values(dialog).some((item) => item.open)) void refresh();
});

get('menu').addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-pick]');
  if (!catalog || !button?.dataset.pick || addedTimers.has(button.dataset.pick)) return;
  const product = productById(catalog, button.dataset.pick);
  if (!product || !isAvailable(catalog, product)) return;
  if (product.kind === 'hamburguesas' || product.kind === 'combos') openProduct(product);
  else storeSelection(defaultSelection(catalog, product));
});
for (const button of document.querySelectorAll('[data-open-cart]')) button.addEventListener('click', () => { renderCart(); show(dialog.cart); });
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => {
    const panel = button.closest('dialog');
    if (panel) dismiss(panel);
  });
}
for (const panel of Object.values(dialog)) {
  panel.addEventListener('cancel', (event) => { event.preventDefault(); dismiss(panel); });
  panel.addEventListener('click', (event) => {
    if (event.target !== panel) return;
    const box = panel.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dismiss(panel);
  });
}

productForm.addEventListener('input', updateProduct);
for (const [id, delta] of [['product-less', -1], ['product-more', 1]] as const) {
  get(id).addEventListener('click', () => {
    if (!selected) return;
    selected.quantity = Math.max(1, Math.min(maxQuantity, selected.quantity + delta));
    updateProduct();
    if (get<HTMLButtonElement>(id).disabled) get(delta > 0 ? 'product-less' : 'product-more').focus();
  });
}
productForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selected || !dialog.product.open || panelMotion.get(dialog.product)?.closing || get<HTMLButtonElement>('product-submit').disabled) return;
  try {
    if (!storeSelection(selected, editedId)) return;
    const id = editedId;
    dismiss(dialog.product, id ? () => {
      show(dialog.cart);
      inside(get('cart-lines'), '[data-line-id="' + id + '"] [data-line-action="edit"]').focus({ preventScroll: true });
    } : undefined);
  } catch (error) { message('product-error', errorText(error)); }
});

dialog.cart.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.name !== 'cart-delivery') return;
  delivery = target.value === 'retiro' ? 'retiro' : 'envio';
  renderCart();
});
get('cart-lines').addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-line-action]');
  const id = button?.closest<HTMLElement>('[data-line-id]')?.dataset.lineId;
  const line = lines.find((item) => item.id === id);
  if (!button || !line) return;
  const action = button.dataset.lineAction;
  if (action === 'edit') {
    const product = catalog && productById(catalog, line.productId);
    if (product) openProduct(product, line);
    return;
  }
  if (action === 'remove') lines = lines.filter((item) => item.id !== line.id);
  else line.quantity = Math.max(1, Math.min(maxQuantity, line.quantity + (action === 'more' ? 1 : -1)));
  persist();
  renderCart();
  const control = get('cart-lines').querySelector<HTMLButtonElement>('[data-line-id="' + line.id + '"] [data-line-action="' + action + '"]');
  if (control && !control.disabled) control.focus();
  else get('cart-title').focus();
});
dialog.product.addEventListener('close', () => {
  if (editedId && !dialog.cart.open) show(dialog.cart);
  editedId = undefined;
  selected = undefined;
});

get('checkout-open').addEventListener('click', openCheckout);
get('checkout-back').addEventListener('click', () => dismiss(dialog.checkout, () => show(dialog.cart)));
dialog.checkout.addEventListener('close', () => {
  checkoutVersion++;
  checkoutForm.reset();
  clearWhatsAppLink();
});
function updateCheckoutQuote() {
  if (!catalog || !reviewed) return;
  const code = checkoutCoupon.value.trim();
  clearErrors();
  message('checkout-error', '');
  try {
    const order = quoteOrder(catalog, lines, delivery, code);
    if (proposed) {
      const changes = quoteChanges(quoteOrder(reviewed, lines, delivery, code), order);
      if (changes.length) { showChanges(order, changes, false); return; }
      resetChanges();
    }
    renderCheckout(order);
  } catch (error) { checkoutProblem(errorText(error)); }
}

checkoutForm.addEventListener('input', (event) => {
  clearWhatsAppLink();
  if (event.target === checkoutCoupon) updateCheckoutQuote();
});
checkoutForm.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.name !== 'delivery') return;
  clearWhatsAppLink();
  delivery = target.value === 'retiro' ? 'retiro' : 'envio';
  updateCheckoutQuote();
});
checkoutForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitCheckout();
});

write('copyright-year', String(new Date().getFullYear()));
renderCart();
void refresh();
