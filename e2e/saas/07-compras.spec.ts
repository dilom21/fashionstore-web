import type { Locator } from '@playwright/test';

import { expect, test } from '../support/fixtures';

import { credenciales } from './support/credenciales';
import { irA } from './support/navegacion';
import { iniciarSesion } from './support/sesion';

/** Elige en un `<select>` la opción cuyo texto contiene `texto`. */
async function elegirPorTexto(select: Locator, texto: string): Promise<void> {
  const opcion = select.locator('option', { hasText: texto });
  await expect(opcion).toHaveCount(1);
  const valor = await opcion.getAttribute('value');
  expect(valor, `La opción «${texto}» no tiene value`).not.toBeNull();
  await select.selectOption(valor as string);
}

/**
 * Escenario 9 del brief 5BZ: alta real de una orden de compra en la empresa A y
 * bloqueo honesto en la empresa B (que no tiene proveedores).
 */
test.describe('Órdenes de compra', () => {
  test('la empresa A crea una orden real con su único proveedor', async ({
    page,
  }) => {
    const { correoA, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    await irA(page, 'Compras');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Compras' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Nueva orden' }).click();
    await expect(
      page.getByRole('heading', { name: 'Nueva orden de compra' }),
    ).toBeVisible();

    // Los catálogos reales se cargan al abrir el panel.
    const proveedor = page.getByLabel('Proveedor', { exact: true });
    await expect(proveedor.locator('option')).not.toHaveCount(1);
    await elegirPorTexto(proveedor, 'Proveedor Ficticio 5BR SRL');

    await elegirPorTexto(
      page.getByLabel('Sucursal', { exact: true }),
      'Sucursal Ficticia 5BR',
    );

    await elegirPorTexto(
      page.getByLabel('Variante de la línea 1'),
      'SKU-5BR-FICTICIO',
    );
    await elegirPorTexto(
      page.getByLabel('Temporada de la línea 1'),
      '2026',
    );

    await page.getByLabel('Cantidad de la línea 1').fill('2');
    await page.getByLabel('Costo unitario de la línea 1').fill('10.50');

    const [respuesta] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().endsWith('/tenant/ordenes-compra') &&
          resp.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Crear orden' }).click(),
    ]);

    expect(respuesta.status()).toBe(201);
    const cuerpo = (await respuesta.json()) as {
      orden_compra_id: number;
      estado: string;
    };
    expect(cuerpo.estado).toBe('BORRADOR');

    await expect(
      page.getByRole('status').filter({
        hasText: new RegExp(
          `Orden de compra #${cuerpo.orden_compra_id} creada en estado Borrador`,
        ),
      }),
    ).toBeVisible();

    // La orden creada aparece en el listado con su número.
    const listado = page.getByRole('region', {
      name: 'Listado de órdenes de compra',
    });
    await expect(
      listado.getByRole('rowheader', {
        name: String(cuerpo.orden_compra_id),
        exact: true,
      }),
    ).toHaveCount(1);
  });

  test('la empresa B crea un proveedor real desde el alta y lo usa en la orden', async ({
    page,
  }) => {
    const { correoB, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-b',
      correo: correoB,
      password,
    });

    await irA(page, 'Compras');
    await page.getByRole('button', { name: 'Nueva orden' }).click();
    await expect(
      page.getByRole('heading', { name: 'Nueva orden de compra' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo proveedor' }).click();
    await expect(
      page.getByRole('heading', { name: 'Nuevo proveedor' }),
    ).toBeVisible();

    const sufijo = Date.now().toString().slice(-8);
    const razon = `Proveedor E2E 5C0 ${sufijo}`;

    await page.locator('#proveedor-razon').fill(razon);
    await page.locator('#proveedor-nit').fill(`NIT-E2E-${sufijo}`);

    // El producto de la empresa B se marca para que la orden lo acepte.
    const producto = page.getByRole('checkbox').first();
    await expect(producto).toBeVisible();
    await producto.check();

    const [respuesta] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().endsWith('/tenant/proveedores') &&
          resp.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Crear proveedor' }).click(),
    ]);

    expect(respuesta.status()).toBe(201);
    const cuerpo = (await respuesta.json()) as {
      id: number;
      razon_social: string;
      total_productos: number;
    };
    expect(cuerpo.total_productos).toBeGreaterThan(0);

    // El panel se cierra y el proveedor creado queda seleccionado.
    const proveedor = page.getByLabel('Proveedor', { exact: true });
    await expect(proveedor).toBeEnabled();
    await expect(
      proveedor.locator('option', { hasText: razon }),
    ).toHaveCount(1);
    await expect(proveedor.locator('option:checked')).toHaveText(razon);
  });
});
