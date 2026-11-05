import { expect, test } from '../support/fixtures';

import { credenciales } from './support/credenciales';
import { irA } from './support/navegacion';
import { iniciarSesion } from './support/sesion';

/** Abre la pestaña Productos del catálogo de la empresa. */
async function abrirProductos(
  page: import('@playwright/test').Page,
): Promise<void> {
  await irA(page, 'Catálogo');
  await page.getByRole('tab', { name: 'Productos' }).click();
  await expect(page.getByRole('tab', { name: 'Productos' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/**
 * Escenarios 6 y 7 (mitad de catálogo) del brief 5BZ: aislamiento entre
 * empresas y selectores de talla/color alimentados por los diccionarios reales.
 */
test.describe('Catálogo de la empresa', () => {
  test('la empresa A solo ve su producto', async ({ page }) => {
    const { correoA, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    await abrirProductos(page);

    await expect(
      page.getByRole('rowheader', { name: 'Polo ficticio 5BR' }),
    ).toBeVisible();
    await expect(page.getByText('Camisa Ficticia B')).toHaveCount(0);
  });

  test('la empresa B solo ve su producto', async ({ page }) => {
    const { correoB, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-b',
      correo: correoB,
      password,
    });

    await abrirProductos(page);

    await expect(
      page.getByRole('rowheader', { name: 'Camisa Ficticia B' }),
    ).toBeVisible();
    await expect(page.getByText('Polo ficticio 5BR')).toHaveCount(0);
  });

  test('el alta de variante usa selectores de talla y color, no IDs manuales', async ({
    page,
  }) => {
    const { correoA, password } = credenciales();
    await iniciarSesion(page, {
      empresaSlug: 'empresa-a',
      correo: correoA,
      password,
    });

    await abrirProductos(page);
    await page
      .getByRole('button', { name: 'Ver variantes de Polo ficticio 5BR' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Variantes de «Polo ficticio 5BR»' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Agregar variante' }).click();
    await expect(
      page.getByRole('heading', { name: 'Nueva variante' }),
    ).toBeVisible();

    const talla = page.getByLabel('Talla', { exact: true });
    const color = page.getByLabel('Color', { exact: true });

    // Controles reales del formulario: <select>, nunca campos numéricos.
    expect(await talla.evaluate((el) => el.tagName)).toBe('SELECT');
    expect(await color.evaluate((el) => el.tagName)).toBe('SELECT');

    // Opciones del diccionario global del staging local.
    await expect(
      talla.getByRole('option', { name: 'M', exact: true }),
    ).toHaveCount(1);
    await expect(
      color.getByRole('option', { name: 'Negro', exact: true }),
    ).toHaveCount(1);

    // El formulario se puede completar con esos valores y el SKU es texto.
    const sku = page.getByLabel('SKU', { exact: true });
    expect(await sku.evaluate((el) => el.tagName)).toBe('INPUT');
    expect(await sku.getAttribute('type')).toBe('text');
  });
});
