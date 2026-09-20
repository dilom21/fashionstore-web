import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorPagoElectronico } from './pago-electronico-error.util';

function errorHttp(status: number, detail?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'error',
    error: detail !== undefined ? { detail } : null,
  });
}

describe('traducirErrorPagoElectronico (CU22)', () => {
  it('401 marca la sesión como expirada', () => {
    const r = traducirErrorPagoElectronico(errorHttp(401));
    expect(r.sesionExpirada).toBe(true);
    expect(r.mensaje.toLowerCase()).toContain('sesión');
  });

  it('403 indica que la venta es ajena', () => {
    const r = traducirErrorPagoElectronico(errorHttp(403));
    expect(r.ventaAjena).toBe(true);
    expect(r.mensaje.toLowerCase()).toContain('otro cliente');
  });

  it('404 indica venta/pago no encontrado', () => {
    const r = traducirErrorPagoElectronico(errorHttp(404));
    expect(r.ventaNoEncontrada).toBe(true);
  });

  it('409 indica que la venta no es pagable', () => {
    const r = traducirErrorPagoElectronico(
      errorHttp(409, 'No fue posible procesar el pago electronico'),
    );
    expect(r.ventaNoPagable).toBe(true);
  });

  it('422 marca la petición como inválida', () => {
    const r = traducirErrorPagoElectronico(errorHttp(422));
    expect(r.requestInvalido).toBe(true);
  });

  it('0 (red) devuelve un mensaje de conexión', () => {
    const r = traducirErrorPagoElectronico(errorHttp(0));
    expect(r.mensaje.toLowerCase()).toContain('conectar');
  });

  it('5xx/502 marcan el servicio como no disponible', () => {
    expect(traducirErrorPagoElectronico(errorHttp(500)).servicioNoDisponible).toBe(
      true,
    );
    expect(traducirErrorPagoElectronico(errorHttp(502)).servicioNoDisponible).toBe(
      true,
    );
  });

  it('errores no HTTP devuelven un mensaje amigable', () => {
    const r = traducirErrorPagoElectronico(new Error('boom'));
    expect(r.mensaje.length).toBeGreaterThan(10);
    expect(r.sesionExpirada).toBe(false);
  });

  it('nunca filtra texto técnico del backend', () => {
    const r = traducirErrorPagoElectronico(
      errorHttp(409, 'violates check constraint pago_estado_check'),
    );
    expect(r.mensaje).not.toMatch(/constraint|pago_estado_check|select|sql/i);
  });
});
