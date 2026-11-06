# Conectar Google Sheets

## Preparar la planilla

1. Creá una planilla nueva e importá en pestañas separadas `hamburguesas.csv`, `combos.csv`, `papas.csv`, `bebidas.csv`, `extras.csv` y `configuracion.csv`. Elegí **Insertar hojas nuevas**, separador coma y conservá la primera fila como encabezado.
2. Renombrá las pestañas **Hamburguesas**, **Combos**, **Papas**, **Bebidas**, **Extras** y **Configuración**. El conector usa el `gid` de cada pestaña, por lo que los títulos sirven para organizarlas.
3. En **Configuración**, completá la fila `whatsapp` con el número internacional del negocio. Usá solo dígitos y conservá la celda como texto sin formato. También completá dirección, costo de envío y restricciones de alcohol. Las filas `instagram` y `tiktok` son opcionales y admiten enlaces HTTPS a perfiles. Las filas opcionales `horarios`, `cupon_codigo` y `cupon_porcentaje` están en el CSV de muestra. Una planilla anterior puede omitir estas filas. No publiques datos de clientes, credenciales ni pedidos.
4. Abrí **Archivo → Compartir → Publicar en la web**. Publicá cada pestaña como **Valores separados por comas (.csv)** y copiá el enlace. Confirmá que quede activa la republicación automática. Las cuentas de empresa o escuela pueden restringir esta función. [Ayuda de Google Sheets](https://support.google.com/docs/answer/183965?hl=es)
5. Abrí los seis enlaces en un navegador sin iniciar sesión. Deben devolver CSV desde el mismo identificador de publicación y tener distintos valores de `gid`.

## Configurar el sitio

Cambiá `public/catalog-source.json` a este formato y sustituí cada marcador por el enlace CSV de la pestaña correspondiente.

```json
{
  "mode": "sheets",
  "urls": {
    "hamburguesas": "PEGAR_CSV_HAMBURGUESAS",
    "combos": "PEGAR_CSV_COMBOS",
    "papas": "PEGAR_CSV_PAPAS",
    "bebidas": "PEGAR_CSV_BEBIDAS",
    "extras": "PEGAR_CSV_EXTRAS",
    "configuracion": "PEGAR_CSV_CONFIGURACION"
  }
}
```

El enlace esperado es el de publicación CSV de una sola pestaña. Tiene la ruta `/spreadsheets/d/e/<ID_PUBLICACION>/pub` y los parámetros `gid=<ID_PESTAÑA>&single=true&output=csv`. Un enlace de edición o de vista previa no sirve.

Probá la lectura directa desde Chromium con `node scripts/probar-cors.mjs` después de instalar el navegador de Playwright. Si tenés Edge instalado, podés definir `PLAYWRIGHT_CHANNEL=msedge` en PowerShell. El script usa un origen local diferente de Google y muestra el estado, el tipo de contenido y el host final de cada respuesta, sin imprimir filas.

Una vez verificadas las URLs, compilá y desplegá la versión conectada. El comercio podrá editar los datos sin repetir este paso. El sitio conserva las últimas seis pestañas válidas durante la visita. Si falla una actualización, puede seguir mostrando el catálogo anterior, pero bloquea la salida a WhatsApp hasta que pueda verificar los datos de nuevo.

## Por qué CSV publicado

Se probó con Edge y una hoja pública de referencia. El navegador siguió la redirección de Google y pudo leer la respuesta CSV desde un origen diferente. La prueba de las seis URLs de Burger Planet queda pendiente hasta que el comercio las publique.

Google Sheets API v4 permitiría leer varias pestañas con una sola llamada, pero agregaría un proyecto de Google Cloud y una clave pública restringida a la API y a los referrers del sitio. La API documenta 300 lecturas por minuto por proyecto y 60 por usuario y proyecto. Esa tabla de cuotas corresponde a la API v4. Para esta demo se eligió CSV publicado y se limitan consultas con caché en memoria, seis lecturas en paralelo por actualización y una nueva lectura al finalizar. [Cuotas de Google Sheets API](https://developers.google.com/workspace/sheets/api/limits)

Google indica que la publicación puede tardar unos minutos en reflejar cambios de la planilla. Las seis descargas tampoco forman una transacción. Para cambios coordinados que afecten varias pestañas, verificá los CSV públicos cuando termines de editar y confirmá los pedidos contra la planilla vigente. [Publicación y tiempo de actualización](https://support.google.com/docs/answer/183965?hl=es)
