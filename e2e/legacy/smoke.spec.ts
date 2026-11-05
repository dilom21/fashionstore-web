import { expect, test } from '../support/fixtures';

/**
 * Smoke del build legacy (project `legacy`).
 *
 * Comprueba que el bundle por defecto sigue sirviendo la UI legacy, que el
 * prefijo `/saas` NO existe en ese build y que no hay errores críticos de
 * consola. No usa credenciales: no inicia sesión ni escribe datos.
 */

/** Ruido de red del navegador (el bundle legacy apunta a una API externa). */
const RUIDO_DE_RED =
  /Failed to load resource|net::ERR|CORS|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_FAILED|status of 4\d\d|status of 5\d\d/i;

test.describe('Smoke legacy', () => {
  test('/login renderiza el formulario legacy', async ({ page }) => {
    await page.goto('/login');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Bienvenido de nuevo' }),
    ).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /INICIAR SESIÓN/ }),
    ).toBeVisible();

    // Nada del shell SaaS aparece en este build.
    await expect(
      page.getByRole('heading', { name: 'Inicia sesión en tu empresa' }),
    ).toHaveCount(0);
  });

  test('/ renderiza la landing legacy y /saas/login no existe', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'ELEVA TU',
    );
    await expect(
      page.getByRole('banner').getByRole('link', { name: /VANTER MEN/ }),
    ).toBeVisible();

    await page.goto('/saas/login');

    // El build legacy no registra `/saas`: el comodín devuelve a la landing.
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:4201\/$/);
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(
      page.getByRole('heading', { name: 'Inicia sesión en tu empresa' }),
    ).toHaveCount(0);
  });

  test('no hay errores críticos de consola', async ({ page }) => {
    const erroresConsola: string[] = [];
    const excepciones: string[] = [];

    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error') {
        erroresConsola.push(mensaje.text());
      }
    });
    page.on('pageerror', (error) => {
      excepciones.push(error.message);
    });

    await page.goto('/login');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bienvenido de nuevo' }),
    ).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'ELEVA TU',
    );

    const ignorados = erroresConsola.filter((texto) =>
      RUIDO_DE_RED.test(texto),
    );
    const criticos = erroresConsola.filter(
      (texto) => !RUIDO_DE_RED.test(texto),
    );

    // Se documenta el ruido de red real (sin datos personales) para la evidencia.
    test.info().annotations.push({
      type: 'consola',
      description:
        `errores de red ignorados: ${ignorados.length}; ` +
        `errores críticos: ${criticos.length}`,
    });

    expect(excepciones, `Excepciones en el navegador: ${excepciones.join(' | ')}`)
      .toEqual([]);
    expect(criticos, `Errores de consola: ${criticos.join(' | ')}`).toEqual([]);
  });
});
