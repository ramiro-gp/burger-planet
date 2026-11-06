# Burger Planet

Demo gastronómica de una sola página. Ocho hamburguesas, ocho combos, papas y bebidas. El cliente personaliza, revisa el total estimado y abre un mensaje completo en WhatsApp.

## Ejecutar

Requiere Node 22.13 o superior y pnpm 11.7.0.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Abrí la URL local que indica Astro. El proyecto arranca en **vista previa** con los CSV de ejemplo de `planilla/`. Podés probar el flujo completo hasta WhatsApp. El mensaje de prueba identifica los importes de muestra como no verificados.

```powershell
pnpm check
pnpm test
pnpm build
pnpm preview
```

Para las pruebas en navegador, dejá el build estático corriendo con `pnpm preview --port 4334`. En otra terminal instalá Chromium con `pnpm exec playwright install chromium` y ejecutá `pnpm test:browser`. En Windows también podés usar Edge ya instalado.

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
pnpm test:browser
```

Consultá el [informe de verificación](docs/verificacion.md) para ver los resultados y lo que queda por probar con la planilla real.

## Conectar el catálogo y WhatsApp

1. Importá los seis archivos de [planilla/](planilla/) en seis pestañas de la misma planilla.
2. Configurá el WhatsApp propio, la dirección y las reglas de entrega en **Configuración**.
3. Publicá las pestañas en CSV y pegá sus enlaces en `public/catalog-source.json` siguiendo la [guía de conexión](docs/google-sheets.md).
4. Verificá las seis URLs en el navegador y hacé un pedido de prueba hasta la vista previa del chat. El vendedor confirma disponibilidad, importe y forma de pago.

La [guía de administración](docs/administracion.md) explica cómo editar productos, precios, imágenes y disponibilidad desde la planilla.

## Desplegar en Vercel

Importá el repositorio como proyecto **Astro** y seleccioná Node 24. `vercel.json` fija pnpm 11.7.0 para instalar con el lockfile y compilar. El resultado estático queda en `dist/`. También podés usar otro hosting estático que sirva desde la raíz del dominio y respete `404.html`. [Guía de Astro para Vercel](https://docs.astro.build/en/guides/deploy/vercel/) · [Configuración de compilación en Vercel](https://vercel.com/docs/builds/configure-a-build)

`SITE_URL` es opcional y define el dominio canónico y Open Graph. La demo queda con `noindex` por defecto. Solo configurá `SITE_INDEXABLE=true` si la versión conectada debe aparecer en buscadores. El archivo [.env.example](.env.example) muestra estas dos variables. Las URLs de Sheets son públicas y se configuran en el JSON. Los cambios normales de menú y precios se hacen en la planilla y llegan sin un nuevo despliegue.

## Decisiones técnicas

- Astro 6 en salida estática, TypeScript estricto, Tailwind 4 y Lucide. Los diálogos nativos y un módulo de navegador manejan el flujo de compra. La animación del hero usa CSS y actualizaciones de scroll limitadas a un frame, con alternativa de movimiento reducido.
- El lector trata las seis pestañas como una unidad de validación y mantiene un caché en memoria de 45 segundos. Con un catálogo conectado, el checkout vuelve a consultar la publicación y pide aceptar los cambios antes de abrir WhatsApp.
- Se guardan en el navegador los IDs, opciones y cantidades del carrito. Los datos de contacto, dirección y observaciones de texto libre quedan en memoria durante la visita y nunca se guardan en la planilla.
- Los importes del navegador son orientativos y pueden manipularse. El vendedor debe verificar el pedido con su lista vigente antes de cobrar. La declaración de edad requiere control de DNI en la entrega o retiro.
- Fotografías locales en WebP. Cada combo tiene una composición propia con la foto de su hamburguesa y una porción de papas. La URL es editable por producto.
