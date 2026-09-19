import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorReserva } from './reserva-error.util';

function errorHttp(status: number): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'error' });
}

describe('traducirErrorReserva (CU16)', () => {
  it('401 marca la sesión como expirada', () => {
    const resultado = traducirErrorReserva(errorHttp(401));
    expect(resultado.sesionExpirada).toBe(true);
    expect(resultado.mensaje.toLowerCase()).toContain('sesión');
  });

  it('403 informa falta de permisos sin cerrar sesión', () => {
    const resultado = traducirErrorReserva(errorHttp(403));
    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje.toLowerCase()).toContain('permisos');
  });

  it('404 sugiere volver al carrito y no filtra detalles internos', () => {
    const resultado = traducirErrorReserva(errorHttp(404));
    expect(resultado.volverAlCarrito).toBe(true);
    expect(resultado.mensaje).not.toMatch(/select|sql|traceback|postgres/i);
  });

  it('409 explica el conflicto del carrito y permite volver a él', () => {
    const resultado = traducirErrorReserva(errorHttp(409));
    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.volverAlCarrito).toBe(true);
    expect(resultado.mensaje.toLowerCase()).toContain('carrito');
  });

  it('422 apunta a la fecha y hora de atención', () => {
    const resultado = traducirErrorReserva(errorHttp(422));
    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje.toLowerCase()).toContain('fecha');
  });

  it('errores de red y desconocidos devuelven un mensaje amigable', () => {
    expect(traducirErrorReserva(errorHttp(0)).mensaje.length).toBeGreaterThan(
      10,
    );
    expect(traducirErrorReserva(errorHttp(500)).mensaje.length).toBeGreaterThan(
      10,
    );
    expect(traducirErrorReserva(new Error('boom')).mensaje.length).toBeGreaterThan(
      10,
    );
  });
});
