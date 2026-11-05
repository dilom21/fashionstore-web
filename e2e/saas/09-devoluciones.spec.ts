import { expect, test } from '../support/fixtures';

import { credenciales } from './support/credenciales';
import { estadoDisponible, leerEstado } from './support/estado';
import { irA } from './support/navegacion';
import { iniciarSesion } from './support/sesion';

/**
 * Escenario 10 del brief 5BZ: devolución real encadenada.
 *
 * Usa el `venta_id` que dejó `08-venta-contado.spec.ts` (venta real de 1 unidad
 * de `SKU-5BR-FICTICIO`), carga sus líneas con
 * `GET /tenant/devoluciones/ventas/{id}/lineas`, devuelve 1 unidad con reposición
 * de stock y comprueba el 201 y el alta en el listado.
 */
test.describe('Devoluciones', () => {
  test('crea una devolución sobre la venta anterior', async ({ page }) => {
    if (!estadoDisponible()) {
      throw new Error(
        'No hay venta_id del escenario 8. Ejecuta el proyecto completo ' +
          '(`npx playwright test --project=saas`): 08-venta-contado.spec.ts ' +
          'debe correr antes que este archivo.',
      );
    }
    const { ventaId } = leerEstado();
    const venta = ventaId as number;

    const { correoA, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    await irA(page, 'Devoluciones');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Devoluciones' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Nueva devolución' }).click();
    await expect(
      page.getByRole('heading', { name: 'Nueva devolución' }),
    ).toBeVisible();

    await page.getByLabel('Número de venta').fill(String(venta));
    await page.getByRole('button', { name: 'Cargar líneas' }).click();

    await expect(
      page.getByRole('heading', { name: 'Líneas devolvibles' }),
    ).toBeVisible();

    const fila = page.getByRole('row', { name: /SKU-5BR-FICTICIO/ });
    await expect(fila).toHaveCount(1);
    await expect(fila.getByRole('rowheader')).toHaveText('SKU-5BR-FICTICIO');

    // La venta fue de 1 unidad: queda 1 unidad disponible para devolver.
    const cantidad = page.getByLabel('Cantidad a devolver de la línea 1');
    await expect(cantidad).toHaveAttribute('max', '1');
    await expect(page.getByLabel('Reponer stock de la línea 1')).toBeChecked();

    await cantidad.fill('1');
    await page
      .getByLabel('Motivo de la línea 1')
      .fill('Talla incorrecta (E2E 5BZ)');
    await page.getByLabel('Motivo general').fill('Devolución E2E 5BZ');

    const [respuesta] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().endsWith('/tenant/devoluciones') &&
          resp.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Crear devolución' }).click(),
    ]);

    expect(respuesta.status()).toBe(201);
    const creada = (await respuesta.json()) as {
      devolucion_id: number;
      venta_id: number;
      estado: string;
      unidades: number;
      items: Array<{ detalle_venta_id: number; reponer: boolean }>;
    };
    expect(creada.venta_id).toBe(venta);
    expect(creada.estado).toBe('SOLICITADA');
    expect(creada.unidades).toBe(1);
    // La devolución nace SOLICITADA: el stock se repone al procesarla (el
    // backend informa `stock_modificado` en la respuesta, no se asume).
    expect(creada.items).toHaveLength(1);
    expect(creada.items[0].reponer).toBe(true);

    await expect(
      page.getByRole('status').filter({
        hasText: new RegExp(
          `Devolución #${creada.devolucion_id} creada en estado Solicitada`,
        ),
      }),
    ).toBeVisible();

    const listado = page.getByRole('region', {
      name: 'Listado de devoluciones',
    });
    await expect(
      listado.getByRole('rowheader', {
        name: String(creada.devolucion_id),
        exact: true,
      }),
    ).toHaveCount(1);

    // Cierre de la cadena (reponer = true): aprobar y procesar devuelve el
    // stock a la sucursal, así la suite se puede repetir sin agotar existencias.
    await listado
      .getByRole('button', {
        name: `Ver el detalle de la devolución ${creada.devolucion_id}`,
      })
      .click();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await page.getByRole('button', { name: 'Sí, aprobar' }).click();
    await expect(
      page.getByRole('status').filter({
        hasText: new RegExp(
          `Devolución #${creada.devolucion_id} aprobada \\(estado APROBADA\\)`,
        ),
      }),
    ).toBeVisible();

    const [proceso] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().endsWith(
            `/tenant/devoluciones/${creada.devolucion_id}/procesar`,
          ) && resp.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Procesar', exact: true }).click(),
    ]);
    // `POST /tenant/devoluciones/{id}/procesar` declara `response_model` sin
    // `status_code`: el alta devuelve 200 (crear sí usa 201).
    expect(proceso.status()).toBe(200);
    const procesada = (await proceso.json()) as {
      devolucion_id: number;
      estado: string;
      idempotente: boolean;
      unidades_repuestas: number;
    };
    expect(procesada.devolucion_id).toBe(creada.devolucion_id);
    expect(procesada.estado).toBe('COMPLETADA');
    expect(procesada.idempotente).toBe(false);
    expect(procesada.unidades_repuestas).toBe(1);

    await expect(
      page.getByRole('status').filter({
        hasText: new RegExp(
          `Devolución #${creada.devolucion_id} completada: 1 unidades repuestas`,
        ),
      }),
    ).toBeVisible();
  });
});
