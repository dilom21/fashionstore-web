import { expect, test } from '../support/fixtures';

import { credenciales } from './support/credenciales';
import { irA } from './support/navegacion';
import { CLAVE_TOKEN_SAAS, enviarLogin, iniciarSesion } from './support/sesion';

/**
 * Escenario 13 del brief 5BZ: errores visibles.
 *
 * - Contraseña incorrecta ⇒ el backend responde 401 y la UI muestra el aviso.
 * - Venta sin líneas ⇒ la validación local corta antes de cualquier POST (no se
 *   provoca un 422 en el servidor).
 */
test.describe('Errores visibles', () => {
  test('contraseña incorrecta muestra el aviso del backend', async ({
    page,
  }) => {
    const { correoA } = credenciales();

    const [respuesta] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes('/auth/tenant/login') &&
          resp.request().method() === 'POST',
      ),
      enviarLogin(page, {
        empresaSlug: 'empresa-a',
        correo: correoA,
        password: 'clave-incorrecta-e2e-5bz',
      }),
    ]);

    expect(respuesta.status()).toBe(401);
    const alerta = page.getByRole('alert').first();
    await expect(alerta).toBeVisible();
    // D3: un 401 es credenciales/empresa, no una sesión expirada.
    await expect(alerta).toContainText(
      'Correo, contraseña o empresa incorrectos.',
    );
    await expect(alerta).not.toContainText(/sesión expiró/i);
    await expect(page).toHaveURL(/\/saas\/login$/);

    // Se documenta el texto real del aviso (sin datos personales).
    test.info().annotations.push({
      type: 'mensaje-401',
      description: (await alerta.innerText()).slice(0, 200),
    });

    const token = await page.evaluate(
      (clave) => sessionStorage.getItem(clave),
      CLAVE_TOKEN_SAAS,
    );
    expect(token).toBeNull();
  });

  test('la venta sin líneas se detiene en la validación local', async ({
    page,
  }) => {
    const { correoA, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    await irA(page, 'Venta de contado');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Venta de contado' }),
    ).toBeVisible();

    // La pantalla arranca con una línea vacía: se envía sin elegir inventario.
    const posts: string[] = [];
    page.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        req.url().endsWith('/tenant/ventas/contado')
      ) {
        posts.push(req.url());
      }
    });

    await page.getByRole('button', { name: 'Registrar venta' }).click();

    await expect(
      page.getByText(/Revisa las líneas marcadas antes de registrar la venta/),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Ingresa el identificador de inventario \(entero mayor que 0\)/,
      ),
    ).toBeVisible();

    // Nada viajó al backend: el 422 se evita en el cliente (lista vacía).
    expect(posts).toEqual([]);
  });
});
