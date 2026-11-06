# Verificación de Burger Planet V1.1

6 de noviembre de 2026. Windows, Node 24.12.0, pnpm 11.7.0 y Edge con Playwright.

| Comprobación | Resultado |
| --- | --- |
| `pnpm check` | Sin errores, advertencias ni sugerencias |
| `pnpm test` | 12 pruebas aprobadas |
| `pnpm build` | Build estático generado y servido en el puerto local 4333 |
| `pnpm test:browser` | 10 escenarios aprobados |
| Hero | Fijación, avance, retroceso y liberación comprobados a 320, 390 y 1440 px. Movimiento reducido sin fijación ni recorrido extra |
| Catálogo | Combos primero, ocho recursos distintos y estado «Agregado» durante 1500 ms. Se verificó que repetir el clic durante ese estado no duplica el producto |
| Carrito y checkout | Variantes, extras, recargos, edición, persistencia, validaciones de entrega y edad, y teclado |
| Google Sheets | Respuestas controladas para comprobar recálculo, aceptación de cambios y bloqueo por red caída o falta de stock |
| WhatsApp | Navegación interceptada para verificar el número y el mensaje codificado. La vista previa identifica los importes como precios de muestra sin verificar |

Se inspeccionaron capturas del hero en los tres anchos y del catálogo. La compilación conserva las advertencias de Rollup sobre comentarios de optimización en una dependencia transitiva de Zod. El build terminó y su salida pasó las pruebas de navegador.

La planilla del comercio se conecta con las seis URLs públicas cuando estén disponibles. Los enlaces de Instagram y TikTok quedan inactivos hasta configurar perfiles. Consultá la [guía de administración](administracion.md).
