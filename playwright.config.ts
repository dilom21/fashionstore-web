import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de las pruebas E2E de navegador (etapa 5BZ).
 *
 * No se declara `webServer` a propósito: los servidores los arranca y los
 * detiene `database/saas/123_e2e_navegador_5bz.py` del repo del backend, que
 * usa el lanzador seguro `119_servidor_saas_local_5by.py` (inyecta el `.env`
 * sintético del staging local y rechaza cualquier destino no loopback).
 *
 * - Proyecto `saas`   → build Angular `saas-local` (puerto 4200 por defecto).
 * - Proyecto `legacy` → build Angular por defecto (puerto 4201).
 *
 * El backend solo permite CORS desde `http://localhost:4200` y
 * `http://127.0.0.1:4200`, por eso la baseURL del proyecto `saas` usa el
 * loopback numérico.
 *
 * Navegador: Microsoft Edge instalado en la máquina (`channel: 'msedge'`), para
 * no descargar binarios de Playwright.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  forbidOnly: true,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.E2E_JSON ?? 'e2e-results.json' }],
  ],
  projects: [
    {
      name: 'saas',
      testMatch: 'saas/**/*.spec.ts',
      use: {
        baseURL:
          process.env.E2E_SAAS_BASE_URL ?? 'http://127.0.0.1:4200',
        channel: 'msedge',
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        ...devices['Desktop Edge'],
      },
    },
    {
      name: 'legacy',
      testMatch: 'legacy/**/*.spec.ts',
      use: {
        baseURL:
          process.env.E2E_LEGACY_BASE_URL ?? 'http://127.0.0.1:4201',
        channel: 'msedge',
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        ...devices['Desktop Edge'],
      },
    },
  ],
});
