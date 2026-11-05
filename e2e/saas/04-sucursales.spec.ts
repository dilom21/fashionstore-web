import { expect, test } from '../support/fixtures';

import { credenciales } from './support/credenciales';
import { irA } from './support/navegacion';
import { iniciarSesion } from './support/sesion';

/**
 * Escenarios 7 (mitad de sucursales) y 12 del brief 5BZ: el alta de sucursal
 * elige la ciudad del catálogo real y el límite del plan se ve y se respeta.
 */
test.describe('Sucursales y límite del plan', () => {
  test('el alta de sucursal elige la ciudad de un select real', async ({
    page,
  }) => {
    const { correoA, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    await irA(page, 'Sucursales');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sucursales' }),
    ).toBeVisible();
    await expect(
      page.getByText(/de 10 sucursales activas permitidas por el plan/),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Nueva sucursal' }).click();
    await expect(
      page.getByRole('heading', { name: 'Nueva sucursal' }),
    ).toBeVisible();

    const ciudad = page.getByLabel('Ciudad', { exact: true });
    expect(await ciudad.evaluate((el) => el.tagName)).toBe('SELECT');
    await expect(
      ciudad.getByRole('option', { name: 'Ciudad Ficticia', exact: true }),
    ).toHaveCount(1);
  });

  test('la empresa B ve 2 de 2 sucursales y el backend rechaza la tercera', async ({
    page,
  }) => {
    const { correoB, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-b',
      correo: correoB,
      password,
    });

    await irA(page, 'Sucursales');
    await expect(
      page.getByText(/2 de 2 sucursales activas permitidas por el plan/),
    ).toBeVisible();

    const listado = page.getByRole('region', {
      name: 'Listado de sucursales de la empresa',
    });
    await expect(listado.getByRole('rowheader')).toHaveCount(2);

    await page.getByRole('button', { name: 'Nueva sucursal' }).click();
    await expect(
      page.getByText(/Ya usas el máximo de sucursales activas de tu plan/),
    ).toBeVisible();

    await page.getByLabel('Nombre', { exact: true }).fill('Sucursal E2E 5BZ');
    await page
      .getByLabel('Dirección', { exact: true })
      .fill('Calle de prueba E2E 5BZ');
    await page.getByLabel('Ciudad', { exact: true }).selectOption({
      label: 'Ciudad Ficticia',
    });

    const [respuesta] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes('/tenant/empresa/sucursales') &&
          resp.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Crear sucursal' }).click(),
    ]);

    // El límite lo impone el backend, no la UI.
    expect(respuesta.status()).toBe(409);
    await expect(
      page.getByRole('alert').filter({ hasText: /límite|limite/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Tu plan permite 2 sucursales activas y ya tienes 2/),
    ).toBeVisible();

    // No se creó nada: sigue habiendo 2 sucursales y no hay mensaje de éxito.
    await expect(
      page.getByText(/Sucursal «Sucursal E2E 5BZ» creada/),
    ).toHaveCount(0);
    await expect(listado.getByRole('rowheader')).toHaveCount(2);
  });
});
