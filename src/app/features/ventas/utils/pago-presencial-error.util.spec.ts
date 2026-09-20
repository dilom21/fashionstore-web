import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorPagoPresencial } from './pago-presencial-error.util';

function http(status: number, detail?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: detail === undefined ? null : { detail },
  });
}

describe('traducirErrorPagoPresencial (CU21)', () => {
  it('401 indica sesión expirada', () => {
    const error = traducirErrorPagoPresencial(http(401));
    expect(error.sesionExpirada).toBe(true);
    expect(error.mensaje).toBe('Tu sesión expiró. Inicia sesión nuevamente.');
  });

  it('403 indica falta de permiso', () => {
    const error = traducirErrorPagoPresencial(http(403));
    expect(error.sinPermiso).toBe(true);
    expect(error.mensaje).toBe('No tienes permiso para registrar este pago.');
  });

  it('404 indica que la venta ya no está disponible', () => {
    const error = traducirErrorPagoPresencial(http(404));
    expect(error.ventaNoDisponible).toBe(true);
    expect(error.mensaje).toBe('La venta ya no está disponible.');
  });

  it('422 indica método inválido', () => {
    const error = traducirErrorPagoPresencial(http(422));
    expect(error.metodoInvalido).toBe(true);
    expect(error.mensaje).toBe('El método de pago no es válido.');
  });

  it('0 indica fallo de red', () => {
    const error = traducirErrorPagoPresencial(http(0));
    expect(error.mensaje).toContain('No se pudo conectar con el servidor');
  });

  it('409 de pago aprobado indica que ya fue pagada', () => {
    const error = traducirErrorPagoPresencial(
      http(409, 'La venta ya tiene un pago aprobado'),
    );
    expect(error.yaPagada).toBe(true);
    expect(error.mensaje).toBe('Esta venta ya fue pagada o confirmada.');
  });

  it('409 de estado inválido indica que ya fue pagada', () => {
    const error = traducirErrorPagoPresencial(
      http(409, 'La venta no esta pendiente de pago'),
    );
    expect(error.yaPagada).toBe(true);
    expect(error.mensaje).toBe('Esta venta ya fue pagada o confirmada.');
  });

  it('409 de stock indica que el stock cambió', () => {
    const error = traducirErrorPagoPresencial(
      http(409, 'No hay stock suficiente para confirmar la venta'),
    );
    expect(error.stockCambio).toBe(true);
    expect(error.mensaje).toBe('El stock cambió antes del pago. Revisa la venta.');
  });

  it('409 de confirmación indica que no se pudo confirmar', () => {
    const error = traducirErrorPagoPresencial(
      http(409, 'No fue posible confirmar la venta'),
    );
    expect(error.noConfirmada).toBe(true);
    expect(error.mensaje).toBe('No fue posible confirmar la venta.');
  });

  it('409 de venta no presencial se informa sin marcarla pagada', () => {
    const error = traducirErrorPagoPresencial(
      http(409, 'La venta no es presencial: no corresponde a este endpoint'),
    );
    expect(error.yaPagada).toBe(false);
    expect(error.mensaje).toContain('no es presencial');
  });

  it('5xx indica servicio no disponible', () => {
    const error = traducirErrorPagoPresencial(http(500));
    expect(error.mensaje).toContain('El servicio no está disponible');
  });

  it('errores desconocidos no exponen detalles crudos', () => {
    const error = traducirErrorPagoPresencial(
      new HttpErrorResponse({ status: 418, statusText: 'I am a teapot' }),
    );
    expect(error.mensaje).toBe(
      'No fue posible registrar el pago. Intenta nuevamente.',
    );
  });
});
