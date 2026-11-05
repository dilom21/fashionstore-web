import { expect, test } from '../support/fixtures';

import { credenciales } from './support/credenciales';
import { guardarEstado } from './support/estado';
import { irA } from './support/navegacion';
import { iniciarSesion, tokenSaas } from './support/sesion';

/**
 * Escenario 8 del brief 5BZ: venta de contado REAL contra FastAPI.
 *
 * 1. La UI elige el inventario `SKU-5BR-FICTICIO` de la sucursal y registra la
 *    venta. Se captura el `venta_id` de la pantalla y el cuerpo EXACTO que envió
 *    el navegador (`page.on('request')`).
 * 2. Se repite ese mismo cuerpo con `page.request.post` contra el endpoint real:
 *    el backend responde 200 con `idempotente: true` y el mismo `venta_id`.
 *
 * No hay `page.route` ni mocks: todo el flujo habla con FastAPI y PostgreSQL.
 */
test.describe('Venta de contado real', () => {
  test('registra la venta y el replay del mismo cuerpo es idempotente', async ({
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

    // La sucursal activa se preselecciona con la sesión.
    const sucursal = page.getByLabel('Sucursal', { exact: true });
    await expect(sucursal).not.toHaveValue('');

    const inventario = page.getByLabel('Inventario de la línea 1');
    const opcion = inventario.locator('option', {
      hasText: 'SKU-5BR-FICTICIO',
    });
    await expect(opcion).toHaveCount(1);
    // La etiqueta publica el stock disponible real del servidor.
    await expect(opcion).toContainText(/disp\. \d+/);

    const valorInventario = await opcion.getAttribute('value');
    expect(valorInventario).not.toBeNull();
    await inventario.selectOption(valorInventario as string);

    await page.getByLabel('Cantidad de la línea 1').fill('1');

    let cuerpo: string | null = null;
    let urlPeticion: string | null = null;
    page.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        req.url().endsWith('/tenant/ventas/contado')
      ) {
        cuerpo = req.postData();
        urlPeticion = req.url();
      }
    });

    const [respuesta] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().endsWith('/tenant/ventas/contado') &&
          resp.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Registrar venta' }).click(),
    ]);

    expect(respuesta.status()).toBe(201);
    const creada = (await respuesta.json()) as {
      venta_id: number;
      idempotente: boolean;
    };
    expect(creada.idempotente).toBe(false);

    const aviso = page
      .getByRole('status')
      .filter({ hasText: /Venta #\d+ registrada correctamente/ })
      .first();
    await expect(aviso).toBeVisible();

    const texto = await aviso.innerText();
    const coincidencia = /Venta #(\d+)/.exec(texto);
    expect(coincidencia, `Sin número de venta en «${texto}»`).not.toBeNull();
    const ventaId = Number((coincidencia as RegExpExecArray)[1]);
    expect(ventaId).toBe(creada.venta_id);

    // Cuerpo exacto generado por la UI (payload real, no reconstruido a mano).
    expect(cuerpo, 'La UI no envió cuerpo a /tenant/ventas/contado').not.toBeNull();
    const payload = JSON.parse(cuerpo as string) as {
      sucursal_id: number;
      operacion_id: string;
      metodo_pago: string;
      lineas: Array<{ inventario_id: number; cantidad: number }>;
    };
    expect(payload.lineas).toHaveLength(1);
    expect(payload.lineas[0].cantidad).toBe(1);
    expect(payload.operacion_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // ===== Replay REAL del mismo cuerpo contra FastAPI =====
    // Se repite el endpoint EXACTO que usó la SPA (no el host del frontend).
    expect(urlPeticion, 'Sin URL del endpoint de la venta').not.toBeNull();
    const token = await tokenSaas(page);
    const replay = await page.request.post(urlPeticion as string, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: cuerpo as string,
    });

    expect(replay.status()).toBe(200);
    const repetida = (await replay.json()) as {
      venta_id: number;
      idempotente: boolean;
      operacion_id: string;
    };
    expect(repetida.idempotente).toBe(true);
    expect(repetida.venta_id).toBe(ventaId);
    expect(repetida.operacion_id).toBe(payload.operacion_id);

    // El escenario 9 encadena la devolución sobre esta venta.
    guardarEstado({ ventaId });
  });
});
