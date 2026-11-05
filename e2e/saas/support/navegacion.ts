import { Page, expect } from '@playwright/test';

/**
 * Navegación dentro de la SPA del modo SaaS.
 *
 * El panel autenticado se renderiza en CLIENTE (`saas/**` → `RenderMode.Client`
 * en `app.routes.server.ts`), igual que en producción: las URLs profundas ya no
 * rebotan a `/saas/login`. Los escenarios navegan por el menú lateral porque es
 * el camino que recorre una persona; las pruebas que necesitan una carga
 * completa (recarga, URL directa) la hacen explícitamente con `page.goto`.
 */
export async function irA(page: Page, etiqueta: string): Promise<void> {
  const menu = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: etiqueta, exact: true }).click();
}
