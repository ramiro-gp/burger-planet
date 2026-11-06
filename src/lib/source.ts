import { parseCatalog, tabs, type Catalog, type Sheets, type Tab } from './catalog';

export type Source = { mode: 'preview' } | { mode: 'sheets'; urls: Record<Tab, string> };
const catalogTtl = 45_000;

function publicCsvUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Falta una URL CSV.');
  const url = new URL(value);
  if (url.origin !== 'https://docs.google.com' || url.username || url.password || url.hash
      || !/^\/spreadsheets\/d\/e\/[\w-]+\/pub$/.test(url.pathname)
      || url.searchParams.get('output') !== 'csv' || url.searchParams.get('single') !== 'true'
      || !/^\d+$/.test(url.searchParams.get('gid') ?? '')) {
    throw new Error('Usá el CSV de una pestaña publicada en Google Sheets.');
  }
  return url.href;
}

export function validateSource(raw: unknown): Source {
  if (!raw || typeof raw !== 'object') throw new Error('Configuración de origen inválida.');
  const source = raw as { mode?: unknown; urls?: Partial<Record<Tab, unknown>> };
  if (source.mode === 'preview') return { mode: 'preview' };
  if (source.mode !== 'sheets' || !source.urls) throw new Error('Configurá un origen para el catálogo.');
  const urls = Object.fromEntries(tabs.map((tab) => [tab, publicCsvUrl(source.urls?.[tab])])) as Record<Tab, string>;
  const files = new Set(tabs.map((tab) => new URL(urls[tab]).pathname));
  const gids = new Set(tabs.map((tab) => new URL(urls[tab]).searchParams.get('gid')));
  if (files.size !== 1 || gids.size !== tabs.length) throw new Error('Publicá seis pestañas distintas de la misma planilla.');
  return { mode: 'sheets', urls };
}

async function readCsv(url: string, signal: AbortSignal, request: typeof fetch): Promise<string> {
  const response = await request(url, { signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Google Sheets respondió con HTTP ' + response.status + '.');
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/csv')) throw new Error('La pestaña no devolvió un CSV público.');
  if (!response.body) throw new Error('La pestaña no devolvió datos.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > 256_000) {
        await reader.cancel();
        throw new Error('El CSV supera 256 KB.');
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export function createCatalogClient(source: Extract<Source, { mode: 'sheets' }>, request = fetch, now = Date.now) {
  let cached: { at: number; catalog: Catalog } | undefined;
  let pending: Promise<Catalog> | undefined;

  async function download(): Promise<Catalog> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const sheets = await Promise.all(tabs.map(async (tab) => [tab, await readCsv(source.urls[tab], controller.signal, request)] as const));
      const catalog = parseCatalog(Object.fromEntries(sheets) as Sheets);
      cached = { at: now(), catalog };
      return catalog;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  return {
    async get(fresh = false): Promise<Catalog> {
      if (pending && !fresh) return pending;
      if (!fresh && cached && now() - cached.at < catalogTtl) return cached.catalog;
      if (pending) {
        await pending.catch(() => undefined);
        return this.get(true);
      }
      pending = download().finally(() => { pending = undefined; });
      return pending;
    },
    expired: () => !cached || now() - cached.at >= catalogTtl,
  };
}
