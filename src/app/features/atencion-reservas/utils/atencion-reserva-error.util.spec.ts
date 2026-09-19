import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorAtencionReserva } from './atencion-reserva-error.util';

function errorHttp(status: number): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'error' });
}

describe('traducirErrorAtencionReserva (CU18)', () => {
  it('401 indica sesión expirada', () => {
    const error = traducirErrorAtencionReserva(errorHttp(401));
    expect(error.sesionExpirada).toBe(true);
    expect(error.mensaje).toContain('sesión');
  });

  it('403 explica rol no autorizado o sucursal distinta', () => {
    const error = traducirErrorAtencionReserva(errorHttp(403));
    expect(error.sesionExpirada).toBe(false);
    expect(error.mensaje).toContain('otra sucursal');
  });

  it('404 y 409 marcan la reserva como no disponible', () => {
    expect(traducirErrorAtencionReserva(errorHttp(404)).reservaNoDisponible).toBe(
      true,
    );
    const conflicto = traducirErrorAtencionReserva(errorHttp(409));
    expect(conflicto.reservaNoDisponible).toBe(true);
    expect(conflicto.mensaje).toBe(
      'La reserva ya no se encuentra disponible para esta operación.',
    );
  });

  it('422 pide revisar la selección', () => {
    const error = traducirErrorAtencionReserva(errorHttp(422));
    expect(error.mensaje).toContain('selección');
  });

  it('0 (sin conexión), 5xx y desconocidos no filtran detalles internos', () => {
    expect(traducirErrorAtencionReserva(errorHttp(0)).mensaje).toContain(
      'conectar',
    );
    const error500 = traducirErrorAtencionReserva(errorHttp(500));
    expect(error500.mensaje).toContain('no está disponible');
    expect(error500.mensaje).not.toContain('SQL');
    expect(traducirErrorAtencionReserva({}).mensaje).toContain(
      'No se pudo completar',
    );
  });
});
