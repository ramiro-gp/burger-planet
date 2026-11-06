import { csvRecords } from './csv';

export const tabs = ['hamburguesas', 'combos', 'papas', 'bebidas', 'extras', 'configuracion'] as const;
export type Tab = typeof tabs[number];
export type Category = Exclude<Tab, 'extras' | 'configuracion'>;
export type Sheets = Record<Tab, string>;
export type Delivery = 'envio' | 'retiro';
export type AlcoholMode = Delivery | 'ambos' | 'desactivado';

type Named = { id: string; name: string; price: number; available: boolean; order: number };
type Base = Named & { description: string; image: string };
export type Burger = Base & { kind: 'hamburguesas'; discPrice: number };
export type Combo = Base & { kind: 'combos'; burgerId: string };
export type Fries = Base & { kind: 'papas'; surcharge: number };
export type Drink = Base & { kind: 'bebidas'; alcohol: boolean };
export type Product = Burger | Combo | Fries | Drink;
export type Extra = Named;
export type Settings = {
  shipping: number; address: string; defaultFries: string; whatsapp: string;
  alcoholMode: AlcoholMode; alcoholTerms: string; instagram: string; tiktok: string;
  hours: string[]; coupon?: { code: string; percent: number };
};
export type Catalog = {
  hamburguesas: Burger[]; combos: Combo[]; papas: Fries[]; bebidas: Drink[]; extras: Extra[]; settings: Settings;
};

export const categoryNames: Record<Category, string> = {
  combos: 'Combos', hamburguesas: 'Hamburguesas', papas: 'Papas', bebidas: 'Bebidas',
};
export const categories = Object.keys(categoryNames) as Category[];
export const alcoholNotice = 'Prohibida la venta a menores de 18 años. Se solicitará DNI al entregar el pedido.';

function label(value: string, max: number, optional = false): string {
  if ((!optional && !value) || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Texto inválido o demasiado largo.');
  return value;
}

function id(value: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 48) throw new Error('ID inválido.');
  return value;
}

function money(value: string, max = 1_000_000): number {
  if (!/^\d{1,7}$/.test(value) || Number(value) > max) throw new Error('Usá un número entero, sin símbolos ni separadores.');
  return Number(value);
}

function yesNo(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized !== 'si' && normalized !== 'sí' && normalized !== 'no') throw new Error('Escribí sí o no.');
  return normalized !== 'no';
}

export function imageUrl(value: string): string {
  if (!value) return '/images/placeholder.svg';
  if (/^\/images\/combo-[a-z0-9-]+\.svg$/.test(value)) return value;
  if (/^\/images\/[a-z0-9_-]+\.(webp|avif|png|jpe?g)$/i.test(value)) return value;
  if (value.length > 512 || !value.startsWith('https://') || /[\s\\]/.test(value)) throw new Error('URL de imagen inválida.');
  const url = new URL(value);
  if (url.username || url.password || url.port || !url.hostname.includes('.')) throw new Error('Usá una URL HTTPS pública sin credenciales.');
  return url.href;
}

export function whatsappNumber(value: string): string {
  if (!value) return '';
  if (!/^[1-9]\d{7,14}$/.test(value)) throw new Error('WhatsApp requiere el número internacional, solo dígitos.');
  return value;
}

function socialUrl(value: string | undefined, network: 'instagram' | 'tiktok'): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    const profile = network === 'instagram' ? /^\/[a-z0-9._]+\/?$/i : /^\/@[a-z0-9._-]+\/?$/i;
    if (url.protocol === 'https:' && host === network + '.com' && !url.username && !url.password
        && !url.port && profile.test(url.pathname)) return url.origin + url.pathname;
  } catch { /* Una URL opcional inválida queda sin enlace. */ }
  return '';
}

function named(row: Record<string, string>): Named {
  return { id: id(row.id), name: label(row.nombre, 64), price: money(row.precio), available: yesNo(row.disponible), order: money(row.orden, 10000) };
}

function base(row: Record<string, string>): Base {
  return { ...named(row), description: label(row.descripcion, 180), image: imageUrl(row.imagen) };
}

const publicTail = ['imagen', 'disponible', 'orden'];

function readRows<T>(input: Sheets, tab: Tab, headers: string[], transform: (r: Record<string, string>) => T): T[] {
  const rows = csvRecords(input[tab], headers, tab);
  if (rows.length > 100) throw new Error(tab + ': máximo 100 filas.');
  return rows.map((row, i) => {
    try { return transform(row); }
    catch (error) { throw new Error(tab + ', fila ' + (i + 2) + ': ' + (error as Error).message); }
  });
}

export function parseCatalog(input: Sheets): Catalog {
  const hamburguesas = readRows(input, 'hamburguesas', ['id', 'nombre', 'descripcion', 'precio', 'disco_extra', ...publicTail],
    (r): Burger => ({ ...base(r), kind: 'hamburguesas', discPrice: money(r.disco_extra) }));
  const combos = readRows(input, 'combos', ['id', 'hamburguesa_id', 'nombre', 'descripcion', 'precio', ...publicTail],
    (r): Combo => ({ ...base(r), kind: 'combos', burgerId: id(r.hamburguesa_id) }));
  const papas = readRows(input, 'papas', ['id', 'nombre', 'descripcion', 'precio', 'recargo_combo', ...publicTail],
    (r): Fries => ({ ...base(r), kind: 'papas', surcharge: money(r.recargo_combo) }));
  const bebidas = readRows(input, 'bebidas', ['id', 'nombre', 'descripcion', 'precio', 'alcohol', ...publicTail],
    (r): Drink => ({ ...base(r), kind: 'bebidas', alcohol: yesNo(r.alcohol) }));
  const extras = readRows(input, 'extras', ['id', 'nombre', 'precio', 'disponible', 'orden'], named);
  const pairs = readRows(input, 'configuracion', ['clave', 'valor'], (r) => [r.clave, r.valor] as const);
  const config = new Map(pairs);
  const get = (key: string) => {
    const value = config.get(key);
    if (value === undefined) throw new Error('Falta la clave ' + key + ' en Configuración.');
    return value;
  };
  if (config.size !== pairs.length) throw new Error('Claves repetidas en Configuración.');
  const alcoholMode = get('alcohol_modalidad');
  if (alcoholMode !== 'ambos' && alcoholMode !== 'retiro' && alcoholMode !== 'envio' && alcoholMode !== 'desactivado') throw new Error('Modalidad de alcohol inválida.');
  const settings: Settings = {
    shipping: money(get('costo_envio')), address: label(get('direccion_retiro'), 160),
    defaultFries: id(get('papas_base')), whatsapp: whatsappNumber(get('whatsapp')),
    alcoholMode, alcoholTerms: label(get('alcohol_condiciones'), 240, true),
    instagram: socialUrl(config.get('instagram'), 'instagram'), tiktok: socialUrl(config.get('tiktok'), 'tiktok'),
    hours: label(config.get('horarios') ?? '', 360, true).split('|').map((value) => value.trim()).filter(Boolean),
  };
  const couponCode = config.get('cupon_codigo')?.toUpperCase() ?? '';
  const couponPercent = config.get('cupon_porcentaje') ?? '';
  if (couponCode || couponPercent) {
    if (!/^[A-Z0-9-]{3,24}$/.test(couponCode)) throw new Error('Código de descuento inválido.');
    const percent = money(couponPercent, 100);
    if (!percent) throw new Error('El descuento debe ser mayor que cero.');
    settings.coupon = { code: couponCode, percent };
  }
  const products = [...hamburguesas, ...combos, ...papas, ...bebidas];
  const ids = [...products, ...extras].map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('Los IDs deben ser únicos en todo el catálogo.');
  if (combos.some((c) => !hamburguesas.some((b) => b.id === c.burgerId))) throw new Error('Un combo referencia una hamburguesa que no existe.');
  if (combos.length && !papas.some((f) => f.id === settings.defaultFries && f.surcharge === 0)) throw new Error('Las papas base del combo deben existir y tener recargo cero.');
  for (const group of [hamburguesas, combos, papas, bebidas, extras]) group.sort((a, b) => a.order - b.order);
  return { hamburguesas, combos, papas, bebidas, extras, settings };
}

export function productById(catalog: Catalog, productId: string): Product | undefined {
  for (const category of categories) {
    const product = catalog[category].find((p) => p.id === productId);
    if (product) return product;
  }
}

export function isAvailable(catalog: Catalog, product: Product): boolean {
  if (!product.available) return false;
  if (product.kind === 'bebidas' && product.alcohol) return catalog.settings.alcoholMode !== 'desactivado';
  if (product.kind === 'combos') return catalog.hamburguesas.some((b) => b.id === product.burgerId && b.available)
    && catalog.papas.some((f) => f.id === catalog.settings.defaultFries && f.available);
  return true;
}
