import { readFileSync } from 'node:fs';
import { parseCatalog, tabs, type Sheets } from '../src/lib/catalog';

export const csv = Object.fromEntries(tabs.map((name) => [
  name, readFileSync(new URL('../planilla/' + name + '.csv', import.meta.url), 'utf8'),
])) as Sheets;
export const catalog = parseCatalog(csv);
// Reservado para pruebas con la navegación interceptada.
export const mockNumber = '12025550123';
export const testUrls = Object.fromEntries(tabs.map((name, i) => [
  name, 'https://docs.google.com/spreadsheets/d/e/test-fixture-only/pub?gid=' + i + '&single=true&output=csv',
])) as Record<typeof tabs[number], string>;
