import hamburguesas from '../../planilla/hamburguesas.csv?raw';
import combos from '../../planilla/combos.csv?raw';
import papas from '../../planilla/papas.csv?raw';
import bebidas from '../../planilla/bebidas.csv?raw';
import extras from '../../planilla/extras.csv?raw';
import configuracion from '../../planilla/configuracion.csv?raw';
import { parseCatalog } from './catalog';

export const previewCatalog = parseCatalog({ hamburguesas, combos, papas, bebidas, extras, configuracion });
