import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorReservasSucursal } from './reservas-sucursal-error.util';

function errorHttp(status: number): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'error' });
}

describe('traducirErrorReservasSucursal (CU17)', () => {
  it('401 indica sesión expirada', () => {
    const error = traducirErrorReservasSucursal(errorHttp(401));
    expect(error.sesionExpirada).toBe(true);
    expect(error.mensaje).toContain('sesión');
  });

  it('403 explica rol o sucursal fuera de alcance', () => {
    const error = traducirErrorReservasSucursal(errorHttp(403));
    expect(error.sesionExpirada).toBe(false);
    expect(error.mensaje).toContain('permisos');
  });

  it('404 indica que la reserva ya no existe', () => {
    const error = traducirErrorReservasSucursal(errorHttp(404));
    expect(error.mensaje).toContain('ya no existe');
  });

  it('409 avisa de una transición de estado inválida', () => {
    const error = traducirErrorReservasSucursal(errorHttp(409));
    expect(error.mensaje).toContain('estado actual');
  });

  it('422 pide revisar los filtros', () => {
    const error = traducirErrorReservasSucursal(errorHttp(422));
    expect(error.mensaje).toContain('filtros');
  });

  it('0 (sin conexión) y 5xx tienen mensajes genéricos sin detalles internos', () => {
    expect(traducirErrorReservasSucursal(errorHttp(0)).mensaje).toContain(
      'conectar',
    );
    const error500 = traducirErrorReservasSucursal(errorHttp(500));
    expect(error500.mensaje).toContain('no está disponible');
    expect(error500.mensaje).not.toContain('SQL');
    expect(traducirErrorReservasSucursal({}).mensaje).toContain(
      'No se pudo completar',
    );
  });
});
