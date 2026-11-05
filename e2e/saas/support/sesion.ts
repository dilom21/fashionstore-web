import { Page, expect } from '@playwright/test';

/** Datos de login de una membresía del staging local. */
export interface DatosLogin {
  empresaSlug: string;
  correo: string;
  password: string;
  /** Contexto del contrato (`personal` | `cliente`). Por defecto `personal`. */
  contexto?: 'personal' | 'cliente';
}

/** Clave de `sessionStorage` del JWT tenant (contrato del modo SaaS). */
export const CLAVE_TOKEN_SAAS = 'vanter_saas_access_token';

/** Clave de `sessionStorage` del JWT legacy (debe seguir vacía en SaaS). */
export const CLAVE_TOKEN_LEGACY = 'vanter_access_token';

/**
 * Rellena y envía el formulario real de `/saas/login`.
 *
 * No navega al panel: cada prueba decide qué esperar después (éxito o error).
 */
export async function enviarLogin(
  page: Page,
  datos: DatosLogin,
): Promise<void> {
  await page.goto('/saas/login');
  await expect(
    page.getByRole('heading', { name: 'Inicia sesión en tu empresa' }),
  ).toBeVisible();

  await page.getByLabel('Slug de la empresa').fill(datos.empresaSlug);
  await page.getByLabel('Correo electrónico').fill(datos.correo);
  await page.getByLabel('Contraseña').fill(datos.password);

  if (datos.contexto === 'cliente') {
    await page.getByRole('radio', { name: /Cliente/ }).check();
  }

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Inicia sesión y espera el panel de la empresa (`/saas/inicio`). */
export async function iniciarSesion(
  page: Page,
  datos: DatosLogin,
): Promise<void> {
  await enviarLogin(page, datos);
  // Margen para el primer render tras el login en un `ng serve` recién
  // arrancado (los chunks diferidos se compilan en la primera visita).
  await expect(page).toHaveURL(/\/saas\/inicio$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** JWT tenant guardado por la SPA (solo se usa para el replay del paso 8). */
export async function tokenSaas(page: Page): Promise<string> {
  const token = await page.evaluate(
    (clave) => sessionStorage.getItem(clave),
    CLAVE_TOKEN_SAAS,
  );
  expect(token, `La SPA no guardó ${CLAVE_TOKEN_SAAS}`).not.toBeNull();
  return token as string;
}
