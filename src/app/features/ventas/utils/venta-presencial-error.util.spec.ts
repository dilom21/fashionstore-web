import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorVentaPresencial } from './venta-presencial-error.util';

function http(status: number, detail?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: detail ? { detail } : null,
  });
}

describe('traducirErrorVentaPresencial (CU20)', () => {
  it('401: sesión expirada', () => {
    const error = traducirErrorVentaPresencial(http(401));
    expect(error.sesionExpirada).toBe(true);
    expect(error.mensaje).toContain('sesión');
  });

  it('403: sin permiso para registrar la venta', () => {
    const error = traducirErrorVentaPresencial(http(403));
    expect(error.sinPermiso).toBe(true);
    expect(error.mensaje).toBe('No tienes permiso para registrar esta venta.');
  });

  it('404 de reserva: la reserva ya no puede venderse', () => {
    const error = traducirErrorVentaPresencial(
      http(404, 'Reserva no encontrada'),
    );
    expect(error.reservaNoDisponible).toBe(true);
    expect(error.mensaje).toBe('La reserva ya no puede venderse.');
  });

  it('404 de inventario: el inventario ya no está disponible', () => {
    const error = traducirErrorVentaPresencial(
      http(404, 'Uno de los recursos de la venta no existe'),
    );
    expect(error.volverAlCatalogo).toBe(true);
    expect(error.mensaje).toBe('El inventario ya no está disponible.');
  });

  it('409 de sucursal: una sola sucursal por venta', () => {
    const error = traducirErrorVentaPresencial(
      http(409, 'El inventario no pertenece a la sucursal'),
    );
    expect(error.sucursalMultiple).toBe(true);
    expect(error.mensaje).toBe(
      'Los productos deben pertenecer a una sola sucursal.',
    );
  });

  it('409 de stock: el stock cambió', () => {
    const error = traducirErrorVentaPresencial(
      http(409, 'Stock insuficiente para la venta'),
    );
    expect(error.stockCambio).toBe(true);
    expect(error.mensaje).toBe('El stock cambió. Revisa las cantidades.');
  });

  it('409 genérico: no fue posible registrar la venta', () => {
    const error = traducirErrorVentaPresencial(
      http(409, 'No fue posible registrar la venta presencial'),
    );
    expect(error.volverAlCatalogo).toBe(true);
    expect(error.mensaje).toBe(
      'No fue posible registrar la venta. Revisa las cantidades.',
    );
  });

  it('422: datos inválidos', () => {
    const error = traducirErrorVentaPresencial(http(422));
    expect(error.mensaje).toContain('no son válidos');
  });

  it('error de red (status 0)', () => {
    const error = traducirErrorVentaPresencial(http(0));
    expect(error.mensaje).toContain('conexión');
  });

  it('5xx: servicio no disponible', () => {
    const error = traducirErrorVentaPresencial(http(503));
    expect(error.mensaje).toContain('servicio');
  });

  it('error no HTTP: mensaje genérico de negocio', () => {
    const error = traducirErrorVentaPresencial(new Error('boom'));
    expect(error.mensaje).toBe(
      'No fue posible registrar la venta. Intenta nuevamente.',
    );
  });
});
