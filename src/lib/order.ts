import {
  isAvailable, productById, whatsappNumber, type Catalog, type Delivery, type Product,
} from './catalog';

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
export const formatArs = (value: number) => ars.format(value);
export const maxQuantity = 25;
export const maxLines = 30;
export const maxNotes = 180;

export type Selection = {
  productId: string; discs: number; extras: string[]; fries: string; drink: string; notes: string; quantity: number;
};
export type Line = Selection & { id: string };
export type Part = { label: string; amount: number };
export type QuoteLine = {
  id: string; name: string; description: string; ingredients: string; quantity: number;
  unit: number; subtotal: number; parts: Part[]; notes: string; alcohol: boolean;
};
export type OrderQuote = {
  lines: QuoteLine[]; subtotal: number; shipping: number; total: number; alcohol: boolean; delivery: Delivery;
  pickupAddress: string; alcoholTerms: string; alcoholMode: string; whatsapp: string;
  discount: number; couponCode: string;
};
export type Customer = { name: string; phone: string; address: string; notes: string; adult: boolean };

export function defaultSelection(catalog: Catalog, product: Product): Selection {
  return {
    productId: product.id, discs: 1, extras: [], fries: product.kind === 'combos' ? catalog.settings.defaultFries : '',
    drink: '', notes: '', quantity: 1,
  };
}

export function quoteLine(catalog: Catalog, selection: Selection, lineId = ''): QuoteLine {
  const product = productById(catalog, selection.productId);
  if (!product || !isAvailable(catalog, product)) throw new Error('El producto ya no está disponible.');
  const burger = product.kind === 'hamburguesas' ? product : product.kind === 'combos'
    ? catalog.hamburguesas.find((b) => b.id === product.burgerId) : undefined;
  if (!Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > maxQuantity) throw new Error('Cantidad fuera de rango.');
  if (!Number.isInteger(selection.discs) || selection.discs < 1 || selection.discs > 4 || (!burger && selection.discs !== 1)) throw new Error('Cantidad de discos inválida.');
  if (selection.notes.length > maxNotes) throw new Error('La observación es demasiado larga.');
  if ((!burger && selection.extras.length) || new Set(selection.extras).size !== selection.extras.length) throw new Error('Extras inválidos.');
  if (product.kind !== 'combos' && (selection.fries || selection.drink)) throw new Error('Las guarniciones corresponden al combo.');

  const parts: Part[] = [];
  let alcohol = product.kind === 'bebidas' && product.alcohol;
  if (burger) {
    const discs = selection.discs;
    parts.push({ label: discs === 1 ? '1 disco de carne' : discs + ' discos de carne', amount: (discs - 1) * burger.discPrice });
    const extras = catalog.extras.filter((extra) => selection.extras.includes(extra.id) && extra.available);
    if (extras.length !== selection.extras.length) throw new Error('Algún extra seleccionado ya no está disponible.');
    for (const extra of extras) parts.push({ label: 'Extra: ' + extra.name, amount: extra.price });
  }

  if (product.kind === 'combos') {
    const fries = catalog.papas.find((f) => f.id === selection.fries && f.available);
    if (!fries) throw new Error('Las papas seleccionadas ya no están disponibles.');
    parts.push({ label: fries.name, amount: fries.surcharge });
    if (selection.drink) {
      const drink = catalog.bebidas.find((d) => d.id === selection.drink);
      if (!drink || !isAvailable(catalog, drink)) throw new Error('La bebida seleccionada ya no está disponible.');
      alcohol = drink.alcohol;
      parts.push({ label: 'Bebida: ' + drink.name, amount: drink.price });
    }
  }

  const unit = parts.reduce((sum, part) => sum + part.amount, product.price);
  return {
    id: lineId, name: product.name, description: product.description, ingredients: burger?.description ?? '',
    quantity: selection.quantity, unit, subtotal: unit * selection.quantity, parts, notes: selection.notes, alcohol,
  };
}

export function quoteOrder(catalog: Catalog, lines: Line[], delivery: Delivery, code = ''): OrderQuote {
  if (lines.length === 0) throw new Error('El carrito está vacío.');
  const quoted = lines.map((line) => quoteLine(catalog, line, line.id));
  const alcohol = quoted.some((line) => line.alcohol);
  const subtotal = quoted.reduce((sum, line) => sum + line.subtotal, 0);
  const shipping = delivery === 'envio' ? catalog.settings.shipping : 0;
  const coupon = catalog.settings.coupon;
  const applied = coupon && code.trim().toUpperCase() === coupon.code ? coupon : undefined;
  const discount = applied ? Math.round(subtotal * applied.percent / 100) : 0;
  return {
    lines: quoted, subtotal, shipping, discount, couponCode: applied?.code ?? '',
    total: subtotal - discount + shipping, alcohol, delivery,
    pickupAddress: delivery === 'retiro' ? catalog.settings.address : '', alcoholTerms: alcohol ? catalog.settings.alcoholTerms : '',
    alcoholMode: alcohol ? catalog.settings.alcoholMode : '', whatsapp: catalog.settings.whatsapp,
  };
}

export function quoteChanges(reviewed: OrderQuote, current: OrderQuote): string[] {
  const changes: string[] = [];
  for (const line of current.lines) {
    const before = reviewed.lines.find((old) => old.id === line.id);
    if (!before) { changes.push(line.name + ': agregado.'); continue; }
    if (line.unit !== before.unit) changes.push(line.name + ' por unidad: ' + formatArs(before.unit) + ' → ' + formatArs(line.unit) + '.');
    const configuration = (item: QuoteLine) => [item.name, item.description, item.ingredients, item.parts, item.alcohol];
    if (JSON.stringify(configuration(line)) !== JSON.stringify(configuration(before))) {
      changes.push(line.name + ': cambiaron los ingredientes, opciones o recargos. Revisá el detalle actualizado.');
    }
  }
  if (reviewed.discount !== current.discount || reviewed.couponCode !== current.couponCode) {
    changes.push('Descuento: ' + formatArs(reviewed.discount) + ' → ' + formatArs(current.discount) + '.');
  }
  if (reviewed.shipping !== current.shipping) changes.push('Envío: ' + formatArs(reviewed.shipping) + ' → ' + formatArs(current.shipping) + '.');
  if (reviewed.pickupAddress !== current.pickupAddress) changes.push('Cambió la dirección de retiro.');
  if (reviewed.alcoholTerms !== current.alcoholTerms || reviewed.alcoholMode !== current.alcoholMode) changes.push('Cambiaron las condiciones para bebidas alcohólicas.');
  if (reviewed.whatsapp !== current.whatsapp) changes.push('Cambió el número de WhatsApp del comercio.');
  return changes;
}

export function validateCustomer(customer: Customer, order: OrderQuote): Partial<Record<keyof Customer | 'delivery', string>> {
  const errors: Partial<Record<keyof Customer | 'delivery', string>> = {};
  if (customer.name.trim().length < 2 || customer.name.length > 80) errors.name = 'Ingresá tu nombre (entre 2 y 80 caracteres).';
  const digits = customer.phone.replace(/\D/g, '');
  if (!/^\+?[\d ().-]+$/.test(customer.phone) || digits.length < 8 || digits.length > 15 || customer.phone.length > 26) errors.phone = 'Ingresá un teléfono válido con código de área.';
  if (order.delivery === 'envio' && (customer.address.trim().length < 6 || customer.address.length > 140)) errors.address = 'Ingresá calle, número y localidad.';
  if (customer.notes.length > maxNotes) errors.notes = 'La observación general supera el límite.';
  if (order.alcohol) {
    if (!customer.adult) errors.adult = 'Confirmá que tenés 18 años o más.';
    if (order.alcoholMode !== 'ambos' && order.alcoholMode !== order.delivery) {
      errors.delivery = order.alcoholMode === 'desactivado' ? 'Los pedidos con alcohol están deshabilitados.'
        : order.alcoholMode === 'retiro' ? 'Las bebidas alcohólicas se entregan únicamente con retiro en local.'
        : 'Las bebidas alcohólicas se entregan únicamente a domicilio.';
    }
  }
  return errors;
}

export function orderMessage(order: OrderQuote, customer: Customer, preview = false): string {
  const lines = order.lines.map((line) => [
    line.quantity + 'x ' + line.name,
    ...line.parts.map((part) => '- ' + part.label + (part.amount ? ' (+' + formatArs(part.amount) + ')' : '')),
    line.notes ? '- Observación del producto: ' + line.notes : '',
    '- Precio por unidad: ' + formatArs(line.unit),
    '- Subtotal: ' + formatArs(line.subtotal),
  ].filter(Boolean).join('\n'));

  return [
    ...(preview ? ['PEDIDO DE PRUEBA · PRECIOS DE MUESTRA SIN VERIFICAR', ''] : []),
    '¡Hola, Burger Planet! Quiero hacer este pedido:', '', lines.join('\n\n'), '',
    'Subtotal: ' + formatArs(order.subtotal),
    ...(order.couponCode ? ['Descuento (' + order.couponCode + '): −' + formatArs(order.discount)] : []),
    'Envío: ' + (order.shipping ? formatArs(order.shipping) : 'Gratis'),
    'TOTAL ESTIMADO: ' + formatArs(order.total), '',
    'Nombre: ' + customer.name.trim(), 'Teléfono: ' + customer.phone.trim(),
    order.delivery === 'envio' ? 'Entrega: Envío a domicilio\nDirección: ' + customer.address.trim()
      : 'Entrega: Retiro en local\nDirección del local: ' + order.pickupAddress,
    ...(customer.notes.trim() ? ['Observaciones generales: ' + customer.notes.trim()] : []),
    ...(order.alcohol && customer.adult ? ['', 'Confirmo que tengo 18 años o más.'] : []),
  ].join('\n');
}

export function whatsappLink(order: OrderQuote, customer: Customer, preview = false): string {
  const number = whatsappNumber(order.whatsapp);
  if (!number) throw new Error('El comercio todavía no configuró su WhatsApp.');
  const text = encodeURIComponent(orderMessage(order, customer, preview));
  if (text.length > 10_000) throw new Error('El pedido es demasiado largo para WhatsApp. Reducí las observaciones o dividí el pedido.');
  return 'https://wa.me/' + number + '?text=' + text;
}

export function readCart(json: string | null): Line[] {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.slice(0, maxLines).flatMap((line): Line[] => {
      const slug = (value: unknown) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 48;
      if (!line || typeof line !== 'object' || !slug(line.id) || seen.has(line.id) || !slug(line.productId)
          || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > maxQuantity
          || !Number.isInteger(line.discs) || line.discs < 1 || line.discs > 4
          || !Array.isArray(line.extras) || line.extras.length > 100 || !line.extras.every(slug)
          || (line.fries !== '' && !slug(line.fries)) || (line.drink !== '' && !slug(line.drink))) return [];
      seen.add(line.id);
      return [{
        id: line.id, productId: line.productId, quantity: line.quantity, discs: line.discs, extras: line.extras,
        fries: line.fries, drink: line.drink, notes: '',
      }];
    });
  } catch {
    return [];
  }
}
