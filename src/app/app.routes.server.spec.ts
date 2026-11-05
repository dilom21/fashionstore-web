import { RenderMode, ServerRoute } from '@angular/ssr';

import { environment } from '../environments/environment';
import {
  rutasServidorLegacy,
  rutasServidorSaas,
  serverRoutes,
} from './app.routes.server';

/** Busca la primera ruta del conjunto que coincide con el path indicado. */
function primeraCoincidencia(rutas: ServerRoute[], path: string): ServerRoute {
  const encontrada = rutas.find((ruta) => coincide(ruta.path, path));
  if (encontrada === undefined) {
    throw new Error(`Ninguna ServerRoute coincide con «${path}»`);
  }
  return encontrada;
}

/** `true` si el patrón de `ServerRoute` cubre el path dado (orden real). */
function coincide(patron: string, path: string): boolean {
  if (patron === '**') {
    return true;
  }
  if (patron.endsWith('/**')) {
    const prefijo = patron.slice(0, -3);
    return path === prefijo || path.startsWith(`${prefijo}/`);
  }
  return patron === path;
}

describe('serverRoutes', () => {
  describe('modo SaaS', () => {
    it('renderiza en servidor solo las rutas públicas', () => {
      expect(primeraCoincidencia(rutasServidorSaas, 'saas/login').renderMode).toBe(
        RenderMode.Server,
      );
      expect(
        primeraCoincidencia(rutasServidorSaas, 'saas/invitacion').renderMode,
      ).toBe(RenderMode.Server);
    });

    it('renderiza el panel autenticado en cliente (guards con sessionStorage)', () => {
      for (const ruta of [
        'saas/inicio',
        'saas/catalogo',
        'saas/ventas-contado',
        'saas/personal',
        'saas/devoluciones',
      ]) {
        expect(primeraCoincidencia(rutasServidorSaas, ruta).renderMode).toBe(
          RenderMode.Client,
        );
      }
    });

    it('el orden deja las rutas públicas antes del comodín saas/**', () => {
      expect(rutasServidorSaas.map((ruta) => ruta.path)).toEqual([
        'saas/login',
        'saas/invitacion',
        'saas/**',
        '**',
      ]);
    });

    it('el comodín raíz sigue renderizándose en servidor', () => {
      expect(primeraCoincidencia(rutasServidorSaas, '/').renderMode).toBe(
        RenderMode.Server,
      );
      expect(primeraCoincidencia(rutasServidorSaas, 'otra-ruta').renderMode).toBe(
        RenderMode.Server,
      );
    });
  });

  describe('modo legacy', () => {
    it('el comodín es Prerender y no declara ninguna ruta saas/*', () => {
      expect(rutasServidorLegacy.some((ruta) => ruta.path === '**')).toBe(true);
      expect(primeraCoincidencia(rutasServidorLegacy, '/').renderMode).toBe(
        RenderMode.Prerender,
      );
      expect(
        rutasServidorLegacy.filter((ruta) => ruta.path.startsWith('saas')),
      ).toEqual([]);
    });

    it('mantiene las rutas privadas renderizadas por petición', () => {
      expect(
        primeraCoincidencia(rutasServidorLegacy, 'personal/ventas/presencial')
          .renderMode,
      ).toBe(RenderMode.Server);
      expect(
        primeraCoincidencia(rutasServidorLegacy, 'admin/dashboard').renderMode,
      ).toBe(RenderMode.Server);
    });

    it('conserva exactamente el conjunto histórico', () => {
      expect(rutasServidorLegacy.map((ruta) => ruta.path)).toEqual([
        'dashboard',
        'admin/**',
        'auth/personal/login',
        'personal/**',
        'catalogo/**',
        'carritos',
        'carritos/**',
        'reservas',
        'reservas/**',
        'checkout/**',
        'pagos/**',
        'ventas/**',
        '**',
      ]);
    });
  });

  describe('selección por modo compilado', () => {
    it('usa el conjunto del modo activo en el bundle de pruebas', () => {
      // El entorno de pruebas compila `environment.ts` (modo legacy).
      expect(environment.saasMode).toBe(false);
      expect(serverRoutes).toBe(rutasServidorLegacy);
    });
  });
});
