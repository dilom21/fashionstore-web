import { expect, test } from '../support/fixtures';

import { credenciales } from './support/credenciales';
import {
  CLAVE_TOKEN_LEGACY,
  CLAVE_TOKEN_SAAS,
  iniciarSesion,
} from './support/sesion';

/**
 * Escenarios 4 y 5 del brief 5BZ: guard de sesión tenant y ausencia de las
 * rutas legacy dentro del build SaaS.
 */
test.describe('Guards del modo SaaS', () => {
  test('sin sesión, /saas/inicio redirige a /saas/login', async ({ page }) => {
    await page.goto('/saas/inicio');

    await expect(page).toHaveURL(/\/saas\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Inicia sesión en tu empresa' }),
    ).toBeVisible();
  });

  test('tras el login, recargar mantiene la sesión y usa una clave propia', async ({
    page,
  }) => {
    const { correoA, password } = credenciales();

    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    await page.reload();

    // La sesión se rehidrata con GET /auth/tenant/me: no vuelve al login.
    await expect(page).toHaveURL(/\/saas\/inicio$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Empresa Historica Staging' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Inicia sesión en tu empresa' }),
    ).toHaveCount(0);

    // El token tenant vive en su propia clave: la del legacy sigue vacía.
    const claves = await page.evaluate(
      ([saas, legacy]) => ({
        saas: sessionStorage.getItem(saas),
        legacy: sessionStorage.getItem(legacy),
      }),
      [CLAVE_TOKEN_SAAS, CLAVE_TOKEN_LEGACY] as const,
    );
    expect(claves.saas).not.toBeNull();
    expect(claves.legacy).toBeNull();
  });

  test('con sesión, abrir directamente una URL privada renderiza la sección', async ({
    page,
  }) => {
    const { correoA, password } = credenciales();

    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    // Carga completa (como pegar la URL en la barra): el panel se renderiza en
    // cliente y el guard resuelve con el JWT de sessionStorage.
    await page.goto('/saas/catalogo');

    await expect(page).toHaveURL(/\/saas\/catalogo$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Catálogo' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Productos' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Inicia sesión en tu empresa' }),
    ).toHaveCount(0);
  });

  test('las rutas legacy no existen en el build SaaS', async ({ page }) => {
    for (const ruta of ['/login', '/ventas/presencial', '/catalogo']) {
      await page.goto(ruta);

      // El comodín del modo SaaS devuelve al prefijo /saas (y el guard al login).
      await expect(page).toHaveURL(/\/saas\//);
      await expect(
        page.getByRole('heading', { name: 'Inicia sesión en tu empresa' }),
      ).toBeVisible();

      // Ninguna parte de la UI legacy se renderiza.
      await expect(page.getByText('Bienvenido de nuevo')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /INICIAR SESIÓN/ }),
      ).toHaveCount(0);
    }
  });
});
