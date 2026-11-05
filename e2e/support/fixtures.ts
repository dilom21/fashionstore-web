import { appendFileSync } from 'node:fs';

import { test as base, expect } from '@playwright/test';

/**
 * Fixture compartida de las pruebas E2E de navegador.
 *
 * `registrarRutas` es automática: anota en `E2E_RUTAS_FILE` (si está definida)
 * cada navegación del marco principal con su proyecto y su archivo de spec. El
 * runner del backend usa ese archivo para escribir en la evidencia las rutas
 * REALMENTE visitadas, sin inventarlas.
 *
 * Si la variable no existe, la fixture no hace nada: las pruebas se pueden
 * ejecutar a mano con `npx playwright test`.
 */
function anotarRuta(proyecto: string, spec: string, url: string): void {
  const destino = process.env.E2E_RUTAS_FILE;
  if (destino === undefined || destino.length === 0) {
    return;
  }

  // Solo la ruta interna: sin esquema, host, query ni fragmento.
  let ruta = url;
  try {
    const parsed = new URL(url);
    ruta = parsed.pathname;
  } catch {
    // `about:blank` y otras URLs internas no son navegaciones de la SPA.
    return;
  }

  try {
    appendFileSync(
      destino,
      `${JSON.stringify({ proyecto, spec, ruta })}\n`,
      'utf8',
    );
  } catch {
    // La evidencia es auxiliar: si no se puede escribir, la prueba sigue.
  }
}

export const test = base.extend<{ registrarRutas: void }>({
  registrarRutas: [
    async ({ page }, use, testInfo) => {
      const spec = testInfo.file.split(/[\\/]/).pop() ?? testInfo.file;
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          anotarRuta(testInfo.project.name, spec, frame.url());
        }
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
