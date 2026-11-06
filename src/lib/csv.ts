/** RFC 4180 subset: commas, quoted multiline fields, escaped quotes, BOM and CRLF. */
export function parseCsv(input: string): string[][] {
  if (input.length > 2_000_000) throw new Error('El CSV supera el límite de 2 MB.');
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const pushCell = () => { row.push(cell.trim()); cell = ''; closed = false; if (row.length > 30) throw new Error('Demasiadas columnas.'); };
  const pushRow = () => { pushCell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > 2001) throw new Error('Máximo 2000 registros.'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === ',') pushCell();
    else if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (char === '"' && !cell && !closed) quoted = true;
    else if (closed && char.trim()) throw new Error('Texto inesperado después de comillas.');
    else if (char === '"') throw new Error('Comillas sin escapar.');
    else if (!closed) cell += char;
    if (cell.length > 4000) throw new Error('Una celda supera 4000 caracteres.');
  }
  if (quoted) throw new Error('Comillas sin cerrar.');
  if (cell || row.length || closed) pushRow();
  return rows;
}

export function csvRecords(input: string, headers: readonly string[], tab: string): Record<string, string>[] {
  const rows = parseCsv(input);
  const actual = rows.shift();
  if (!actual || actual.length !== headers.length || actual.some((v, i) => v !== headers[i])) {
    throw new Error(`${tab}: encabezados incorrectos. Usá la plantilla sin cambiar los nombres ni el orden de las columnas.`);
  }
  return rows.map((row, index) => {
    if (row.length !== headers.length) throw new Error(`${tab}, fila ${index + 2}: cantidad incorrecta de columnas.`);
    return Object.fromEntries(headers.map((key, i) => [key, row[i]]));
  });
}
