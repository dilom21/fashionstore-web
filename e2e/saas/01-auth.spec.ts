import { expect, test } from '../support/fixtures';

import { CLAVE_TOKEN_SAAS, enviarLogin, iniciarSesion } from './support/sesion';
import { credenciales } from './support/credenciales';

/**
 * Escenarios 1, 2 y 3 del brief 5BZ: login de la empresa A, login de la
 * empresa B y login cruzado (credenciales de A con el slug de B).
 *
 * Todos los datos salen del staging local con datos ficticios.
 */
test.describe('Login de empresa (tenant)', () => {
  test('la empresa A entra al panel con su nombre y el plan PROFESIONAL', async ({
    page,
  }) => {
    const { correoA, password } = credenciales();

    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    // Nombre comercial real de la empresa A en el staging local.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Empresa Historica Staging' }),
    ).toBeVisible();
    await expect(page.getByText('empresa-a').first()).toBeVisible();

    // El shell publica el plan y la pantalla de inicio el límite del plan.
    await expect(page.getByText('PROFESIONAL').first()).toBeVisible();
    await expect(page.getByText(/\d+ de 10/)).toBeVisible();
  });

  test('la empresa B entra al panel con su nombre y el plan BASICO', async ({
    page,
  }) => {
    const { correoB, password } = credenciales();

    await iniciarSesion(page, {
      empresaSlug: 'empresa-b',
      correo: correoB,
      password,
    });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Boutique B' }),
    ).toBeVisible();
    await expect(page.getByText('BASICO').first()).toBeVisible();
    await expect(page.getByText(/\d+ de 2/)).toBeVisible();
  });

  test('credenciales de A con el slug de B no crean sesión', async ({
    page,
  }) => {
    const { correoA, password } = credenciales();

    await enviarLogin(page, {
      empresaSlug: 'empresa-b',
      correo: correoA,
      password,
    });

    // Mensaje de error visible del login (el backend responde 401).
    const alerta = page.getByRole('alert').first();
    await expect(alerta).toBeVisible();
    await expect(alerta).toContainText(
      'Correo, contraseña o empresa incorrectos.',
    );
    await expect(alerta).not.toContainText(/sesión expiró/i);

    // Sigue en el login y NO quedó un JWT tenant guardado.
    await expect(page).toHaveURL(/\/saas\/login$/);
    const token = await page.evaluate(
      (clave) => sessionStorage.getItem(clave),
      CLAVE_TOKEN_SAAS,
    );
    expect(token).toBeNull();
  });
});
