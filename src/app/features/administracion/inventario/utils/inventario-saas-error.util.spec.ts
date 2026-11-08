import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorInventarioSaas } from './inventario-saas-error.util';

function error(status: number): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { detail: 'detalle' } });
}

/**
 * CU08: los errores de los endpoints empresariales no pueden convertirse en
 * listas vacías "válidas" ni expulsar al usuario salvo por un 401 real.
 */
describe('traducirErrorInventarioSaas', () => {
  it('401: sesión empresarial inválida o expirada (sí cierra sesión)', () => {
    const resultado = traducirErrorInventarioSaas(error(401), 'inventario');

    expect(resultado.sesionExpirada).toBe(true);
    expect(resultado.mensaje).toContain('sesión empresarial');
  });

  it('403: rol sin autorización, sin cerrar la sesión', () => {
    const resultado = traducirErrorInventarioSaas(error(403), 'movimientos');

    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje).toContain('no tiene autorización');
    expect(resultado.mensaje).toContain('los movimientos de inventario');
  });

  it('404: sucursal o recurso inexistente', () => {
    const resultado = traducirErrorInventarioSaas(error(404), 'inventario');

    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje).toContain('no existe en tu empresa');
  });

  it('422: parámetros o filtros inválidos', () => {
    const resultado = traducirErrorInventarioSaas(error(422), 'filtros');

    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje).toContain('no son válidos');
  });

  it('503: servicio empresarial no disponible y NO se cierra la sesión', () => {
    const resultado = traducirErrorInventarioSaas(error(503), 'inventario');

    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje).toContain('no está disponible');
  });

  it('error de conexión (status 0)', () => {
    const resultado = traducirErrorInventarioSaas(error(0), 'inventario');

    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje).toContain('conectarnos');
  });

  it('5xx distinto de 503 se informa como servicio no disponible', () => {
    const resultado = traducirErrorInventarioSaas(error(500), 'inventario');

    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje).toContain('no está disponible');
  });

  it('error desconocido: mensaje genérico sin cerrar sesión', () => {
    const resultado = traducirErrorInventarioSaas(new Error('boom'), 'inventario');

    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje).toContain('Inténtalo nuevamente');
  });
});
