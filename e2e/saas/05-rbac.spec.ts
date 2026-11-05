import { expect, test } from '../support/fixtures';

import { credenciales } from './support/credenciales';
import { irA } from './support/navegacion';
import { iniciarSesion } from './support/sesion';

/**
 * Escenario 11 del brief 5BZ: RBAC real en el navegador.
 *
 * El CAJERO de la empresa B no tiene `PERSONAL/CONSULTAR`: el menú no ofrece
 * «Personal» ni «Roles y permisos» y abrir la URL directa termina en la
 * pantalla de sin permiso, sin datos de personal y sin 500. El ADMINISTRADOR de
 * B sí carga ambas pantallas.
 */
test.describe('RBAC en navegador', () => {
  test('el CAJERO de B no ve Personal y la URL directa muestra sin permiso', async ({
    page,
  }) => {
    const { correoCajeroB, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-b',
      correo: correoCajeroB,
      password,
    });

    await expect(page.getByText('CAJERO').first()).toBeVisible();

    const menu = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Personal' })).toHaveCount(0);
    await expect(
      menu.getByRole('link', { name: 'Roles y permisos' }),
    ).toHaveCount(0);

    // URL directa con sesión: el guard de permiso del cliente decide.
    await page.goto('/saas/personal');

    await expect(page).toHaveURL(/\/saas\/sin-permiso$/);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'No tienes permiso para esta sección',
      }),
    ).toBeVisible();
    await expect(page.getByText(/Tu rol \(CAJERO\)/)).toBeVisible();

    // No es un 500 ni una tabla con datos filtrados.
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText(/500|Internal Server Error/i)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Personal' }),
    ).toHaveCount(0);
  });

  test('el ADMINISTRADOR de B carga Personal y Roles y permisos', async ({
    page,
  }) => {
    const { correoB, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-b',
      correo: correoB,
      password,
    });

    const menu = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(menu.getByRole('link', { name: 'Personal' })).toBeVisible();
    await expect(
      menu.getByRole('link', { name: 'Roles y permisos' }),
    ).toBeVisible();

    await irA(page, 'Personal');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Personal' }),
    ).toBeVisible();

    await irA(page, 'Roles y permisos');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Roles y permisos' }),
    ).toBeVisible();
  });
});
